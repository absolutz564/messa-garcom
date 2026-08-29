import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import type { InviteMember, Member, Role } from '@messa/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config';
import { DB } from '../db/db.module';
import { OutboxService } from '../events/outbox.service';
import { AuthService } from './auth.service';
import { EmailService } from './email.service';

const INVITE_TTL_MS = 7 * 86_400_000;

/** Funcionários e convites (RF-70..72). E-mail via Resend quando configurado; o link é sempre retornado ao admin. */
@Injectable()
export class MembersService {
  private readonly log = new Logger(MembersService.name);

  constructor(
    @Inject(DB) private readonly db: DbHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly outbox: OutboxService,
    private readonly email: EmailService,
  ) {}

  list(tenantId: string): Promise<Member[]> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const rows = await tx
        .select({ m: schema.memberships, u: schema.users })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(eq(schema.memberships.tenantId, tenantId))
        .orderBy(asc(schema.users.name));
      return rows.map(({ m, u }) => memberDto(m, u));
    });
  }

  invite(tenantId: string, input: InviteMember, actorUserId: string): Promise<Member & { inviteUrl: string; emailSent: boolean }> {
    const token = randomBytes(24).toString('base64url');
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [tenant] = await tx.select({ name: schema.tenants.name }).from(schema.tenants).where(eq(schema.tenants.id, tenantId));
      const email = input.email.toLowerCase();
      let [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email));
      if (!user) {
        [user] = await tx.insert(schema.users).values({ email, name: input.name, passwordHash: null }).returning();
      }
      const [existing] = await tx
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.userId, user!.id)));
      if (existing) throw new ConflictException({ code: 'already_member', message: 'Usuário já faz parte da equipe' });

      // Usuário com senha (já usa o Messa em outro tenant) entra ativo direto (RF-72).
      const active = Boolean(user!.passwordHash);
      const [m] = await tx
        .insert(schema.memberships)
        .values({
          tenantId,
          userId: user!.id,
          role: input.role,
          status: active ? 'active' : 'invited',
          inviteTokenHash: active ? null : sha256(token),
          acceptedAt: active ? new Date() : null,
        })
        .returning();
      await this.outbox.append(tx, {
        tenantId,
        type: 'membership.created',
        aggregateType: 'membership',
        aggregateId: m!.id,
        actor: { kind: 'staff', id: actorUserId },
        payload: { userId: user!.id, role: input.role },
      });
      const inviteUrl = active ? '' : `${this.config.WEB_PUBLIC_URL}/staff/accept-invite?token=${token}`;
      let emailSent = false;
      if (inviteUrl) {
        this.log.log(`convite para ${email}: ${inviteUrl}`);
        emailSent = await this.email.send(this.email.inviteEmail(email, input.name, tenant?.name ?? 'Messa', input.role, inviteUrl));
      }
      return { ...memberDto(m!, user!), inviteUrl, emailSent };
    });
  }

  /** Público: define senha e ativa a membership. Token válido por 7 dias. */
  acceptInvite(token: string, password: string): Promise<{ email: string }> {
    return this.db.withPlatformTx(async (tx) => {
      const [m] = await tx
        .select({ m: schema.memberships, u: schema.users })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(and(eq(schema.memberships.inviteTokenHash, sha256(token)), eq(schema.memberships.status, 'invited')));
      if (!m || !m.m.invitedAt || Date.now() - m.m.invitedAt.getTime() > INVITE_TTL_MS) {
        throw new BadRequestException({ code: 'invite_invalid', message: 'Convite inválido ou expirado' });
      }
      if (!m.u.passwordHash) {
        await tx.update(schema.users).set({ passwordHash: await AuthService.hashPassword(password) }).where(eq(schema.users.id, m.u.id));
      }
      await tx
        .update(schema.memberships)
        .set({ status: 'active', inviteTokenHash: null, acceptedAt: new Date() })
        .where(eq(schema.memberships.id, m.m.id));
      return { email: m.u.email };
    });
  }

  update(tenantId: string, membershipId: string, input: { role?: Role; status?: 'active' | 'disabled' }, actorUserId: string): Promise<Member> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [target] = await tx.select().from(schema.memberships).where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.id, membershipId)));
      if (!target) throw new NotFoundException({ code: 'not_found' });
      if (target.userId === actorUserId && (input.status === 'disabled' || (input.role && input.role !== 'admin'))) {
        throw new ConflictException({ code: 'self_demotion', message: 'Você não pode remover seu próprio acesso de admin' });
      }
      if (input.status === 'disabled') {
        await tx.update(schema.staffDevices).set({ revokedAt: new Date() }).where(and(eq(schema.staffDevices.tenantId, tenantId), eq(schema.staffDevices.userId, target.userId)));
      }
      const set = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      const [m] = await tx.update(schema.memberships).set(set).where(eq(schema.memberships.id, membershipId)).returning();
      const [u] = await tx.select().from(schema.users).where(eq(schema.users.id, m!.userId));
      return memberDto(m!, u!);
    });
  }

  /** PDR-011: admin revoga dispositivos de um funcionário. */
  revokeDevices(tenantId: string, membershipId: string): Promise<{ revoked: number }> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [target] = await tx.select().from(schema.memberships).where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.id, membershipId)));
      if (!target) throw new NotFoundException({ code: 'not_found' });
      const rows = await tx
        .update(schema.staffDevices)
        .set({ revokedAt: new Date() })
        .where(and(eq(schema.staffDevices.tenantId, tenantId), eq(schema.staffDevices.userId, target.userId)))
        .returning({ id: schema.staffDevices.id });
      return { revoked: rows.length };
    });
  }
}

function memberDto(m: typeof schema.memberships.$inferSelect, u: typeof schema.users.$inferSelect): Member {
  return { id: m.id, userId: u.id, name: u.name, email: u.email, role: m.role as Role, status: m.status as Member['status'] };
}
function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}
