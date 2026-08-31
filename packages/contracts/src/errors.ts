/** Formato único de erro da API. */
export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

/** Códigos de domínio → HTTP. Códigos fora da tabela viram 400. */
export const DOMAIN_ERROR_STATUS: Record<string, number> = {
  table_not_available: 404,
  tenant_blocked: 403,
  device_blocked: 429,
  table_rate_limited: 429,
  device_rate_limited: 429,
  session_active: 409,
  session_closed: 410,
  pin_locked: 423,
  pin_invalid: 401,
  awaiting_confirmation: 409,
  staff_offline: 409,
  billing_blocked: 403,
  billing_unavailable: 503,
  email_in_use: 409,
  invalid_transition: 409,
  conflict: 409,
  pending_orders: 409,
  bill_requested: 409,
  bill_not_requested: 409,
  bill_already_acknowledged: 409,
  not_found: 404,
  forbidden: 403,
  validation: 422,
};
