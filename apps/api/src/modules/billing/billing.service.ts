import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, eq, gt, lt } from 'drizzle-orm';
import { schema, type DbHandle, type Tx } from '@messa/db';
import {
  BILLING_PLANS,
  DEFAULT_BILLING_PLAN,
  DomainError,
  RULES,
  evaluateTenantBilling,
  nextBillingCycleEnd,
  shouldGenerateRenewalCharge,
  type BillingPlan,
} from '@messa/domain';
import type { BillingStatus, PixCharge } from '@messa/contracts';
import { DB } from '../db/db.module';
import { OutboxService } from '../events/outbox.service';
import { PixProviderFactory } from './pix-provider';
import { AcquisitionService, MARCO } from '../acquisition/acquisition.service';

type TenantRow = typeof schema.tenants.$inferSelect;
type ChargeRow = typeof schema.pixCharges.$inferSelect;

/** Cobrança da assinatura do tenant (BR-20/PDR-017/ADR-006). */
@Injectable()
export class BillingService {
  private readonly log = new Logger(BillingService.name);

  constructor(
    @Inject(DB) private readonly db: DbHandle,
    private readonly outbox: OutboxService,
    private readonly providers: PixProviderFactory,
    private readonly acquisition: AcquisitionService,
  ) {}

  // =====================================================================
  // Admin do tenant
  // =====================================================================

