import { z } from 'zod';

export const RequestStatusSchema = z.enum(['pending', 'approved', 'rejected', 'expired', 'cancelled']);
export const RequestTypeSchema = z.enum(['open_session', 'resume_session']);
export const RequestResolutionSchema = z.enum(['new_session', 'continue_session']);
export const SessionStatusSchema = z.enum(['active', 'inactive', 'closed']);
export const TableStateSchema = z.enum(['free', 'requested', 'occupied', 'inactive', 'disabled']);

/** Visão do cliente sobre a própria solicitação (F02). */
export const CustomerRequestSchema = z.object({
  id: z.string().uuid(),
  type: RequestTypeSchema,
  status: RequestStatusSchema,
  createdAt: z.string(),
  expiresAt: z.string(),
  /** Preenchido quando aprovada: o cliente já está na sessão (cookie emitido). */
  sessionId: z.string().uuid().nullable(),
});
export type CustomerRequest = z.infer<typeof CustomerRequestSchema>;

/** Visão do cliente sobre a sessão em que está (F05/F06). PIN visível a participantes (PDR-005). */
export const CustomerSessionSchema = z.object({
  id: z.string().uuid(),
  status: SessionStatusSchema,
  pin: z.string(),
  table: z.object({ id: z.string().uuid(), displayName: z.string() }),
  participant: z.object({ id: z.string().uuid(), ordinal: z.number().int(), name: z.string().nullable() }),
  participantsCount: z.number().int(),
  openedAt: z.string(),
  lastActivityAt: z.string(),
});
export type CustomerSession = z.infer<typeof CustomerSessionSchema>;

export const UpdateParticipantSchema = z.object({ name: z.string().trim().max(30).nullable() });

export const JoinSessionSchema = z.object({ pin: z.string().regex(/^\d{4}$/, 'PIN de 4 dígitos') });

/** Solicitação na fila do operador (F03). */
export const StaffRequestSchema = z.object({
  id: z.string().uuid(),
  type: RequestTypeSchema,
  status: RequestStatusSchema,
  table: z.object({ id: z.string().uuid(), displayName: z.string(), state: TableStateSchema }),
  /** Sessão viva na mesa no momento (para decidir nova/continuar em mesa inativa). */
  liveSession: z
    .object({
      id: z.string().uuid(),
      status: SessionStatusSchema,
      lastActivityAt: z.string(),
      ordersCount: z.number().int(),
      totalCents: z.number().int(),
    })
    .nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type StaffRequest = z.infer<typeof StaffRequestSchema>;

export const ApproveRequestSchema = z.object({ resolution: RequestResolutionSchema.optional() });

/** Sessão vista pelo staff. */
export const StaffSessionSchema = z.object({
  id: z.string().uuid(),
  status: SessionStatusSchema,
  pin: z.string(),
  table: z.object({ id: z.string().uuid(), displayName: z.string() }),
  openedAt: z.string(),
  openedBy: z.enum(['operator', 'waiter']),
  lastActivityAt: z.string(),
  participantsCount: z.number().int(),
  ordersCount: z.number().int(),
  unacknowledgedCount: z.number().int(),
  totalCents: z.number().int(),
});
export type StaffSession = z.infer<typeof StaffSessionSchema>;

/** Entrada do mapa de mesas do operador/garçom (6.1). */
export const StaffTableSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string(),
  state: TableStateSchema,
  session: StaffSessionSchema.nullable(),
  pendingRequests: z.number().int(),
});
export type StaffTable = z.infer<typeof StaffTableSchema>;

export const CloseSessionSchema = z.object({ force: z.boolean().optional() });
