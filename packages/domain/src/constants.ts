const MINUTE = 60_000;

/** Janelas e limites definidos em PDR-005, PDR-006 e BR-08. */
export const RULES = {
  /** BR-08: sessão sem pedido há ≥ 1 h ⇒ inactive. */
  SESSION_INACTIVITY_MS: 60 * MINUTE,
  /** BR-03: solicitação sem resposta expira. */
  REQUEST_TTL_MS: 10 * MINUTE,
  /** BR-04: N recusas na janela ⇒ bloqueio. */
  BLOCK_AFTER_REJECTIONS: 2,
  BLOCK_REJECTION_WINDOW_MS: 15 * MINUTE,
  BLOCK_DURATION_MS: 30 * MINUTE,
  /** BR-03 item 5: rate limit por mesa (qualquer dispositivo). */
  TABLE_REQUEST_LIMIT: 5,
  TABLE_REQUEST_WINDOW_MS: 10 * MINUTE,
  /** BR-07: PIN. */
  PIN_LENGTH: 4,
  PIN_MAX_FAILED_ATTEMPTS: 10,
  PIN_LOCK_DURATION_MS: 15 * MINUTE,
  PIN_DEVICE_MAX_ATTEMPTS: 5,
  PIN_DEVICE_WINDOW_MS: 10 * MINUTE,
  /** BR-11 */
  ORDER_ITEM_MAX_QTY: 50,
  ORDER_MAX_ITEMS: 100,
  /** Tokens públicos: 12 chars base62 ≈ 71 bits. */
  PUBLIC_TOKEN_LENGTH: 12,
} as const;