  async getStatus(tenantId: string): Promise<BillingStatus> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const tenant = await this.loadTenant(tx, tenantId);
      const [pending] = await tx
        .select()
        .from(schema.pixCharges)
        .where(and(eq(schema.pixCharges.tenantId, tenantId), eq(schema.pixCharges.status, 'pending'), gt(schema.pixCharges.expiresAt, new Date())))
        .orderBy(schema.pixCharges.createdAt);
      return this.statusDto(tenant, pending ?? null);
    });
  }

  async choosePlan(tenantId: string, plan: BillingPlan): Promise<BillingStatus> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      await tx.update(schema.tenants).set({ billingPlan: plan }).where(eq(schema.tenants.id, tenantId));
      const tenant = await this.loadTenant(tx, tenantId);
      return this.statusDto(tenant, null);
    });
  }

  /** Devolve a cobrança pendente ainda válida, ou cria uma (idempotente para a tela). */
  async getOrCreateCharge(tenantId: string): Promise<PixCharge> {
    const provider = this.providers.get(RULES.BILLING_CHARGE_TTL_MIN);
    if (!provider) throw new DomainError('billing_unavailable', 'Cobrança automática não está disponível no momento.');

    return this.db.withTenantTx(tenantId, async (tx) => {
      const [pending] = await tx
        .select()
        .from(schema.pixCharges)
        .where(and(eq(schema.pixCharges.tenantId, tenantId), eq(schema.pixCharges.status, 'pending'), gt(schema.pixCharges.expiresAt, new Date())))
        .orderBy(schema.pixCharges.createdAt);
      if (pending) return chargeDto(pending);

      const tenant = await this.loadTenant(tx, tenantId);
      const plan = (tenant.billingPlan as BillingPlan | null) ?? DEFAULT_BILLING_PLAN;
      const payerEmail = await this.adminEmail(tx, tenantId);
      const row = await this.createCharge(tx, tenant, plan, provider, payerEmail);
      return chargeDto(row);
    });
  }

  /** Pergunta ao provedor se a cobrança caiu; libera quando sim. Chamada pela tela enquanto o QR está aberto. */
  async verifyCharge(tenantId: string, chargeId: string): Promise<PixCharge> {
    const provider = this.providers.get(RULES.BILLING_CHARGE_TTL_MIN);
    if (!provider) throw new DomainError('billing_unavailable', 'Cobrança automática não está disponível no momento.');

    const [row] = await this.db.withTenantTx(tenantId, (tx) => tx.select().from(schema.pixCharges).where(and(eq(schema.pixCharges.id, chargeId), eq(schema.pixCharges.tenantId, tenantId))));
    if (!row) throw new NotFoundException({ code: 'not_found' });
    if (row.status !== 'pending') return chargeDto(row);
    if (row.expiresAt < new Date()) {
      const [expired] = await this.db.withTenantTx(tenantId, (tx) => tx.update(schema.pixCharges).set({ status: 'expired' }).where(eq(schema.pixCharges.id, chargeId)).returning());
      return chargeDto(expired!);
    }

    const paid = await provider.isPaid(row.providerChargeId);
    if (!paid) return chargeDto(row);
    const settled = await this.settle(tenantId, chargeId);
    return chargeDto(settled);
  }

  // =====================================================================
  // Jobs (rodam para todos os tenants — mesmo padrão de session.jobs.ts)
  // =====================================================================

  /** 5 dias antes do vencimento, sem cobrança pendente, gera a próxima sozinho. */
  async generateRenewalCharges(): Promise<number> {
    const provider = this.providers.get(RULES.BILLING_CHARGE_TTL_MIN);
    if (!provider) return 0;
    return this.db.withPlatformTx(async (tx) => {
      const tenants = await tx.select().from(schema.tenants);
      const now = new Date();
      let created = 0;
      for (const tenant of tenants) {
        const [pending] = await tx
          .select({ id: schema.pixCharges.id })
          .from(schema.pixCharges)
          .where(and(eq(schema.pixCharges.tenantId, tenant.id), eq(schema.pixCharges.status, 'pending'), gt(schema.pixCharges.expiresAt, now)));
        const billing = { billingStatus: tenant.billingStatus as 'trial' | 'active', trialEndsAt: tenant.trialEndsAt, subscriptionEndsAt: tenant.subscriptionEndsAt };
        if (!shouldGenerateRenewalCharge(billing, Boolean(pending), now)) continue;
        try {
          await this.createCharge(tx, tenant, (tenant.billingPlan as BillingPlan | null) ?? DEFAULT_BILLING_PLAN, provider, await this.adminEmail(tx, tenant.id));
          created++;
        } catch (err) {
          this.log.error(`falha ao gerar cobrança de renovação para ${tenant.id}: ${(err as Error).message}`);
        }
      }
      return created;
    });
  }

  /** Confirma sozinho toda cobrança pendente — o admin não precisa manter a tela aberta. */
  async confirmPendingCharges(): Promise<number> {
    const provider = this.providers.get(RULES.BILLING_CHARGE_TTL_MIN);
    if (!provider) return 0;
    const pending = await this.db.withPlatformTx((tx) => tx.select().from(schema.pixCharges).where(and(eq(schema.pixCharges.status, 'pending'), gt(schema.pixCharges.expiresAt, new Date()))));
    let confirmed = 0;
    for (const row of pending) {
      try {
        if (await provider.isPaid(row.providerChargeId)) {
          await this.settle(row.tenantId, row.id);
          confirmed++;
        }
      } catch (err) {
        this.log.error(`falha ao verificar cobrança ${row.id}: ${(err as Error).message}`);
      }
    }
    return confirmed;
  }

  async expireStaleCharges(): Promise<number> {
    return this.db.withPlatformTx(async (tx) => {
      const rows = await tx
        .update(schema.pixCharges)
        .set({ status: 'expired' })
        .where(and(eq(schema.pixCharges.status, 'pending'), lt(schema.pixCharges.expiresAt, new Date())))
        .returning({ id: schema.pixCharges.id });
      return rows.length;
    });
  }

  // =====================================================================
  // Internos
  // =====================================================================

  private async loadTenant(tx: Tx, tenantId: string): Promise<TenantRow> {
    const [tenant] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
    if (!tenant) throw new NotFoundException({ code: 'not_found' });
    return tenant;
  }

  private async adminEmail(tx: Tx, tenantId: string): Promise<string> {
    const [row] = await tx
      .select({ email: schema.users.email })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(and(eq(schema.memberships.tenantId, tenantId), eq(schema.memberships.role, 'admin'), eq(schema.memberships.status, 'active')))
      .limit(1);
    return row?.email ?? 'financeiro@messa-garcom.com.br';
  }

  private async createCharge(tx: Tx, tenant: TenantRow, plan: BillingPlan, provider: NonNullable<ReturnType<PixProviderFactory['get']>>, payerEmail: string): Promise<ChargeRow> {
    const amountCents = BILLING_PLANS[plan].priceCents;
    // Referência própria, gerada antes de chamar o provedor: idempotência lá e conciliação depois.
    const reference = `messa-${tenant.id}-${Date.now()}`;
    const charge = await provider.createCharge({ amountCents, description: `Messa — plano ${planLabel(plan)}`, reference, payerEmail });
    const [row] = await tx
      .insert(schema.pixCharges)
      .values({
        tenantId: tenant.id,
        provider: provider.name,
        providerChargeId: charge.providerChargeId,
        plan,
        amountCents,
        qrCode: charge.qrCode,
        qrCodeBase64: charge.qrCodeBase64,
        expiresAt: charge.expiresAt,
      })
      .returning();
    await this.outbox.append(tx, {
      tenantId: tenant.id,
      type: 'billing.charge_created',
      aggregateType: 'tenant',
      aggregateId: tenant.id,
      actor: { kind: 'system' },
      payload: { plan, amountCents, expiresAt: charge.expiresAt.toISOString() },
    });
    return row!;
  }

  /**
   * Marca a cobrança como paga e estende a assinatura. Escrita condicionada a
   * `status: 'pending'`: se a tela aberta e o job de fundo confirmarem juntos, só um
   * encontra a linha pendente — sem isso o mesmo pagamento renderia dois ciclos.
   */
  private async settle(tenantId: string, chargeId: string): Promise<ChargeRow> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const updated = await tx.update(schema.pixCharges).set({ status: 'paid', paidAt: new Date() }).where(and(eq(schema.pixCharges.id, chargeId), eq(schema.pixCharges.status, 'pending'))).returning();
      const [row] = updated.length ? updated : await tx.select().from(schema.pixCharges).where(eq(schema.pixCharges.id, chargeId));
      if (updated.length === 0) return row!;

      const tenant = await this.loadTenant(tx, tenantId);
      const subscriptionEndsAt = nextBillingCycleEnd(row!.plan as BillingPlan, tenant.subscriptionEndsAt, new Date());
      await tx.update(schema.tenants).set({ billingStatus: 'active', subscriptionEndsAt }).where(eq(schema.tenants.id, tenantId));
      // RF-07/BR-23: o marco guarda o primeiro pagamento com o valor, para o
      // relatório saber quanto o canal devolveu. Renovação não conta de novo —
      // contar dividiria o custo por cliente pela metade a cada ciclo.
      await this.acquisition.marcar(tenantId, MARCO.pagou, { value: row!.amountCents / 100, currency: 'BRL' });

      await this.outbox.append(tx, {
        tenantId,
        type: 'billing.paid',
        aggregateType: 'tenant',
        aggregateId: tenantId,
        actor: { kind: 'system' },
        payload: { plan: row!.plan, subscriptionEndsAt: subscriptionEndsAt.toISOString() },
      });
      return row!;
    });
  }

  private statusDto(tenant: TenantRow, pending: ChargeRow | null): BillingStatus {
    const access = evaluateTenantBilling({ billingStatus: tenant.billingStatus as 'trial' | 'active', trialEndsAt: tenant.trialEndsAt, subscriptionEndsAt: tenant.subscriptionEndsAt });
    return {
      phase: access.phase,
      daysLeft: access.daysLeft,
      plan: (tenant.billingPlan as BillingPlan | null) ?? null,
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      subscriptionEndsAt: tenant.subscriptionEndsAt?.toISOString() ?? null,
      pendingCharge: pending ? chargeDto(pending) : null,
    };
  }
}

function chargeDto(row: ChargeRow): PixCharge {
  return {
    id: row.id,
    plan: row.plan as BillingPlan,
    amountCents: row.amountCents,
    status: row.status as PixCharge['status'],
    qrCode: row.qrCode,
    qrCodeBase64: row.qrCodeBase64,
    expiresAt: row.expiresAt.toISOString(),
  };
}

function planLabel(plan: BillingPlan): string {
  return { monthly: 'Mensal', semiannual: 'Semestral', annual: 'Anual' }[plan];
}
