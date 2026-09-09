import { z } from 'zod';

/** BR-24 — área de acompanhamento de quem divulga. */
export const AffiliateLoginSchema = z.object({
  usuario: z.string().trim().min(1).max(60),
  senha: z.string().min(1).max(200),
});
export type AffiliateLogin = z.infer<typeof AffiliateLoginSchema>;

/**
 * Situação do restaurante indicado, do ponto de vista de quem divulgou.
 * Deriva de BR-20 na leitura; nada é guardado (ver `evaluateTenantBilling`).
 */
export const AffiliateSituationSchema = z.enum(['em_teste', 'teste_vencido', 'pagante', 'vencida']);
export type AffiliateSituation = z.infer<typeof AffiliateSituationSchema>;

export const AffiliateReferralSchema = z.object({
  /** Últimos 6 caracteres do id: referência estável, sem revelar o restaurante. */
  referencia: z.string(),
  cadastradaEm: z.string(),
  situacao: AffiliateSituationSchema,
  /** Quando o primeiro pagamento aconteceu. `null` enquanto só houve teste. */
  pagouEm: z.string().nullable(),
});
export type AffiliateReferral = z.infer<typeof AffiliateReferralSchema>;

export const AffiliateBlockSchema = z.object({
  /** O código do link (`/i/<codigo>`) — é como o divulgador se reconhece na lista. */
  codigo: z.string(),
  cadastros: z.number().int(),
  pagantes: z.number().int(),
  indicacoes: z.array(AffiliateReferralSchema),
});
export type AffiliateBlock = z.infer<typeof AffiliateBlockSchema>;
