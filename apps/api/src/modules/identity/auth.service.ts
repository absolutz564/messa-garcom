import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { schema, type DbHandle, type Tx } from '@messa/db';
import type { AccessTokenClaims, LoginResponse, MembershipSummary, Role, Signup } from '@messa/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config';
import { hashPassword } from '../../common/password';
import { DB } from '../db/db.module';
import { OutboxService } from '../events/outbox.service';
import { AcquisitionService } from '../acquisition/acquisition.service';
import { PlatformService } from '../platform/platform.service';
import { EmailService } from './email.service';
import { TotpService } from './totp.service';

export interface IssuedTokens {
  response: LoginResponse;
  refreshCookie: string;
  refreshExpiresAt: Date;
}

/** BR-22: janela curta — o link chega por e-mail e é usado na hora. */
const PASSWORD_RESET_TTL_MS = 60 * 60_000;

/**
 * ADR-004. Access token curto + refresh opaco rotativo por dispositivo (StaffDevice).
 * Refresh cookie = `${userId}.${deviceId}.${secret}`; só o hash do secret é persistido.
 */
@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: DbHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly outbox: OutboxService,
    private readonly totp: TotpService,
    private readonly platform: PlatformService,
    private readonly email: EmailService,
    private readonly acquisition: AcquisitionService,
  ) {}

  /** Mantido por compatibilidade; a implementação vive em `common/password` (sem ciclo). */
  static hashPassword(password: string) {
    return hashPassword(password);
  }

  /**
   * BR-21/RF-06 — cadastro self-service: cria restaurante + admin e já devolve a sessão.
   * O login logo em seguida é o mesmo do fluxo normal (nada de emissão paralela de token).
   */
  async signup(input: Signup, cookieHeader?: string): Promise<IssuedTokens> {
    const tenant = await this.platform.signup({
      restaurantName: input.restaurantName,
      adminName: input.adminName,
      email: input.email,
      password: input.password,
    });
    // RF-07: a origem só existe nos cookies desta requisição — depois do cadastro
    // não há como recuperá-la. Falha aqui nunca derruba a conta recém-criada.
    await this.acquisition.registrarCadastro(tenant.id, this.acquisition.origemDoCabecalho(cookieHeader));
    return this.login(input.email, input.password);
  }

  async login(email: string, password: string, tenantId?: string, totpCode?: string): Promise<IssuedTokens> {
    const user = await this.db.withGlobalTx(async (tx) => {
      const [u] = await tx.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
      return u ?? null;
    });
    // Mesma mensagem para e-mail inexistente e senha errada (sem enumeração).
    if (!user?.passwordHash || !(await verify(user.passwordHash, password))) {
      throw new UnauthorizedException({ code: 'invalid_credentials', message: 'E-mail ou senha inválidos' });
    }

    // 2FA: quem tem TOTP ativo precisa do código (platform admin é obrigado a ativar).
    const mfa = this.totp.verify(user, totpCode);
    if (mfa === false) throw new UnauthorizedException({ code: totpCode ? 'totp_invalid' : 'totp_required', message: totpCode ? 'Código inválido' : 'Informe o código do aplicativo autenticador' });

    const memberships = await this.loadMemberships(user.id);
    const active = this.pickActive(memberships, tenantId);
    return this.issue(user, memberships, active, null);
  }

  /**
   * BR-22 — pedido de redefinição de senha.
   *
   * Sempre resolve sem erro, mesmo com e-mail inexistente: responder diferente
   * transformaria este endpoint público num verificador de "quem tem conta na Messa"
   * (mesma razão pela qual o login usa uma mensagem só para e-mail errado e senha errada).
   */
  async requestPasswordReset(email: string): Promise<void> {
    const token = randomBytes(24).toString('base64url');
    const normalized = email.toLowerCase();
    const user = await this.db.withGlobalTx(async (tx) => {
      const [u] = await tx.select().from(schema.users).where(eq(schema.users.email, normalized));
      if (!u) return null;
      await tx
        .update(schema.users)
        .set({ passwordResetTokenHash: sha256(token), passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) })
        .where(eq(schema.users.id, u.id));
      return u;
    });
    if (!user) return;

    const url = `${this.config.WEB_PUBLIC_URL}/staff/redefinir-senha?token=${token}`;
    this.log.log(`redefinição de senha para ${normalized}: ${url}`);
    await this.email.send(this.email.passwordResetEmail(normalized, user.name, url, PASSWORD_RESET_TTL_MS / 3_600_000));
  }

  /**
   * BR-22 — consome o token e troca a senha. Revoga todos os dispositivos: se o pedido
   * partiu de quem perdeu o acesso, quem estava logado indevidamente cai junto.
   */
  async resetPassword(token: string, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    // `withPlatformTx`, e não `withGlobalTx`, por causa do RLS de `staff_devices`
    // (política `tenant_or_self`): sem contexto, o UPDATE casa com zero linhas e a
    // revogação falha em silêncio — o e2e pegou isso. Mesmo padrão do `acceptInvite`,
    // que também é um fluxo público por token e precisa escrever sem tenant ativo.
    await this.db.withPlatformTx(async (tx) => {
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.passwordResetTokenHash, sha256(token)));
      if (!user || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
        throw new BadRequestException({ code: 'reset_invalid', message: 'Link inválido ou expirado. Peça um novo.' });
      }
      await tx
        .update(schema.users)
        .set({ passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null })
        .where(eq(schema.users.id, user.id));
      await tx.update(schema.staffDevices).set({ revokedAt: new Date() }).where(eq(schema.staffDevices.userId, user.id));
    });
  }

  async refresh(cookieValue: string | undefined): Promise<IssuedTokens> {
    const parts = cookieValue?.split('.');
    if (!parts || parts.length !== 3) throw new UnauthorizedException({ code: 'refresh_invalid' });
    const [userId, deviceId, secret] = parts as [string, string, string];

    return this.db.withUserTx(userId, async (tx) => {
      const [device] = await tx
        .select()
        .from(schema.staffDevices)
        .where(and(eq(schema.staffDevices.id, deviceId), eq(schema.staffDevices.userId, userId)))
        .for('update');
      if (!device || device.revokedAt || device.expiresAt < new Date()) {
        throw new UnauthorizedException({ code: 'refresh_invalid' });
      }
      if (device.refreshTokenHash !== sha256(secret)) {
        // Reuso de token antigo ⇒ família comprometida: revoga todos da família.
        await tx
          .update(schema.staffDevices)
          .set({ revokedAt: new Date() })
          .where(eq(schema.staffDevices.family, device.family));
        throw new UnauthorizedException({ code: 'refresh_reused' });
      }
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
      if (!user) throw new UnauthorizedException({ code: 'refresh_invalid' });

      const memberships = await this.loadMemberships(userId, tx);
      const active = this.pickActive(memberships, device.tenantId ?? undefined);
      return this.issue(user, memberships, active, device, tx);
    });
  }

  async logout(cookieValue: string | undefined): Promise<void> {
    const parts = cookieValue?.split('.');
    if (!parts || parts.length !== 3) return;
    const [userId, deviceId] = parts as [string, string, string];
    await this.db.withUserTx(userId, async (tx) => {
      await tx
        .update(schema.staffDevices)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.staffDevices.id, deviceId), eq(schema.staffDevices.userId, userId)));
    });
  }

  async switchTenant(userId: string, tenantId: string, refreshCookie: string | undefined): Promise<IssuedTokens> {
    const memberships = await this.loadMemberships(userId);
    const active = memberships.find((m) => m.tenantId === tenantId);
    if (!active) throw new UnauthorizedException({ code: 'no_membership' });
    // Reemite tokens ligados ao novo tenant no mesmo dispositivo.
    const parts = refreshCookie?.split('.');
    const deviceId = parts?.length === 3 ? parts[1] : undefined;
    return this.db.withUserTx(userId, async (tx) => {
      const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId));
      if (!user) throw new UnauthorizedException();
      let device = null;
      if (deviceId) {
        [device] = await tx.select().from(schema.staffDevices).where(eq(schema.staffDevices.id, deviceId));
      }
      return this.issue(user, memberships, active, device ?? null, tx);
    });
  }

  // ---------------------------------------------------------------------

  private async loadMemberships(userId: string, tx?: Tx): Promise<MembershipSummary[]> {
    const run = async (t: Tx) =>
      t
        .select({
          tenantId: schema.memberships.tenantId,
          tenantName: schema.tenants.name,
          tenantSlug: schema.tenants.slug,
          tenantStatus: schema.tenants.status,
          role: schema.memberships.role,
        })
        .from(schema.memberships)
        .innerJoin(schema.tenants, eq(schema.tenants.id, schema.memberships.tenantId))
        .where(and(eq(schema.memberships.userId, userId), eq(schema.memberships.status, 'active')));
    const rows = tx ? await run(tx) : await this.db.withUserTx(userId, run);
    return rows
      .filter((r) => r.tenantStatus === 'active')
      .map((r) => ({ tenantId: r.tenantId, tenantName: r.tenantName, tenantSlug: r.tenantSlug, role: r.role as Role }));
  }

  private pickActive(memberships: MembershipSummary[], tenantId?: string): MembershipSummary | null {
    if (tenantId) {
      const m = memberships.find((x) => x.tenantId === tenantId);
      if (!m) throw new UnauthorizedException({ code: 'no_membership' });
      return m;
    }
    return memberships.length === 1 ? memberships[0]! : null;
  }

  private async issue(
    user: typeof schema.users.$inferSelect,
    memberships: MembershipSummary[],
    active: MembershipSummary | null,
    existingDevice: typeof schema.staffDevices.$inferSelect | null,
    tx?: Tx,
  ): Promise<IssuedTokens> {
    if (!active && !user.isPlatformAdmin && memberships.length === 0) {
      throw new UnauthorizedException({ code: 'no_membership', message: 'Usuário sem acesso a nenhum restaurante' });
    }

    const secret = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    const deviceId = existingDevice?.id ?? uuidv7();
    const family = existingDevice?.family ?? uuidv7();

    const persist = async (t: Tx) => {
      if (existingDevice) {
        await t
          .update(schema.staffDevices)
          .set({ refreshTokenHash: sha256(secret), lastSeenAt: new Date(), expiresAt, tenantId: active?.tenantId ?? null })
          .where(eq(schema.staffDevices.id, deviceId));
      } else {
        await t.insert(schema.staffDevices).values({
          id: deviceId,
          userId: user.id,
          tenantId: active?.tenantId ?? null,
          family,
          refreshTokenHash: sha256(secret),
          expiresAt,
        });
      }
    };
    if (tx) await persist(tx);
    else await this.db.withUserTx(user.id, persist);

    const claims: AccessTokenClaims = {
      sub: user.id,
      tenant_id: active?.tenantId ?? null,
      role: active?.role ?? null,
      is_platform_admin: user.isPlatformAdmin,
      mfa: Boolean(user.totpEnabledAt),
      jti: uuidv7(),
    };
    const accessToken = await this.jwt.signAsync(claims);

    return {
      response: {
        accessToken,
        expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
        user: { id: user.id, name: user.name, email: user.email },
        activeTenant: active,
        memberships,
        isPlatformAdmin: user.isPlatformAdmin,
        mfa: Boolean(user.totpEnabledAt),
      },
      refreshCookie: `${user.id}.${deviceId}.${secret}`,
      refreshExpiresAt: expiresAt,
    };
  }
}

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}
