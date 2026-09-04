import { z } from 'zod';

/** Canais da biblioteca `origem` (RF-07/BR-23). Lista curta de propósito: canal é o nível em que a verba se move. */
export const ChannelSchema = z.enum([
  'paid_search',
  'paid_social',
  'organic_search',
  'organic_social',
  'referral',
  'email',
  'direct',
  'other',
]);
export type AcquisitionChannel = z.infer<typeof ChannelSchema>;

export const AcquisitionRowSchema = z.object({
  chave: z.string(),
  channel: ChannelSchema,
  source: z.string().nullable(),
  campaign: z.string().nullable(),
  content: z.string().nullable(),
  cadastros: z.number().int(),
  ativados: z.number().int(),
  pagantes: z.number().int(),
  receita: z.number(),
  gasto: z.number(),
  /** Gasto ÷ pagantes. `null` quando ninguém pagou ainda. */
  custoPorCliente: z.number().nullable(),
  retorno: z.number().nullable(),
});
export type AcquisitionRow = z.infer<typeof AcquisitionRowSchema>;

export const AcquisitionQuerySchema = z.object({
  modelo: z.enum(['first', 'last']).optional(),
  agruparPor: z.enum(['channel', 'source', 'campaign', 'content']).optional(),
});
export type AcquisitionQuery = z.infer<typeof AcquisitionQuerySchema>;

export const AdSpendSchema = z.object({
  channel: ChannelSchema,
  source: z.string().trim().min(1).max(60),
  campaign: z.string().trim().max(80).nullable().optional(),
  content: z.string().trim().max(80).nullable().optional(),
  periodStart: z.string(),
  periodEnd: z.string(),
  /** Em reais, como o gerenciador de anúncios mostra. */
  amount: z.number().positive(),
  note: z.string().trim().max(200).nullable().optional(),
});
export type AdSpend = z.infer<typeof AdSpendSchema>;

export const CampaignLinkSchema = z.object({
  channel: ChannelSchema,
  source: z.string(),
  campaign: z.string(),
  content: z.string().nullable(),
  url: z.string(),
  /**
   * Código do link curto (`/i/<slug>`). `null` quando o encurtamento não foi
   * possível — a tela mostra o link longo, que funciona igual.
   */
  slug: z.string().nullable(),
  createdAt: z.string(),
});
export type CampaignLinkDto = z.infer<typeof CampaignLinkSchema>;

/** Destino de um código curto. `url` nula = código desconhecido (BR-23). */
export const ShortLinkTargetSchema = z.object({ url: z.string().nullable() });
export type ShortLinkTarget = z.infer<typeof ShortLinkTargetSchema>;

export const CreateCampaignLinkSchema = z.object({
  channel: ChannelSchema,
  source: z.string().trim().min(1).max(60),
  campaign: z.string().trim().min(1).max(80),
  content: z.string().trim().max(80).nullable().optional(),
});
export type CreateCampaignLink = z.infer<typeof CreateCampaignLinkSchema>;
