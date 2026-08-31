import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { schema, type DbHandle, type Tx } from '@messa/db';
import { decideOrderPlacement, DomainError, evaluateTenantBilling, isBlockedWhileStaffOffline, RULES, validateOrderLines, type Actor, type CatalogProduct } from '@messa/domain';
import { ptBR, type CreateOrder, type CreateOrderResult, type Order, type SessionConsumption, type StaffOrder } from '@messa/contracts';
import { DB } from '../db/db.module';
import { OutboxService } from '../events/outbox.service';
import { StaffPresenceService } from '../events/staff-presence.service';

export type OrderActor =
  | { kind: 'customer'; participantId: string; deviceId: string }
  | { kind: 'staff'; userId: string };

type OrderRow = typeof schema.orders.$inferSelect;

/** Pedidos (BR-09, BR-11, BR-12, BR-15). Cliente e garçom usam o mesmo caminho (princípio 7). */
@Injectable()
export class OrderService {
  constructor(
    @Inject(DB) private readonly db: DbHandle,
    private readonly outbox: OutboxService,
    private readonly presence: StaffPresenceService,
  ) {}

  async create(tenantId: string, sessionId: string, actor: OrderActor, input: CreateOrder, idempotencyKey: string): Promise<CreateOrderResult> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      // Idempotência (RNF-16): mesma chave ⇒ mesma resposta.
      const [cached] = await tx
        .select({ body: schema.idempotencyKeys.responseBody })
        .from(schema.idempotencyKeys)
        .where(and(eq(schema.idempotencyKeys.tenantId, tenantId), eq(schema.idempotencyKeys.scope, 'order'), eq(schema.idempotencyKeys.key, idempotencyKey)));
      if (cached) return cached.body as CreateOrderResult;

