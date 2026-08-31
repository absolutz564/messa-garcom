import { z } from 'zod';

/** BR-20/PDR-017 — planos e ciclo de cobrança do tenant. */
export const BillingPlanSchema = z.enum(['monthly', 'semiannual', 'annual']);
export type BillingPlanKey = z.infer<typeof BillingPlanSchema>;

export const BillingPhaseSchema = z.enum(['trial', 'active', 'past_due', 'blocked']);
export type BillingPhase = z.infer<typeof BillingPhaseSchema>;

export const PixChargeStatusSchema = z.enum(['pending', 'paid', 'expired']);

/** Cobrança Pix em aberto (ou já resolvida) exibida na tela de assinatura. */
export const PixChargeSchema = z.object({
  id: z.string().uuid(),
  plan: BillingPlanSchema,
  amountCents: z.number().int(),
  status: PixChargeStatusSchema,
  qrCode: z.string(),
  qrCodeBase64: z.string().nullable(),
  expiresAt: z.string(),
});
export type PixCharge = z.infer<typeof PixChargeSchema>;

/** GET /admin/billing (BR-20) — visão do admin sobre a assinatura do próprio tenant. */
export const BillingStatusSchema = z.object({
  phase: BillingPhaseSchema,
  /** Dias inteiros até o vencimento; negativo se já passou; `null` sem prazo definido. */
  daysLeft: z.number().int().nullable(),
  plan: BillingPlanSchema.nullable(),
  trialEndsAt: z.string().nullable(),
  subscriptionEndsAt: z.string().nullable(),
  pendingCharge: PixChargeSchema.nullable(),
});
export type BillingStatus = z.infer<typeof BillingStatusSchema>;

export const ChoosePlanSchema = z.object({ plan: BillingPlanSchema });
export type ChoosePlan = z.infer<typeof ChoosePlanSchema>;
