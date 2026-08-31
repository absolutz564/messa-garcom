import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { schema, type DbHandle, type Tx } from '@messa/db';
import { cryptoRandomInt, evaluateTenantBilling, RULES, slugify, slugWithSuffix } from '@messa/domain';
import type { CreateTenant, Tenant } from '@messa/contracts';
import { DB } from '../db/db.module';
import { OutboxService } from '../events/outbox.service';
import { hashPassword } from '../../common/password';

/** Super Admin (RF-03). Toda operação roda em withPlatformTx e é auditada via outbox. */
@Injectable()
export class PlatformService {
  constructor(
    @Inject(DB) private readonly db: DbHandle,
    private readonly outbox: OutboxService,
  ) {}

  async list(): Promise<Tenant[]> {
    return this.db.withPlatformTx(async (tx) => {
      const rows = await tx.select().from(schema.tenants).orderBy(desc(schema.tenants.createdAt));
      return rows.map(toDto);
    });
  }

  async create(input: CreateTenant, actorUserId: string): Promise<Tenant> {
    const passwordHash = await hashPassword(input.adminPassword);
    return this.db.withPlatformTx(async (tx) => {
      const [existing] = await tx.select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.slug, input.slug));
      if (existing) throw new ConflictException({ code: 'slug_taken', message: 'Slug já em uso' });

      return this.insertTenantWithAdmin(tx, {
        slug: input.slug,
        name: input.name,
        adminEmail: input.adminEmail,
        adminName: input.adminName,
        passwordHash,
        // RF-72: o Super Admin já verificou a solicitação fora da banda, então pode
        // anexar o novo restaurante a uma conta que já existe.
        reuseExistingUser: true,
        actorUserId,
      });
    });
  }

  /**
   * BR-21/RF-06 — cadastro self-service (público, sem autenticação).
   * Difere de `create` em dois pontos deliberados (ADR-007): slug é gerado a partir do
   * nome (o formulário não pergunta) e e-mail já cadastrado **recusa** em vez de
   * reaproveitar a conta — sem verificação de posse do e-mail, reaproveitar deixaria
   * qualquer visitante anexar uma membership de admin à conta de um estranho.
   */
  async signup(input: { restaurantName: string; adminName: string; email: string; password: string }): Promise<Tenant> {
    const passwordHash = await hashPassword(input.password);
    const email = input.email.toLowerCase();
    return this.db.withPlatformTx(async (tx) => {
      const [existingUser] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email));
      if (existingUser) {
        throw new ConflictException({ code: 'email_in_use', message: 'Este e-mail já tem conta na Messa. Faça login para continuar.' });
      }

      const slug = await this.availableSlug(tx, slugify(input.restaurantName));
      return this.insertTenantWithAdmin(tx, {
        slug,
        name: input.restaurantName,
        adminEmail: email,
        adminName: input.adminName,
        passwordHash,
        reuseExistingUser: false,
        actorUserId: null,
      });
    });
  }

  /** Primeiro slug livre a partir do nome; em colisão, sufixo aleatório (BR-21). */
  private async availableSlug(tx: Tx, base: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 ? base : slugWithSuffix(base, cryptoRandomInt);
      const [taken] = await tx.select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.slug, candidate));
      if (!taken) return candidate;
    }
    throw new ConflictException({ code: 'slug_taken', message: 'Não foi possível gerar um identificador para este nome. Tente outro nome.' });
  }

  /** Núcleo compartilhado pelos dois fluxos de criação (Super Admin e self-service). */
  private async insertTenantWithAdmin(
    tx: Tx,
    input: { slug: string; name: string; adminEmail: string; adminName: string; passwordHash: string; reuseExistingUser: boolean; actorUserId: string | null },
  ): Promise<Tenant> {
    // BR-20: todo tenant novo nasce em teste grátis de 14 dias.
    const trialEndsAt = new Date(Date.now() + RULES.BILLING_TRIAL_DAYS * 86_400_000);
    const [tenant] = await tx.insert(schema.tenants).values({ slug: input.slug, name: input.name, trialEndsAt }).returning();

    const email = input.adminEmail.toLowerCase();
    let user: typeof schema.users.$inferSelect | undefined;
    if (input.reuseExistingUser) {
      [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email));
    }
    if (!user) {
      [user] = await tx.insert(schema.users).values({ email, name: input.adminName, passwordHash: input.passwordHash }).returning();
    }
    await tx.insert(schema.memberships).values({
      tenantId: tenant!.id,
      userId: user!.id,
      role: 'admin',
      status: 'active',
      acceptedAt: new Date(),
    });

    // Áreas de serviço fixas do MVP.
    await tx.insert(schema.serviceAreas).values([
      { tenantId: tenant!.id, key: 'kitchen', name: 'Cozinha' },
      { tenantId: tenant!.id, key: 'bar', name: 'Bar' },
    ]);

    await this.outbox.append(tx, {
      tenantId: tenant!.id,
      type: 'tenant.created',
      aggregateType: 'tenant',
      aggregateId: tenant!.id,
      // No self-service quem criou é o próprio admin recém-criado (BR-17 exige ator).
      actor: { kind: 'staff', id: input.actorUserId ?? user!.id },
      payload: { slug: tenant!.slug, adminUserId: user!.id, selfService: input.actorUserId === null },
    });
    return toDto(tenant!);
  }

  async setStatus(tenantId: string, status: 'active' | 'blocked', actorUserId: string): Promise<Tenant> {
    return this.db.withPlatformTx(async (tx) => {
      const [tenant] = await tx.update(schema.tenants).set({ status }).where(eq(schema.tenants.id, tenantId)).returning();
      if (!tenant) throw new NotFoundException({ code: 'not_found' });
      await this.outbox.append(tx, {
        tenantId,
        type: status === 'blocked' ? 'tenant.blocked' : 'tenant.unblocked',
        aggregateType: 'tenant',
        aggregateId: tenantId,
        actor: { kind: 'staff', id: actorUserId },
      });
      return toDto(tenant);
    });
  }
}

function toDto(t: typeof schema.tenants.$inferSelect): Tenant {
  const billing = evaluateTenantBilling({
    billingStatus: t.billingStatus as 'trial' | 'active',
    trialEndsAt: t.trialEndsAt,
    subscriptionEndsAt: t.subscriptionEndsAt,
  });
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    logoUrl: t.logoUrl,
    primaryColor: t.primaryColor,
    status: t.status as Tenant['status'],
    createdAt: t.createdAt.toISOString(),
    billing: {
      phase: billing.phase,
      daysLeft: billing.daysLeft,
      plan: t.billingPlan as Tenant['billing']['plan'],
      expiresAt: (t.billingStatus === 'trial' ? t.trialEndsAt : t.subscriptionEndsAt)?.toISOString() ?? null,
    },
  };
}
