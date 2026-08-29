/** Catálogo de eventos de domínio — docs/07-api/events.md. Payloads nunca contêm PIN. */
export const EVENT_TYPES = [
  'request.created',
  'request.approved',
  'request.rejected',
  'request.expired',
  'session.opened',
  'session.participant_joined',
  'session.became_inactive',
  'session.resumed',
  'session.pin_locked',
  'session.closed',
  'order.created',
  'order.pending_confirmation',
  'order.acknowledged',
  'order.cancelled',
  'service_area.changed',
  'catalog.changed',
  'table.changed',
  'tenant.blocked',
  'tenant.unblocked',
  'tenant.created',
  'membership.created',
  'staff_device.revoked',
  'session.pin_failed',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export interface DomainEventEnvelope<P = Record<string, unknown>> {
  id: string;
  type: EventType;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  actor: { kind: 'customer' | 'staff' | 'system'; id?: string };
  occurredAt: string;
  payload: P;
}

/** Rooms de WebSocket para as quais cada evento é emitido (ADR-003). */
export const EVENT_ROOMS: Record<EventType, Array<'tenant' | 'session' | 'request' | 'all_sessions'>> = {
  'request.created': ['tenant'],
  'request.approved': ['tenant', 'request'],
  'request.rejected': ['tenant', 'request'],
  'request.expired': ['tenant', 'request'],
  'session.opened': ['tenant'],
  'session.participant_joined': ['tenant', 'session'],
  'session.became_inactive': ['tenant', 'session'],
  'session.resumed': ['tenant', 'session'],
  'session.pin_locked': ['tenant'],
  'session.closed': ['tenant', 'session'],
  'order.created': ['tenant', 'session'],
  'order.pending_confirmation': ['tenant', 'session'],
  'order.acknowledged': ['tenant', 'session'],
  'order.cancelled': ['tenant', 'session'],
  'service_area.changed': ['tenant', 'all_sessions'],
  'catalog.changed': ['all_sessions'],
  'table.changed': ['tenant'],
  'tenant.blocked': ['tenant'],
  'tenant.unblocked': ['tenant'],
  'tenant.created': [],
  'membership.created': ['tenant'],
  'staff_device.revoked': ['tenant'],
  'session.pin_failed': [],
};
