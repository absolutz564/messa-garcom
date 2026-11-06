import { RULES } from './constants';

const DAY_MS = 24 * 60 * 60 * 1000;

export type BillingPlan = 'monthly' | 'semiannual' | 'annual';

/** BR-20/PDR-017 — planos e ciclo de cobrança. Preços em centavos. */
export const BILLING_PLANS: Record<BillingPlan, { priceCents: number; cycleDays: number }> = {
  monthly: { priceCents: 14_900, cycleDays: 30 },
  semiannual: { priceCents: 80_000, cycleDays: 180 },
  annual: { priceCents: 150_000, cycleDays: 365 },
};

/** Plano usado quando o tenant nunca escolheu um explicitamente (BR-20). */
export const DEFAULT_BILLING_PLAN: BillingPlan = 'monthly';

/**
 * Vencimento resultante de uma renovação (BR-20).
 * Estende a partir do vencimento vigente quando ele ainda está no futuro — quem paga
 * adiantado não perde os dias que faltavam.
 */
export function nextBillingCycleEnd(plan: BillingPlan, currentEnd: Date | null, now: Date = new Date()): Date {
  const base = currentEnd && currentEnd > now ? currentEnd : now;
  return new Date(base.getTime() + BILLING_PLANS[plan].cycleDays * DAY_MS);
}

export type BillingPhase = 'trial' | 'active' | 'past_due' | 'blocked';

export interface TenantBillingInput {
  billingStatus: 'trial' | 'active';
  trialEndsAt: Date | null;
  subscriptionEndsAt: Date | null;
}

export interface TenantBillingAccess {
  /** `false` só depois da carência — bloqueia `open_session`/`resume_session` (BR-20). */
  canServeCustomers: boolean;
  phase: BillingPhase;
  /** Dias inteiros até o vencimento; negativo se já passou. `null` quando não há prazo (tenant migrado, BR-20). */
  daysLeft: number | null;
}

/**
 * BR-20 — acesso do tenant, sempre recalculado na leitura (nunca persistido).
 * `trial` usa `trialEndsAt`; `active` usa `subscriptionEndsAt`. Sem prazo (tenant
 * migrado antes deste controle existir) ⇒ nunca bloqueia — mesma proteção que o
 * `evaluateAccess` do Terap-IA Kids aplica a organizações anteriores ao controle.
 */
export function evaluateTenantBilling(t: TenantBillingInput, now: Date = new Date()): TenantBillingAccess {
  const deadline = t.billingStatus === 'trial' ? t.trialEndsAt : t.subscriptionEndsAt;
  if (!deadline) return { canServeCustomers: true, phase: 'active', daysLeft: null };

  const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / DAY_MS);
  if (now <= deadline) return { canServeCustomers: true, phase: t.billingStatus, daysLeft };

  const graceEnd = new Date(deadline.getTime() + RULES.BILLING_GRACE_DAYS * DAY_MS);
  if (now <= graceEnd) return { canServeCustomers: true, phase: 'past_due', daysLeft };

  return { canServeCustomers: false, phase: 'blocked', daysLeft };
}

/*
 * `shouldGenerateRenewalCharge` viveu aqui e foi removida com PDR-024.
 *
 * Ela decidia quando o job criava a próxima cobrança. Perguntava se a janela de
 * renovação já tinha COMEÇADO e nunca se ela havia passado, então um vencimento
 * de semanas atrás a satisfazia para sempre — e, como a cobrança vale 30 min, a
 * expiração virava o gatilho da seguinte. Resultado: 10.359 cobranças reais de
 * R$ 149, em contas que o próprio sistema já tinha bloqueado.
 *
 * Os tetos que fechariam o ciclo foram escritos e testados. Depois veio o fato
 * que os tornou inúteis: ninguém era avisado da cobrança gerada. O evento
 * `billing.charge_created` nunca teve consumidor, o e-mail nunca foi escrito, e
 * o banner do painel sempre dependeu do vencimento, não da cobrança. O job
 * gastava dinheiro de verdade para produzir um QR de 30 minutos que ninguém via.
 *
 * Hoje quem cria cobrança é a tela de assinatura, com o admin presente. Se um
 * dia o aviso por e-mail existir, ele deve levar um LINK para a tela — nunca o
 * QR dentro, que morre antes de a pessoa abrir a caixa de entrada.
 */
