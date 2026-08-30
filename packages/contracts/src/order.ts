import { z } from 'zod';

export const OrderStatusSchema = z.enum(['pending_confirmation', 'submitted', 'acknowledged', 'cancelled']);

export const OrderLineInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().trim().max(200).nullable().optional(),
});

/** Corpo de POST .../orders. `Idempotency-Key` vai no header (RNF-16). */
export const CreateOrderSchema = z.object({
  items: z.array(OrderLineInputSchema).min(1).max(100),
});
export type CreateOrder = z.infer<typeof CreateOrderSchema>;

export const OrderItemSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  name: z.string(),
  unitPriceCents: z.number().int(),
  quantity: z.number().int(),
  notes: z.string().nullable(),
});

export const OrderSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  sequenceNo: z.number().int(),
  status: OrderStatusSchema,
  createdBy: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('customer'), participantOrdinal: z.number().int(), participantName: z.string().nullable() }),
    z.object({ kind: z.literal('staff'), userName: z.string() }),
  ]),
  items: z.array(OrderItemSchema),
  totalCents: z.number().int(),
  createdAt: z.string(),
  acknowledgedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
});
export type Order = z.infer<typeof OrderSchema>;

/** Resultado de criar pedido: enviado, ou aguardando confirmação do caixa (BR-09). */
export const CreateOrderResultSchema = z.object({
  order: OrderSchema,
  awaitingConfirmation: z.boolean(),
  requestId: z.string().uuid().nullable(),
});
export type CreateOrderResult = z.infer<typeof CreateOrderResultSchema>;

/** Consumo da mesa (RF-66): pedidos válidos e total. */
export const SessionConsumptionSchema = z.object({
  orders: z.array(OrderSchema),
  totalCents: z.number().int(),
});
export type SessionConsumption = z.infer<typeof SessionConsumptionSchema>;

/** Pedido na fila do operador, com a mesa. */
export const StaffOrderSchema = OrderSchema.extend({
  table: z.object({ id: z.string().uuid(), displayName: z.string() }),
});
export type StaffOrder = z.infer<typeof StaffOrderSchema>;

export const CancelOrderSchema = z.object({ reason: z.string().trim().min(1).max(200).optional() });
