import { RULES } from './constants';
import type { TableState } from './types';

/** Entrada para decidir uma nova solicitação `open_session` (BR-03). */
export interface OpenRequestDecisionInput {
  now: Date;
  tableState: TableState;
  tenantBlocked: boolean;
  /** Bloqueio vigente para (mesa, dispositivo), se houver. */
  activeBlockUntil: Date | null;
  /** Já existe request pendente para (mesa, dispositivo)? */
  existingPendingRequestId: string | null;
  /** Solicitações desta mesa (qualquer dispositivo) na janela de rate limit. */
  tableRequestsInWindow: number;
}

export type OpenRequestDecision =
  | { kind: 'create'; expiresAt: Date }
  | { kind: 'reuse_pending'; requestId: string }
  | { kind: 'reject'; code: 'table_not_available' | 'tenant_blocked' | 'device_blocked' | 'table_rate_limited' | 'session_active'; blockedUntil?: Date };

/**
 * BR-03 — ordem das verificações é normativa: um dispositivo bloqueado nunca gera
 * notificação, mesmo que a mesa esteja livre.
 */
export function decideOpenRequest(input: OpenRequestDecisionInput): OpenRequestDecision {
  if (input.tableState === 'disabled') return { kind: 'reject', code: 'table_not_available' };
  if (input.tenantBlocked) return { kind: 'reject', code: 'tenant_blocked' };
  if (input.activeBlockUntil && input.activeBlockUntil > input.now) {
    return { kind: 'reject', code: 'device_blocked', blockedUntil: input.activeBlockUntil };
  }
  if (input.existingPendingRequestId) {
    return { kind: 'reuse_pending', requestId: input.existingPendingRequestId };
  }
  if (input.tableRequestsInWindow >= RULES.TABLE_REQUEST_LIMIT) {
    return { kind: 'reject', code: 'table_rate_limited' };
  }
  if (input.tableState === 'occupied') return { kind: 'reject', code: 'session_active' };
  // free, requested (outro dispositivo) ou inactive (PDR-003)
  return { kind: 'create', expiresAt: new Date(input.now.getTime() + RULES.REQUEST_TTL_MS) };
}

/**
 * BR-04 — após uma recusa, decide se o dispositivo deve ser bloqueado.
 * `rejectionTimestamps` inclui a recusa atual.
 */
export function shouldBlockDevice(now: Date, rejectionTimestamps: Date[]): { block: false } | { block: true; until: Date } {
  const windowStart = now.getTime() - RULES.BLOCK_REJECTION_WINDOW_MS;
  const recent = rejectionTimestamps.filter((t) => t.getTime() >= windowStart).length;
  if (recent >= RULES.BLOCK_AFTER_REJECTIONS) {
    return { block: true, until: new Date(now.getTime() + RULES.BLOCK_DURATION_MS) };
  }
  return { block: false };
}
