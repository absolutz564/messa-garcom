export type Role = 'admin' | 'operator' | 'waiter';
export type SessionStatus = 'active' | 'inactive' | 'closed';
export type TableState = 'free' | 'requested' | 'occupied' | 'inactive' | 'disabled';
export type RequestType = 'open_session' | 'resume_session';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
export type RequestResolution = 'new_session' | 'continue_session';
export type OrderStatus = 'pending_confirmation' | 'submitted' | 'acknowledged' | 'cancelled';
export type CloseReason = 'manual' | 'replaced_by_new' | 'forced_with_pending' | 'daily_auto';
export type ServiceAreaKey = 'kitchen' | 'bar';
export type ActorKind = 'customer' | 'staff' | 'system';

export interface Actor {
  kind: ActorKind;
  id?: string;
}

/** Erro de domínio: mapeado para HTTP na camada de API. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