      const [session] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
      if (!session) throw new NotFoundException({ code: 'not_found' });
      // BR-16: serializa por mesa.
      await tx.select({ id: schema.tables.id }).from(schema.tables).where(eq(schema.tables.id, session.tableId)).for('update');
      const [fresh] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));

      if (actor.kind === 'customer') {
        const [p] = await tx
          .select({ id: schema.sessionParticipants.id })
          .from(schema.sessionParticipants)
          .where(and(eq(schema.sessionParticipants.id, actor.participantId), eq(schema.sessionParticipants.sessionId, sessionId)));
        if (!p) throw new ForbiddenException({ code: 'forbidden' });
      }

      // BR-18: com a conta pedida, o cliente não adiciona itens (staff ainda pode, ex.: correção).
      if (actor.kind === 'customer' && fresh!.billRequestedAt) throw new DomainError('bill_requested', 'A conta já foi pedida para esta mesa. Cancele o pedido de conta para pedir mais itens.');

      const placement = decideOrderPlacement(fresh!.status as 'active' | 'inactive' | 'closed', actor.kind);

      // BR-11: valida contra o catálogo e congela nome/preço.
      const ids = [...new Set(input.items.map((i) => i.productId))];
      const rows = await tx
        .select({ p: schema.products, areaKey: schema.serviceAreas.key, areaOpen: schema.serviceAreas.isOpen })
        .from(schema.products)
        .innerJoin(schema.serviceAreas, eq(schema.serviceAreas.id, schema.products.serviceAreaId))
        .where(and(eq(schema.products.tenantId, tenantId), inArray(schema.products.id, ids)));
      const catalog = new Map<string, CatalogProduct>(
        rows.map(({ p, areaKey, areaOpen }) => [p.id, { id: p.id, name: p.name, priceCents: p.priceCents, isAvailable: p.isAvailable, deletedAt: p.deletedAt, serviceAreaKey: areaKey, serviceAreaOpen: areaOpen }]),
      );
      const validation = validateOrderLines(input.items, catalog);
      if (!validation.ok) throw new DomainError('validation', 'Alguns itens não podem ser pedidos', { rejected: validation.rejected });

      const domainActor: Actor = actor.kind === 'customer' ? { kind: 'customer', id: actor.deviceId } : { kind: 'staff', id: actor.userId };
      const now = new Date();
      let requestId: string | null = null;

      if (placement.kind === 'await_confirmation') {
        // BR-19: sem equipe conectada a solicitação expira em 10 min e leva o pedido junto
        // (BR-10). Recusa antes de gravar qualquer coisa.
        if (isBlockedWhileStaffOffline('resume_session') && !this.presence.isOnline(tenantId)) {
          throw new DomainError('staff_offline', `${ptBR.offline.title}. ${ptBR.offline.body}`);
        }
        // BR-20: inadimplência além da carência bloqueia reabrir sessão inativa (mesmo ponto de BR-19).
        const [tenant] = await tx
          .select({ billingStatus: schema.tenants.billingStatus, trialEndsAt: schema.tenants.trialEndsAt, subscriptionEndsAt: schema.tenants.subscriptionEndsAt })
          .from(schema.tenants)
          .where(eq(schema.tenants.id, tenantId));
        if (tenant && !evaluateTenantBilling({ billingStatus: tenant.billingStatus as 'trial' | 'active', trialEndsAt: tenant.trialEndsAt, subscriptionEndsAt: tenant.subscriptionEndsAt }).canServeCustomers) {
          throw new DomainError('billing_blocked', 'Restaurante indisponível');
        }
        // BR-09: uma solicitação pendente por (mesa, dispositivo); enquanto existe, não aceita novo pedido.
        const dev = actor as Extract<OrderActor, { kind: 'customer' }>;
        const [pending] = await tx
          .select({ id: schema.serviceRequests.id })
          .from(schema.serviceRequests)
          .where(and(eq(schema.serviceRequests.tableId, fresh!.tableId), eq(schema.serviceRequests.deviceId, dev.deviceId), eq(schema.serviceRequests.status, 'pending')));
        if (pending) throw new DomainError('awaiting_confirmation', 'Aguarde a confirmação do restaurante', { requestId: pending.id });
      }

      const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${schema.orders.sequenceNo}), 0) + 1` }).from(schema.orders).where(eq(schema.orders.sessionId, sessionId)) as [{ next: number }];
      const [order] = await tx
        .insert(schema.orders)
        .values({
          tenantId,
          sessionId,
          sequenceNo: Number(next),
          status: placement.kind === 'submit' ? 'submitted' : 'pending_confirmation',
          createdByKind: actor.kind,
          participantId: actor.kind === 'customer' ? actor.participantId : null,
          userId: actor.kind === 'staff' ? actor.userId : null,
          totalCents: validation.totalCents,
        })
        .returning();
      await tx.insert(schema.orderItems).values(
        validation.lines.map((l) => ({ tenantId, orderId: order!.id, productId: l.productId, productNameSnapshot: l.productNameSnapshot, unitPriceCentsSnapshot: l.unitPriceCentsSnapshot, quantity: l.quantity, notes: l.notes })),
      );

      if (placement.kind === 'submit') {
        await tx.update(schema.sessions).set({ status: 'active', lastActivityAt: now }).where(eq(schema.sessions.id, sessionId));
        if (placement.reactivate) await this.outbox.append(tx, { tenantId, type: 'session.resumed', aggregateType: 'session', aggregateId: sessionId, actor: domainActor, payload: { tableId: fresh!.tableId, by: 'staff_order' } });
        await this.outbox.append(tx, { tenantId, type: 'order.created', aggregateType: 'order', aggregateId: order!.id, actor: domainActor, payload: { sessionId, tableId: fresh!.tableId, sequenceNo: order!.sequenceNo, totalCents: order!.totalCents } });
      } else {
        const dev = actor as Extract<OrderActor, { kind: 'customer' }>;
        const [req] = await tx
          .insert(schema.serviceRequests)
          .values({ tenantId, tableId: fresh!.tableId, deviceId: dev.deviceId, type: 'resume_session', sessionId, pendingOrderId: order!.id, expiresAt: new Date(now.getTime() + RULES.REQUEST_TTL_MS) })
          .returning({ id: schema.serviceRequests.id });
        requestId = req!.id;
        const [table] = await tx.select({ displayName: schema.tables.displayName }).from(schema.tables).where(eq(schema.tables.id, fresh!.tableId));
        await this.outbox.append(tx, { tenantId, type: 'order.pending_confirmation', aggregateType: 'order', aggregateId: order!.id, actor: domainActor, payload: { sessionId, tableId: fresh!.tableId, requestId } });
        await this.outbox.append(tx, { tenantId, type: 'request.created', aggregateType: 'request', aggregateId: requestId, actor: domainActor, payload: { deviceId: dev.deviceId, tableId: fresh!.tableId, tableName: table?.displayName, type: 'resume_session', sessionId, orderId: order!.id } });
      }

      const result: CreateOrderResult = { order: (await this.orders(tx, [order!.id]))[0]!, awaitingConfirmation: placement.kind === 'await_confirmation', requestId };
      await tx.insert(schema.idempotencyKeys).values({ tenantId, scope: 'order', key: idempotencyKey, responseStatus: 201, responseBody: result });
      return result;
    });
  }

  /** RF-64 — handoff para o sistema do restaurante. */
  acknowledge(tenantId: string, orderId: string, actor: Actor): Promise<Order> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [row] = await tx
        .update(schema.orders)
        .set({ status: 'acknowledged', acknowledgedAt: new Date(), acknowledgedByUserId: actor.id ?? null })
        .where(and(eq(schema.orders.id, orderId), eq(schema.orders.status, 'submitted')))
        .returning();
      if (!row) {
        const [exists] = await tx.select({ status: schema.orders.status }).from(schema.orders).where(eq(schema.orders.id, orderId));
        if (!exists) throw new NotFoundException({ code: 'not_found' });
        throw new ConflictException({ code: 'conflict', message: `Pedido está ${exists.status}` });
      }
      await this.outbox.append(tx, { tenantId, type: 'order.acknowledged', aggregateType: 'order', aggregateId: orderId, actor, payload: { sessionId: row.sessionId } });
      return (await this.orders(tx, [orderId]))[0]!;
    });
  }

  /** RF-65 (staff) / RF-67 (cliente, só o próprio e enquanto `submitted`). */
  cancel(tenantId: string, orderId: string, by: OrderActor, reason: string): Promise<Order> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [row] = await tx.select().from(schema.orders).where(eq(schema.orders.id, orderId));
      if (!row) throw new NotFoundException({ code: 'not_found' });
      if (by.kind === 'customer' && row.participantId !== by.participantId) throw new ForbiddenException({ code: 'forbidden' });
      if (!['submitted', 'pending_confirmation'].includes(row.status)) throw new ConflictException({ code: 'conflict', message: `Pedido está ${row.status}` });
      if (by.kind === 'customer' && row.status !== 'submitted') throw new ConflictException({ code: 'conflict', message: 'Pedido aguardando confirmação' });
      const actor: Actor = by.kind === 'customer' ? { kind: 'customer', id: by.deviceId } : { kind: 'staff', id: by.userId };
      await tx.update(schema.orders).set({ status: 'cancelled', cancelledAt: new Date(), cancelledByUserId: by.kind === 'staff' ? by.userId : null, cancelReason: reason }).where(eq(schema.orders.id, orderId));
      if (row.status === 'pending_confirmation') {
        await tx.update(schema.serviceRequests).set({ status: 'cancelled', resolvedAt: new Date() }).where(and(eq(schema.serviceRequests.pendingOrderId, orderId), eq(schema.serviceRequests.status, 'pending')));
      }
      await this.outbox.append(tx, { tenantId, type: 'order.cancelled', aggregateType: 'order', aggregateId: orderId, actor, payload: { sessionId: row.sessionId, reason } });
      return (await this.orders(tx, [orderId]))[0]!;
    });
  }

  /** RF-66 — consumo consolidado (exclui cancelados do total). */
  consumption(tenantId: string, sessionId: string): Promise<SessionConsumption> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const ids = (await tx.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.sessionId, sessionId)).orderBy(asc(schema.orders.sequenceNo))).map((r) => r.id);
      const orders = await this.orders(tx, ids);
      return { orders, totalCents: orders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.totalCents, 0) };
    });
  }

  /** Fila do operador: pedidos a lançar + aguardando confirmação, mais antigos primeiro. */
  queue(tenantId: string): Promise<StaffOrder[]> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const rows = await tx
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(and(eq(schema.orders.tenantId, tenantId), inArray(schema.orders.status, ['submitted', 'pending_confirmation'])))
        .orderBy(asc(schema.orders.createdAt));
      return this.staffOrders(tx, rows.map((r) => r.id));
    });
  }

  /** Últimos pedidos lançados/cancelados (histórico curto do painel). */
  recent(tenantId: string, limit = 30): Promise<StaffOrder[]> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const rows = await tx
        .select({ id: schema.orders.id })
        .from(schema.orders)
        .where(and(eq(schema.orders.tenantId, tenantId), inArray(schema.orders.status, ['acknowledged', 'cancelled'])))
        .orderBy(desc(schema.orders.createdAt))
        .limit(limit);
      return this.staffOrders(tx, rows.map((r) => r.id));
    });
  }

  // ---------------------------------------------------------------------

  private async staffOrders(tx: Tx, ids: string[]): Promise<StaffOrder[]> {
    if (ids.length === 0) return [];
    const orders = await this.orders(tx, ids);
    const sessionIds = [...new Set(orders.map((o) => o.sessionId))];
    const tables = await tx
      .select({ sessionId: schema.sessions.id, id: schema.tables.id, displayName: schema.tables.displayName })
      .from(schema.sessions)
      .innerJoin(schema.tables, eq(schema.tables.id, schema.sessions.tableId))
      .where(inArray(schema.sessions.id, sessionIds));
    const bySession = new Map(tables.map((t) => [t.sessionId, { id: t.id, displayName: t.displayName }]));
    return orders.map((o) => ({ ...o, table: bySession.get(o.sessionId)! }));
  }

  private async orders(tx: Tx, ids: string[]): Promise<Order[]> {
    if (ids.length === 0) return [];
    const rows = await tx
      .select({ o: schema.orders, ordinal: schema.sessionParticipants.ordinal, participantName: schema.sessionParticipants.displayName, userName: schema.users.name })
      .from(schema.orders)
      .leftJoin(schema.sessionParticipants, eq(schema.sessionParticipants.id, schema.orders.participantId))
      .leftJoin(schema.users, eq(schema.users.id, schema.orders.userId))
      .where(inArray(schema.orders.id, ids))
      .orderBy(asc(schema.orders.sequenceNo));
    const items = await tx.select().from(schema.orderItems).where(inArray(schema.orderItems.orderId, ids));
    const byOrder = new Map<string, typeof items>();
    for (const i of items) byOrder.set(i.orderId, [...(byOrder.get(i.orderId) ?? []), i]);
    return rows.map(({ o, ordinal, participantName, userName }) => this.dto(o, byOrder.get(o.id) ?? [], ordinal, participantName, userName));
  }

  private dto(o: OrderRow, items: (typeof schema.orderItems.$inferSelect)[], ordinal: number | null, participantName: string | null, userName: string | null): Order {
    return {
      id: o.id,
      sessionId: o.sessionId,
      sequenceNo: o.sequenceNo,
      status: o.status as Order['status'],
      createdBy: o.createdByKind === 'customer' ? { kind: 'customer', participantOrdinal: ordinal ?? 0, participantName: participantName ?? null } : { kind: 'staff', userName: userName ?? 'Equipe' },
      items: items.map((i) => ({ id: i.id, productId: i.productId, name: i.productNameSnapshot, unitPriceCents: i.unitPriceCentsSnapshot, quantity: i.quantity, notes: i.notes })),
      totalCents: o.totalCents,
      createdAt: o.createdAt.toISOString(),
      acknowledgedAt: o.acknowledgedAt?.toISOString() ?? null,
      cancelledAt: o.cancelledAt?.toISOString() ?? null,
      cancelReason: o.cancelReason,
    };
  }
}
