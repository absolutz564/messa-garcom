import { z } from 'zod';
import { BillingPhaseSchema, BillingPlanSchema } from './billing';
import { ChannelSchema } from './acquisition';

export const CreateTenantSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z
    .string()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'slug inválido'),
  adminEmail: z.string().email(),
  adminName: z.string().min(2).max(80),
  adminPassword: z.string().min(8).max(128),
});
export type CreateTenant = z.infer<typeof CreateTenantSchema>;

export const TenantSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  primaryColor: z.string(),
  status: z.enum(['active', 'blocked']),
  createdAt: z.string(),
  /** BR-20 — visão do Super Admin sobre a cobrança (nunca afeta `status`, ver ADR-006). */
  billing: z.object({
    phase: BillingPhaseSchema,
    daysLeft: z.number().int().nullable(),
    plan: BillingPlanSchema.nullable(),
    /** Vencimento que vale hoje: fim do teste enquanto em trial, fim da assinatura depois. */
    expiresAt: z.string().nullable(),
  }),
  /**
   * BR-23 — de onde veio este restaurante. `null` para os criados antes da
   * aquisição existir; `channel: 'direct'` quando ele chegou sem campanha —
   * são coisas diferentes e a tela precisa distinguir.
   */
  origin: z
    .object({
      channel: ChannelSchema,
      source: z.string().nullable(),
      campaign: z.string().nullable(),
      content: z.string().nullable(),
      referrerHost: z.string().nullable(),
    })
    .nullable(),
  /** Quem abriu a conta. É a resposta para "quem é esse restaurante que apareceu?". */
  admin: z.object({ name: z.string(), email: z.string() }).nullable(),
});
export type Tenant = z.infer<typeof TenantSchema>;

export const UpdateTenantStatusSchema = z.object({ status: z.enum(['active', 'blocked']) });
