import { describe, expect, it } from 'vitest';
import { BILLING_PLANS, evaluateTenantBilling, nextBillingCycleEnd, shouldGenerateRenewalCharge } from './billing';

describe('evaluateTenantBilling (BR-20)', () => {
  const now = new Date('2026-08-30T12:00:00Z');

  it('trial dentro do prazo ⇒ liberado', () => {
    const trialEndsAt = new Date(now.getTime() + 5 * 86_400_000);
    const r = evaluateTenantBilling({ billingStatus: 'trial', trialEndsAt, subscriptionEndsAt: null }, now);
    expect(r).toEqual({ canServeCustomers: true, phase: 'trial', daysLeft: 5 });
  });

  it('assinatura ativa dentro do prazo ⇒ liberado', () => {
    const subscriptionEndsAt = new Date(now.getTime() + 10 * 86_400_000);
    const r = evaluateTenantBilling({ billingStatus: 'active', trialEndsAt: null, subscriptionEndsAt }, now);
    expect(r.canServeCustomers).toBe(true);
    expect(r.phase).toBe('active');
  });

  it('vencido dentro da carência (3 dias) ⇒ ainda liberado, fase past_due', () => {
    const subscriptionEndsAt = new Date(now.getTime() - 2 * 86_400_000);
    const r = evaluateTenantBilling({ billingStatus: 'active', trialEndsAt: null, subscriptionEndsAt }, now);
    expect(r.canServeCustomers).toBe(true);
    expect(r.phase).toBe('past_due');
    expect(r.daysLeft).toBe(-2);
  });

  it('vencido além da carência ⇒ bloqueado', () => {
    const subscriptionEndsAt = new Date(now.getTime() - 4 * 86_400_000);
    const r = evaluateTenantBilling({ billingStatus: 'active', trialEndsAt: null, subscriptionEndsAt }, now);
    expect(r.canServeCustomers).toBe(false);
    expect(r.phase).toBe('blocked');
  });

  it('sem prazo (tenant migrado) ⇒ nunca bloqueia', () => {
    const r = evaluateTenantBilling({ billingStatus: 'active', trialEndsAt: null, subscriptionEndsAt: null }, now);
    expect(r).toEqual({ canServeCustomers: true, phase: 'active', daysLeft: null });
  });

  it('trial sem trialEndsAt (defensivo) ⇒ nunca bloqueia', () => {
    const r = evaluateTenantBilling({ billingStatus: 'trial', trialEndsAt: null, subscriptionEndsAt: null }, now);
    expect(r.canServeCustomers).toBe(true);
  });
});

describe('nextBillingCycleEnd (BR-20)', () => {
  const now = new Date('2026-08-30T12:00:00Z');

  it('sem vencimento anterior ⇒ conta a partir de agora', () => {
    const end = nextBillingCycleEnd('monthly', null, now);
    expect(end.getTime()).toBe(now.getTime() + 30 * 86_400_000);
  });

  it('vencimento futuro ⇒ estende a partir dele (quem paga adiantado não perde dias)', () => {
    const currentEnd = new Date(now.getTime() + 10 * 86_400_000);
    const end = nextBillingCycleEnd('monthly', currentEnd, now);
    expect(end.getTime()).toBe(currentEnd.getTime() + 30 * 86_400_000);
  });

  it('vencimento passado ⇒ conta a partir de agora, não acumula atraso', () => {
    const currentEnd = new Date(now.getTime() - 10 * 86_400_000);
    const end = nextBillingCycleEnd('monthly', currentEnd, now);
    expect(end.getTime()).toBe(now.getTime() + 30 * 86_400_000);
  });

  it('semestral e anual usam seus próprios ciclos', () => {
    expect(nextBillingCycleEnd('semiannual', null, now).getTime()).toBe(now.getTime() + 180 * 86_400_000);
    expect(nextBillingCycleEnd('annual', null, now).getTime()).toBe(now.getTime() + 365 * 86_400_000);
  });
});

describe('BILLING_PLANS (PDR-017)', () => {
  it('preços e descontos batem com a decisão de produto', () => {
    expect(BILLING_PLANS.monthly.priceCents).toBe(14_900);
    expect(BILLING_PLANS.semiannual.priceCents).toBe(80_000);
    expect(BILLING_PLANS.annual.priceCents).toBe(150_000);
    // Semestral economiza vs. 6x mensal; anual economiza vs. 12x mensal.
    expect(6 * BILLING_PLANS.monthly.priceCents - BILLING_PLANS.semiannual.priceCents).toBe(9_400);
    expect(12 * BILLING_PLANS.monthly.priceCents - BILLING_PLANS.annual.priceCents).toBe(28_800);
  });
});

describe('shouldGenerateRenewalCharge (BR-20)', () => {
  const now = new Date('2026-08-30T12:00:00Z');
  const trialEndsAt = new Date(now.getTime() + 3 * 86_400_000);

  it('dentro da janela de 5 dias e sem cobrança pendente ⇒ gera', () => {
    expect(shouldGenerateRenewalCharge({ billingStatus: 'trial', trialEndsAt, subscriptionEndsAt: null }, false, now)).toBe(true);
  });

  it('já existe cobrança pendente válida ⇒ não gera de novo', () => {
    expect(shouldGenerateRenewalCharge({ billingStatus: 'trial', trialEndsAt, subscriptionEndsAt: null }, true, now)).toBe(false);
  });

  it('fora da janela (vencimento distante) ⇒ não gera ainda', () => {
    const far = new Date(now.getTime() + 20 * 86_400_000);
    expect(shouldGenerateRenewalCharge({ billingStatus: 'trial', trialEndsAt: far, subscriptionEndsAt: null }, false, now)).toBe(false);
  });

  it('sem prazo (tenant migrado) ⇒ nunca gera', () => {
    expect(shouldGenerateRenewalCharge({ billingStatus: 'active', trialEndsAt: null, subscriptionEndsAt: null }, false, now)).toBe(false);
  });
});
