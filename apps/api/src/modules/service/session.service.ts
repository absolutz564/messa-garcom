import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, inArray, lt, lte, sql, sum } from 'drizzle-orm';
import { schema, type DbHandle, type Tx } from '@messa/db';
import {
  cryptoRandomInt,
  decideCloseSession,
  decideOpenRequest,
  decidePinAttempt,
  deriveTableState,
  DomainError,
  evaluateTenantBilling,
  generatePin,
  isBlockedWhileStaffOffline,
  RULES,
  shouldBlockDevice,
  type Actor,
  type RequestResolution,
  type TableState,
} from '@messa/domain';
import { ptBR, type BillState, type CustomerRequest, type CustomerSession, type StaffRequest, type StaffSession, type StaffTable } from '@messa/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config';
import { PinCipher } from '../../common/pin-cipher';
import { DB } from '../db/db.module';
import { OutboxService } from '../events/outbox.service';
import { StaffPresenceService } from '../events/staff-presence.service';

type SessionRow = typeof schema.sessions.$inferSelect;
type RequestRow = typeof schema.serviceRequests.$inferSelect;

/**
 * Solicitações e sessões (BR-03..BR-10, BR-13, BR-14, BR-16).
 * Toda mudança de estado: lock na mesa + evento na mesma transação.
 */
@Injectable()
export class SessionService {
  private readonly pin: PinCipher;

  constructor(
    @Inject(DB) private readonly db: DbHandle,
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly outbox: OutboxService,
    private readonly presence: StaffPresenceService,
  ) {
    this.pin = new PinCipher(config.PIN_ENCRYPTION_KEY);
  }

  // =====================================================================
  // Cliente
  // =====================================================================

  /** BR-03 — F02. */
  async requestService(tenantId: string, tableId: string, deviceId: string): Promise<CustomerRequest> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const table = await this.lockTable(tx, tableId);
      const [tenant] = await tx
        .select({ status: schema.tenants.status, billingStatus: schema.tenants.billingStatus, trialEndsAt: schema.tenants.trialEndsAt, subscriptionEndsAt: schema.tenants.subscriptionEndsAt })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId));
      const state = await this.tableState(tx, table);
      const now = new Date();

      const [block] = await tx
        .select({ until: schema.deviceBlocks.blockedUntil })
        .from(schema.deviceBlocks)
        .where(and(eq(schema.deviceBlocks.tableId, tableId), eq(schema.deviceBlocks.deviceId, deviceId), gt(schema.deviceBlocks.blockedUntil, now)))
        .orderBy(desc(schema.deviceBlocks.blockedUntil))
        .limit(1);
      const [pending] = await tx
        .select()
        .from(schema.serviceRequests)
        .where(and(eq(schema.serviceRequests.tableId, tableId), eq(schema.serviceRequests.deviceId, deviceId), eq(schema.serviceRequests.status, 'pending')));
      const [inWindowRow] = await tx
        .select({ n: count() })
        .from(schema.serviceRequests)
        .where(and(eq(schema.serviceRequests.tableId, tableId), eq(schema.serviceRequests.type, 'open_session'), gt(schema.serviceRequests.createdAt, new Date(now.getTime() - RULES.TABLE_REQUEST_WINDOW_MS))));

      const decision = decideOpenRequest({
        now,
        tableState: state,
        tenantBlocked: tenant?.status !== 'active',
        activeBlockUntil: block?.until ?? null,
        existingPendingRequestId: pending?.id ?? null,
        tableRequestsInWindow: Number(inWindowRow?.n ?? 0),
      });

      if (decision.kind === 'reuse_pending') return this.customerRequestDto(pending!);
      if (decision.kind === 'reject') {
        throw new DomainError(decision.code, (MESSAGES[decision.code] ?? decision.code), decision.blockedUntil ? { blockedUntil: decision.blockedUntil.toISOString() } : undefined);
      }
      // BR-19: sem equipe conectada a solicitação só expiraria em 10 min. Depois do anti-spam,
      // para que dispositivo bloqueado continue recebendo a mensagem de bloqueio (BR-04).
      if (isBlockedWhileStaffOffline('open_session') && !this.presence.isOnline(tenantId)) {
        throw new DomainError('staff_offline', MESSAGES.staff_offline!);
      }
      // BR-20: inadimplência além da carência bloqueia só a criação de nova sessão — nunca login/pedidos em curso.
      if (tenant && !evaluateTenantBilling({ billingStatus: tenant.billingStatus as 'trial' | 'active', trialEndsAt: tenant.trialEndsAt, subscriptionEndsAt: tenant.subscriptionEndsAt }).canServeCustomers) {
        throw new DomainError('billing_blocked', MESSAGES.billing_blocked!);
      }

      const [row] = await tx
        .insert(schema.serviceRequests)
        .values({ tenantId, tableId, deviceId, type: 'open_session', expiresAt: decision.expiresAt })
        .returning();
      await this.outbox.append(tx, {
        tenantId,
        type: 'request.created',
        aggregateType: 'request',
        aggregateId: row!.id,
        actor: { kind: 'customer', id: deviceId },
        payload: { deviceId, tableId, tableName: table.displayName, type: 'open_session', tableState: state },
      });
      return this.customerRequestDto(row!);
    });
  }

  /** Cliente consulta a própria solicitação; se aprovada, devolve o participante para emissão do cookie. */
  async getCustomerRequest(tenantId: string, requestId: string, deviceId: string): Promise<{ request: CustomerRequest; participantId: string | null }> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [row] = await tx.select().from(schema.serviceRequests).where(and(eq(schema.serviceRequests.id, requestId), eq(schema.serviceRequests.deviceId, deviceId)));
      if (!row) throw new NotFoundException({ code: 'not_found' });
      let participantId: string | null = null;
      if (row.status === 'approved' && row.sessionId) {
        const [p] = await tx
          .select({ id: schema.sessionParticipants.id })
          .from(schema.sessionParticipants)
          .where(and(eq(schema.sessionParticipants.sessionId, row.sessionId), eq(schema.sessionParticipants.deviceId, deviceId)));
        participantId = p?.id ?? null;
      }
      return { request: this.customerRequestDto(row), participantId };
    });
  }

  /** BR-07 — F06. */
  async join(tenantId: string, tableId: string, deviceId: string, pin: string): Promise<{ sessionId: string; participantId: string }> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      await this.lockTable(tx, tableId);
      const session = await this.liveSession(tx, tableId);
      const now = new Date();
      const [deviceFailsRow] = await tx
        .select({ n: count() })
        .from(schema.domainEvents)
        .where(
          and(
            eq(schema.domainEvents.type, 'session.pin_failed'),
            eq(schema.domainEvents.aggregateType, 'device'),
            eq(schema.domainEvents.aggregateId, deviceId),
            gt(schema.domainEvents.createdAt, new Date(now.getTime() - RULES.PIN_DEVICE_WINDOW_MS)),
          ),
        );

      const decision = decidePinAttempt({
        now,
        sessionStatus: (session?.status as 'active' | 'inactive' | 'closed' | undefined) ?? 'closed',
        pinLockedUntil: session?.pinLockedUntil ?? null,
        failedAttempts: session?.pinFailedAttempts ?? 0,
        pinMatches: session ? this.pin.matches(session.pinEncrypted, pin) : false,
        deviceFailedInWindow: Number(deviceFailsRow?.n ?? 0),
      });

      if (decision.kind === 'reject') {
        if (session && decision.code === 'pin_invalid') {
          await tx
            .update(schema.sessions)
            .set({ pinFailedAttempts: decision.newFailedAttempts, pinLockedUntil: decision.lockUntil ?? session.pinLockedUntil })
            .where(eq(schema.sessions.id, session.id));
          // Auditoria por dispositivo (rate limit) — não vai para rooms.
          await tx.insert(schema.domainEvents).values({ tenantId, type: 'session.pin_failed', aggregateType: 'device', aggregateId: deviceId, actor: { kind: 'customer', id: deviceId }, payload: { sessionId: session.id }, publishedAt: now });
          if (decision.lockUntil) {
            await this.outbox.append(tx, { tenantId, type: 'session.pin_locked', aggregateType: 'session', aggregateId: session.id, actor: { kind: 'system' }, payload: { until: decision.lockUntil.toISOString(), tableId } });
          }
        }
        throw new DomainError(decision.code, (MESSAGES[decision.code] ?? decision.code), decision.lockUntil ? { lockUntil: decision.lockUntil.toISOString() } : undefined);
      }

      if (session!.pinFailedAttempts > 0) await tx.update(schema.sessions).set({ pinFailedAttempts: 0 }).where(eq(schema.sessions.id, session!.id));
      const participantId = await this.addParticipant(tx, tenantId, session!, deviceId, 'pin');
      return { sessionId: session!.id, participantId };
    });
  }

  /** F05/F06 — visão do participante. 410 quando encerrada (F15). */
  async customerSession(tenantId: string, sessionId: string, participantId: string): Promise<CustomerSession> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [session] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
      const [participant] = await tx.select().from(schema.sessionParticipants).where(and(eq(schema.sessionParticipants.id, participantId), eq(schema.sessionParticipants.sessionId, sessionId)));
      if (!session || !participant) throw new NotFoundException({ code: 'not_found' });
      if (session.status === 'closed') throw new DomainError('session_closed', MESSAGES.session_closed ?? 'Atendimento encerrado');
      const [table] = await tx.select({ id: schema.tables.id, displayName: schema.tables.displayName }).from(schema.tables).where(eq(schema.tables.id, session.tableId));
      const [nRow] = await tx.select({ n: count() }).from(schema.sessionParticipants).where(eq(schema.sessionParticipants.sessionId, sessionId));
      const stats = await this.sessionStats(tx, [sessionId]);
      return {
        id: session.id,
        status: session.status as CustomerSession['status'],
        pin: this.pin.decrypt(session.pinEncrypted),
        table: table!,
        participant: { id: participant.id, ordinal: participant.ordinal, name: participant.displayName },
        participantsCount: Number(nRow?.n ?? 0),
        openedAt: session.openedAt.toISOString(),
        lastActivityAt: session.lastActivityAt.toISOString(),
        bill: await this.billState(tx, session),
        totalCents: stats.get(sessionId)?.total ?? 0,
      };
    });
  }

  /** RF-68 — cliente pede a conta. Idempotente; não encerra a sessão (BR-18). */
  async requestBill(tenantId: string, sessionId: string, participantId: string): Promise<CustomerSession> {
    await this.db.withTenantTx(tenantId, async (tx) => {
      const [session] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
      if (!session || session.status === 'closed') throw new DomainError('session_closed', MESSAGES.session_closed ?? 'Atendimento encerrado');
      if (session.billRequestedAt) return;
      await tx.update(schema.sessions).set({ billRequestedAt: new Date(), billRequestedByParticipantId: participantId, billAcknowledgedAt: null }).where(eq(schema.sessions.id, sessionId));
      const [table] = await tx.select({ displayName: schema.tables.displayName }).from(schema.tables).where(eq(schema.tables.id, session.tableId));
      await this.outbox.append(tx, { tenantId, type: 'bill.requested', aggregateType: 'session', aggregateId: sessionId, actor: { kind: 'customer', id: participantId }, payload: { tableId: session.tableId, tableName: table?.displayName, participantId } });
    });
    return this.customerSession(tenantId, sessionId, participantId);
  }

  /** Cliente desiste do pedido de conta (só antes de confirmado pelo staff). */
  async cancelBill(tenantId: string, sessionId: string, participantId: string): Promise<CustomerSession> {
    await this.db.withTenantTx(tenantId, async (tx) => {
      const [session] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
      if (!session || session.status === 'closed') throw new DomainError('session_closed', MESSAGES.session_closed ?? 'Atendimento encerrado');
      if (!session.billRequestedAt) return;
      if (session.billAcknowledgedAt) throw new DomainError('bill_already_acknowledged', 'A conta já está a caminho');
      await tx.update(schema.sessions).set({ billRequestedAt: null, billRequestedByParticipantId: null }).where(eq(schema.sessions.id, sessionId));
      await this.outbox.append(tx, { tenantId, type: 'bill.cancelled', aggregateType: 'session', aggregateId: sessionId, actor: { kind: 'customer', id: participantId }, payload: { tableId: session.tableId } });
    });
    return this.customerSession(tenantId, sessionId, participantId);
  }

  /** Staff confirma que vai levar a conta. A sessão continua aberta até o encerramento (pagamento). */
  async acknowledgeBill(tenantId: string, sessionId: string, actor: Actor): Promise<StaffSession> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [session] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
      if (!session) throw new NotFoundException({ code: 'not_found' });
      if (session.status === 'closed') throw new ConflictException({ code: 'session_closed', message: 'Sessão já encerrada' });
      if (!session.billRequestedAt) throw new DomainError('bill_not_requested', 'Esta mesa não pediu a conta');
      const [updated] = await tx.update(schema.sessions).set({ billAcknowledgedAt: new Date() }).where(eq(schema.sessions.id, sessionId)).returning();
      await this.outbox.append(tx, { tenantId, type: 'bill.acknowledged', aggregateType: 'session', aggregateId: sessionId, actor, payload: { tableId: session.tableId } });
      const [t] = await tx.select().from(schema.tables).where(eq(schema.tables.id, session.tableId));
      const stats = await this.sessionStats(tx, [sessionId]);
      return this.staffSessionDto(updated!, t!, stats.get(sessionId), await this.billState(tx, updated!));
    });
  }

  private async billState(tx: Tx, session: SessionRow): Promise<BillState> {
    let ordinal: number | null = null;
    if (session.billRequestedByParticipantId) {
      const [p] = await tx.select({ ordinal: schema.sessionParticipants.ordinal }).from(schema.sessionParticipants).where(eq(schema.sessionParticipants.id, session.billRequestedByParticipantId));
      ordinal = p?.ordinal ?? null;
    }
    return { requestedAt: session.billRequestedAt?.toISOString() ?? null, requestedByOrdinal: ordinal, acknowledgedAt: session.billAcknowledgedAt?.toISOString() ?? null };
  }

  /** PDR-012 (rev.): primeiro nome opcional, só para entrega; apagado ao encerrar. */
  async setParticipantName(tenantId: string, sessionId: string, participantId: string, name: string | null): Promise<CustomerSession> {
    await this.db.withTenantTx(tenantId, async (tx) => {
      const clean = name?.trim().slice(0, 30) || null;
      const rows = await tx
        .update(schema.sessionParticipants)
        .set({ displayName: clean })
        .where(and(eq(schema.sessionParticipants.id, participantId), eq(schema.sessionParticipants.sessionId, sessionId)))
        .returning({ id: schema.sessionParticipants.id });
      if (rows.length === 0) throw new NotFoundException({ code: 'not_found' });
    });
    return this.customerSession(tenantId, sessionId, participantId);
  }

  // =====================================================================
  // Staff
  // =====================================================================

  /** Mapa de mesas (6.1) com sessão viva e contagem de solicitações pendentes. */
  async staffTables(tenantId: string): Promise<StaffTable[]> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const tables = await tx.select().from(schema.tables).where(eq(schema.tables.tenantId, tenantId)).orderBy(asc(schema.tables.sortOrder), asc(schema.tables.displayName));
      const live = await tx.select().from(schema.sessions).where(and(eq(schema.sessions.tenantId, tenantId), inArray(schema.sessions.status, ['active', 'inactive'])));
      const pending = await tx
        .select({ tableId: schema.serviceRequests.tableId, type: schema.serviceRequests.type, n: count() })
        .from(schema.serviceRequests)
        .where(and(eq(schema.serviceRequests.tenantId, tenantId), eq(schema.serviceRequests.status, 'pending')))
        .groupBy(schema.serviceRequests.tableId, schema.serviceRequests.type);
      const stats = await this.sessionStats(tx, live.map((s) => s.id));

      const liveByTable = new Map(live.map((s) => [s.tableId, s]));
      const pendingByTable = new Map<string, { open: number; total: number }>();
      for (const p of pending) {
        const cur = pendingByTable.get(p.tableId) ?? { open: 0, total: 0 };
        cur.total += Number(p.n);
        if (p.type === 'open_session') cur.open += Number(p.n);
        pendingByTable.set(p.tableId, cur);
      }
      return tables.map((t) => {
        const s = liveByTable.get(t.id) ?? null;
        const p = pendingByTable.get(t.id) ?? { open: 0, total: 0 };
        return {
          id: t.id,
          displayName: t.displayName,
          state: deriveTableState({ isActive: t.isActive, liveSessionStatus: (s?.status as 'active' | 'inactive' | undefined) ?? null, hasPendingOpenRequest: p.open > 0 }),
          session: s ? this.staffSessionDto(s, t, stats.get(s.id), { requestedAt: s.billRequestedAt?.toISOString() ?? null, requestedByOrdinal: null, acknowledgedAt: s.billAcknowledgedAt?.toISOString() ?? null }) : null,
          pendingRequests: p.total,
        };
      });
    });
  }

  async staffRequests(tenantId: string): Promise<StaffRequest[]> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const rows = await tx
        .select({ r: schema.serviceRequests, t: schema.tables })
        .from(schema.serviceRequests)
        .innerJoin(schema.tables, eq(schema.tables.id, schema.serviceRequests.tableId))
        .where(and(eq(schema.serviceRequests.tenantId, tenantId), eq(schema.serviceRequests.status, 'pending')))
        .orderBy(asc(schema.serviceRequests.createdAt));
      const out: StaffRequest[] = [];
      for (const { r, t } of rows) out.push(await this.staffRequestDto(tx, r, t));
      return out;
    });
  }

  async staffSession(tenantId: string, sessionId: string): Promise<StaffSession> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [s] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
      if (!s) throw new NotFoundException({ code: 'not_found' });
      const [t] = await tx.select().from(schema.tables).where(eq(schema.tables.id, s.tableId));
      const stats = await this.sessionStats(tx, [s.id]);
      return this.staffSessionDto(s, t!, stats.get(s.id), await this.billState(tx, s));
    });
  }

  /** BR-05 / BR-06 / BR-10 — F03, F12, F13. */
  async approve(tenantId: string, requestId: string, resolution: RequestResolution | undefined, actor: Actor): Promise<StaffRequest> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [req] = await tx.select().from(schema.serviceRequests).where(eq(schema.serviceRequests.id, requestId));
      if (!req) throw new NotFoundException({ code: 'not_found' });
      const table = await this.lockTable(tx, req.tableId);
      const [fresh] = await tx.select().from(schema.serviceRequests).where(eq(schema.serviceRequests.id, requestId));
      if (fresh!.status !== 'pending') throw new ConflictException({ code: 'conflict', message: 'Solicitação já foi resolvida' });
      const live = await this.liveSession(tx, req.tableId);
      const now = new Date();

      let session: SessionRow;
      let finalResolution: RequestResolution;

      if (!live) {
        if (req.type === 'resume_session') throw new ConflictException({ code: 'conflict', message: 'A sessão desta solicitação não existe mais' });
        session = await this.openSession(tx, tenantId, table, 'operator', actor);
        await this.addParticipant(tx, tenantId, session, req.deviceId, 'approval');
        finalResolution = 'new_session';
      } else if (live.status === 'active' && req.type === 'open_session') {
        // Mesa ocupada: cliente deve usar PIN. A request não deveria existir; expira.
        await tx.update(schema.serviceRequests).set({ status: 'expired', resolvedAt: now }).where(eq(schema.serviceRequests.id, requestId));
        throw new ConflictException({ code: 'session_active', message: 'Mesa já está em atendimento; o cliente deve informar o PIN' });
      } else {
        if (!resolution) throw new DomainError('validation', 'Escolha: encerrar sessão anterior e iniciar nova, ou continuar sessão anterior');
        finalResolution = resolution;
        if (resolution === 'new_session') {
          await this.closeSessionRow(tx, tenantId, live, 'replaced_by_new', actor);
          session = await this.openSession(tx, tenantId, table, 'operator', actor);
          const migratedParticipantId = await this.addParticipant(tx, tenantId, session, req.deviceId, 'migrated');
          if (req.pendingOrderId) await this.migratePendingOrder(tx, req.pendingOrderId, session.id, migratedParticipantId);
        } else {
          session = live;
          if (req.type === 'open_session') await this.addParticipant(tx, tenantId, live, req.deviceId, 'approval');
          if (req.pendingOrderId) await this.confirmPendingOrder(tx, req.pendingOrderId);
          await tx.update(schema.sessions).set({ status: 'active', lastActivityAt: now }).where(eq(schema.sessions.id, live.id));
          await this.outbox.append(tx, { tenantId, type: 'session.resumed', aggregateType: 'session', aggregateId: live.id, actor, payload: { tableId: table.id } });
        }
      }

      const [updated] = await tx
        .update(schema.serviceRequests)
        .set({ status: 'approved', sessionId: session.id, resolvedAt: now, resolvedByUserId: actor.id ?? null, resolution: finalResolution })
        .where(eq(schema.serviceRequests.id, requestId))
        .returning();
      // Demais solicitações open_session pendentes da mesa expiram (BR-05).
      const others = await tx
        .update(schema.serviceRequests)
        .set({ status: 'expired', resolvedAt: now })
        .where(and(eq(schema.serviceRequests.tableId, table.id), eq(schema.serviceRequests.status, 'pending'), eq(schema.serviceRequests.type, 'open_session')))
        .returning({ id: schema.serviceRequests.id, deviceId: schema.serviceRequests.deviceId });
      for (const o of others) await this.outbox.append(tx, { tenantId, type: 'request.expired', aggregateType: 'request', aggregateId: o.id, actor: { kind: 'system' }, payload: { deviceId: o.deviceId, tableId: table.id, reason: 'table_taken' } });
      await this.outbox.append(tx, { tenantId, type: 'request.approved', aggregateType: 'request', aggregateId: requestId, actor, payload: { deviceId: req.deviceId, tableId: table.id, sessionId: session.id, resolution: finalResolution } });
      return this.staffRequestDto(tx, updated!, table);
    });
  }

  /** BR-04 — recusa e bloqueio. */
  async reject(tenantId: string, requestId: string, actor: Actor): Promise<StaffRequest> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [req] = await tx.select().from(schema.serviceRequests).where(eq(schema.serviceRequests.id, requestId));
      if (!req) throw new NotFoundException({ code: 'not_found' });
      const table = await this.lockTable(tx, req.tableId);
      const now = new Date();
      const [updated] = await tx
        .update(schema.serviceRequests)
        .set({ status: 'rejected', resolvedAt: now, resolvedByUserId: actor.id ?? null })
        .where(and(eq(schema.serviceRequests.id, requestId), eq(schema.serviceRequests.status, 'pending')))
        .returning();
      if (!updated) throw new ConflictException({ code: 'conflict', message: 'Solicitação já foi resolvida' });
      if (req.pendingOrderId) await tx.update(schema.orders).set({ status: 'cancelled', cancelledAt: now, cancelReason: 'request_rejected' }).where(eq(schema.orders.id, req.pendingOrderId));

      const rejections = await tx
        .select({ at: schema.serviceRequests.resolvedAt })
        .from(schema.serviceRequests)
        .where(and(eq(schema.serviceRequests.tableId, req.tableId), eq(schema.serviceRequests.deviceId, req.deviceId), eq(schema.serviceRequests.status, 'rejected'), gt(schema.serviceRequests.resolvedAt, new Date(now.getTime() - RULES.BLOCK_REJECTION_WINDOW_MS))));
      const block = shouldBlockDevice(now, rejections.map((r) => r.at!));
      if (block.block) {
        await tx.insert(schema.deviceBlocks).values({ tenantId, tableId: req.tableId, deviceId: req.deviceId, blockedUntil: block.until, reason: 'repeated_rejections' });
      }
      await this.outbox.append(tx, { tenantId, type: 'request.rejected', aggregateType: 'request', aggregateId: requestId, actor, payload: { deviceId: req.deviceId, tableId: table.id, blockedUntil: block.block ? block.until.toISOString() : null } });
      return this.staffRequestDto(tx, updated, table);
    });
  }

  /** BR-14 — garçom abre mesa livre (PDR-001). */
  async openByStaff(tenantId: string, tableId: string, actor: Actor, role: 'operator' | 'waiter'): Promise<StaffSession> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const table = await this.lockTable(tx, tableId);
      const state = await this.tableState(tx, table);
      if (state === 'disabled') throw new NotFoundException({ code: 'not_found' });
      if (state === 'occupied' || state === 'inactive') throw new ConflictException({ code: 'session_active', message: 'Mesa já está em atendimento' });
      // BR-20: sem isso, a equipe abriria mesa manualmente pra sempre e o bloqueio por
      // inadimplência nunca teria efeito — o cliente nunca precisaria usar o QR.
      const [tenant] = await tx
        .select({ billingStatus: schema.tenants.billingStatus, trialEndsAt: schema.tenants.trialEndsAt, subscriptionEndsAt: schema.tenants.subscriptionEndsAt })
        .from(schema.tenants)
        .where(eq(schema.tenants.id, tenantId));
      if (tenant && !evaluateTenantBilling({ billingStatus: tenant.billingStatus as 'trial' | 'active', trialEndsAt: tenant.trialEndsAt, subscriptionEndsAt: tenant.subscriptionEndsAt }).canServeCustomers) {
        throw new DomainError('billing_blocked', 'Assinatura vencida. Regularize o pagamento em Administração › Assinatura para abrir novas mesas.');
      }
      const session = await this.openSession(tx, tenantId, table, role, actor);
      const now = new Date();
      const others = await tx
        .update(schema.serviceRequests)
        .set({ status: 'expired', resolvedAt: now })
        .where(and(eq(schema.serviceRequests.tableId, tableId), eq(schema.serviceRequests.status, 'pending')))
        .returning({ id: schema.serviceRequests.id, deviceId: schema.serviceRequests.deviceId });
      for (const o of others) await this.outbox.append(tx, { tenantId, type: 'request.expired', aggregateType: 'request', aggregateId: o.id, actor: { kind: 'system' }, payload: { deviceId: o.deviceId, tableId, reason: 'opened_by_staff' } });
      return this.staffSessionDto(session, table, undefined);
    });
  }

  /** BR-13 / PDR-004 — F14. */
  async close(tenantId: string, sessionId: string, force: boolean, actor: Actor): Promise<StaffSession> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [s] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
      if (!s) throw new NotFoundException({ code: 'not_found' });
      const table = await this.lockTable(tx, s.tableId);
      const [fresh] = await tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId));
      if (fresh!.status === 'closed') throw new ConflictException({ code: 'session_closed', message: 'Sessão já encerrada' });
      const unacked = await tx.select({ id: schema.orders.id }).from(schema.orders).where(and(eq(schema.orders.sessionId, sessionId), eq(schema.orders.status, 'submitted')));
      const decision = decideCloseSession(unacked.map((o) => o.id), force);
      if (decision.kind === 'blocked') throw new DomainError('pending_orders', 'Há pedidos ainda não lançados no caixa', { pendingOrderIds: decision.pendingOrderIds });
      if (decision.reason === 'forced_with_pending') {
        const now = new Date();
        await tx.update(schema.orders).set({ status: 'cancelled', cancelledAt: now, cancelledByUserId: actor.id ?? null, cancelReason: 'session_closed_unacknowledged' }).where(inArray(schema.orders.id, decision.cancelOrderIds));
        for (const id of decision.cancelOrderIds) await this.outbox.append(tx, { tenantId, type: 'order.cancelled', aggregateType: 'order', aggregateId: id, actor, payload: { sessionId, reason: 'session_closed_unacknowledged' } });
      }
      const closed = await this.closeSessionRow(tx, tenantId, fresh!, decision.reason, actor);
      return this.staffSessionDto(closed, table, undefined);
    });
  }

  // =====================================================================
  // Jobs (BR-03 expiração, BR-08 inatividade) — rodam para todos os tenants
  // =====================================================================

  async expireRequests(): Promise<number> {
    return this.db.withPlatformTx(async (tx) => {
      const now = new Date();
      const rows = await tx
        .update(schema.serviceRequests)
        .set({ status: 'expired', resolvedAt: now })
        .where(and(eq(schema.serviceRequests.status, 'pending'), lt(schema.serviceRequests.expiresAt, now)))
        .returning();
      for (const r of rows) {
        if (r.pendingOrderId) await tx.update(schema.orders).set({ status: 'cancelled', cancelledAt: now, cancelReason: 'request_expired' }).where(eq(schema.orders.id, r.pendingOrderId));
        await this.outbox.append(tx, { tenantId: r.tenantId, type: 'request.expired', aggregateType: 'request', aggregateId: r.id, actor: { kind: 'system' }, payload: { deviceId: r.deviceId, tableId: r.tableId, reason: 'timeout' } });
      }
      return rows.length;
    });
  }

  async markInactiveSessions(): Promise<number> {
    return this.db.withPlatformTx(async (tx) => {
      const threshold = new Date(Date.now() - RULES.SESSION_INACTIVITY_MS);
      const rows = await tx
        .update(schema.sessions)
        .set({ status: 'inactive' })
        .where(and(eq(schema.sessions.status, 'active'), lte(schema.sessions.lastActivityAt, threshold)))
        .returning();
      for (const s of rows) await this.outbox.append(tx, { tenantId: s.tenantId, type: 'session.became_inactive', aggregateType: 'session', aggregateId: s.id, actor: { kind: 'system' }, payload: { tableId: s.tableId } });
      return rows.length;
    });
  }

  // =====================================================================
  // Internos
  // =====================================================================

  /** BR-16: serialização por mesa. */
  private async lockTable(tx: Tx, tableId: string) {
    const [table] = await tx.select().from(schema.tables).where(eq(schema.tables.id, tableId)).for('update');
    if (!table) throw new NotFoundException({ code: 'not_found' });
    return table;
  }

  private async liveSession(tx: Tx, tableId: string): Promise<SessionRow | null> {
    const [s] = await tx.select().from(schema.sessions).where(and(eq(schema.sessions.tableId, tableId), inArray(schema.sessions.status, ['active', 'inactive'])));
    return s ?? null;
  }

  private async tableState(tx: Tx, table: typeof schema.tables.$inferSelect): Promise<TableState> {
    const live = await this.liveSession(tx, table.id);
    const [pending] = await tx
      .select({ id: schema.serviceRequests.id })
      .from(schema.serviceRequests)
      .where(and(eq(schema.serviceRequests.tableId, table.id), eq(schema.serviceRequests.status, 'pending'), eq(schema.serviceRequests.type, 'open_session')))
      .limit(1);
    return deriveTableState({ isActive: table.isActive, liveSessionStatus: (live?.status as 'active' | 'inactive' | undefined) ?? null, hasPendingOpenRequest: Boolean(pending) });
  }

  private async openSession(tx: Tx, tenantId: string, table: typeof schema.tables.$inferSelect, openedBy: 'operator' | 'waiter', actor: Actor): Promise<SessionRow> {
    const pin = generatePin(cryptoRandomInt);
    const [session] = await tx
      .insert(schema.sessions)
      .values({ tenantId, tableId: table.id, status: 'active', pinEncrypted: this.pin.encrypt(pin), openedBy, openedByUserId: actor.kind === 'staff' ? (actor.id ?? null) : null })
      .returning();
    await this.outbox.append(tx, { tenantId, type: 'session.opened', aggregateType: 'session', aggregateId: session!.id, actor, payload: { tableId: table.id, tableName: table.displayName, openedBy } });
    return session!;
  }

  private async addParticipant(tx: Tx, tenantId: string, session: SessionRow, deviceId: string, via: 'approval' | 'pin' | 'migrated'): Promise<string> {
    const [existing] = await tx.select({ id: schema.sessionParticipants.id }).from(schema.sessionParticipants).where(and(eq(schema.sessionParticipants.sessionId, session.id), eq(schema.sessionParticipants.deviceId, deviceId)));
    if (existing) return existing.id;
    const [maxRow] = await tx.select({ max: sql<number>`coalesce(max(${schema.sessionParticipants.ordinal}), 0)` }).from(schema.sessionParticipants).where(eq(schema.sessionParticipants.sessionId, session.id));
    const ordinal = Number(maxRow?.max ?? 0) + 1;
    const [p] = await tx.insert(schema.sessionParticipants).values({ tenantId, sessionId: session.id, deviceId, ordinal, joinedVia: via }).returning({ id: schema.sessionParticipants.id });
    await this.outbox.append(tx, { tenantId, type: 'session.participant_joined', aggregateType: 'session', aggregateId: session.id, actor: { kind: 'customer', id: deviceId }, payload: { participantId: p!.id, ordinal, via, tableId: session.tableId } });
    return p!.id;
  }

  private async closeSessionRow(tx: Tx, tenantId: string, session: SessionRow, reason: string, actor: Actor): Promise<SessionRow> {
    // LGPD: nomes informais dos participantes só servem durante o atendimento.
    await tx.update(schema.sessionParticipants).set({ displayName: null }).where(eq(schema.sessionParticipants.sessionId, session.id));
    const [closed] = await tx
      .update(schema.sessions)
      .set({ status: 'closed', closedAt: new Date(), closedByUserId: actor.id ?? null, closeReason: reason })
      .where(eq(schema.sessions.id, session.id))
      .returning();
    await this.outbox.append(tx, { tenantId, type: 'session.closed', aggregateType: 'session', aggregateId: session.id, actor, payload: { tableId: session.tableId, reason } });
    return closed!;
  }

  /** BR-10a: pedido pendente migra para a nova sessão e entra na fila. */
  private async migratePendingOrder(tx: Tx, orderId: string, newSessionId: string, participantId: string) {
    const [o] = await tx.update(schema.orders).set({ sessionId: newSessionId, sequenceNo: 1, status: 'submitted', participantId }).where(eq(schema.orders.id, orderId)).returning();
    if (o) await this.outbox.append(tx, { tenantId: o.tenantId, type: 'order.created', aggregateType: 'order', aggregateId: o.id, actor: { kind: 'system' }, payload: { sessionId: newSessionId, sequenceNo: 1, totalCents: o.totalCents, migrated: true } });
  }
  /** BR-10b: pedido pendente é confirmado na sessão original. */
  private async confirmPendingOrder(tx: Tx, orderId: string) {
    const [o] = await tx.update(schema.orders).set({ status: 'submitted' }).where(eq(schema.orders.id, orderId)).returning();
    if (o) await this.outbox.append(tx, { tenantId: o.tenantId, type: 'order.created', aggregateType: 'order', aggregateId: o.id, actor: { kind: 'system' }, payload: { sessionId: o.sessionId, sequenceNo: o.sequenceNo, totalCents: o.totalCents, confirmed: true } });
  }

  private async sessionStats(tx: Tx, sessionIds: string[]) {
    const map = new Map<string, { participants: number; orders: number; unacked: number; total: number }>();
    if (sessionIds.length === 0) return map;
    const parts = await tx.select({ sid: schema.sessionParticipants.sessionId, n: count() }).from(schema.sessionParticipants).where(inArray(schema.sessionParticipants.sessionId, sessionIds)).groupBy(schema.sessionParticipants.sessionId);
    const orders = await tx
      .select({ sid: schema.orders.sessionId, status: schema.orders.status, n: count(), total: sum(schema.orders.totalCents) })
      .from(schema.orders)
      .where(inArray(schema.orders.sessionId, sessionIds))
      .groupBy(schema.orders.sessionId, schema.orders.status);
    for (const id of sessionIds) map.set(id, { participants: 0, orders: 0, unacked: 0, total: 0 });
    for (const p of parts) map.get(p.sid)!.participants = Number(p.n);
    for (const o of orders) {
      const m = map.get(o.sid)!;
      if (o.status === 'submitted' || o.status === 'acknowledged') {
        m.orders += Number(o.n);
        m.total += Number(o.total ?? 0);
      }
      if (o.status === 'submitted') m.unacked += Number(o.n);
    }
    return map;
  }

  private staffSessionDto(s: SessionRow, t: typeof schema.tables.$inferSelect, stats?: { participants: number; orders: number; unacked: number; total: number }, bill?: BillState): StaffSession {
    return {
      bill: bill ?? { requestedAt: s.billRequestedAt?.toISOString() ?? null, requestedByOrdinal: null, acknowledgedAt: s.billAcknowledgedAt?.toISOString() ?? null },
      id: s.id,
      status: s.status as StaffSession['status'],
      pin: this.pin.decrypt(s.pinEncrypted),
      table: { id: t.id, displayName: t.displayName },
      openedAt: s.openedAt.toISOString(),
      openedBy: s.openedBy as StaffSession['openedBy'],
      lastActivityAt: s.lastActivityAt.toISOString(),
      participantsCount: stats?.participants ?? 0,
      ordersCount: stats?.orders ?? 0,
      unacknowledgedCount: stats?.unacked ?? 0,
      totalCents: stats?.total ?? 0,
    };
  }

  private async staffRequestDto(tx: Tx, r: RequestRow, t: typeof schema.tables.$inferSelect): Promise<StaffRequest> {
    const live = await this.liveSession(tx, t.id);
    const stats = live ? await this.sessionStats(tx, [live.id]) : undefined;
    const st = live ? stats!.get(live.id) : undefined;
    return {
      id: r.id,
      type: r.type as StaffRequest['type'],
      status: r.status as StaffRequest['status'],
      table: { id: t.id, displayName: t.displayName, state: await this.tableState(tx, t) },
      liveSession: live ? { id: live.id, status: live.status as 'active' | 'inactive', lastActivityAt: live.lastActivityAt.toISOString(), ordersCount: st?.orders ?? 0, totalCents: st?.total ?? 0 } : null,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    };
  }

  private customerRequestDto(r: RequestRow): CustomerRequest {
    return { id: r.id, type: r.type as CustomerRequest['type'], status: r.status as CustomerRequest['status'], createdAt: r.createdAt.toISOString(), expiresAt: r.expiresAt.toISOString(), sessionId: r.status === 'approved' ? r.sessionId : null };
  }
}

/** Mensagens de erro do cliente (09-ux/copy.md). */
const MESSAGES: Record<string, string> = {
  bill_requested: 'A conta já foi pedida para esta mesa. Cancele o pedido de conta para pedir mais itens.',
  table_not_available: 'Mesa indisponível',
  tenant_blocked: 'Restaurante indisponível',
  device_blocked: 'Você fez várias solicitações recentemente. Aguarde alguns minutos ou chame um garçom.',
  table_rate_limited: 'Esta mesa recebeu muitas solicitações. Aguarde alguns minutos ou chame um garçom.',
  session_active: 'Esta mesa está em atendimento. Digite o PIN informado por quem iniciou o atendimento.',
  session_closed: 'Atendimento encerrado',
  pin_locked: 'Muitas tentativas. Aguarde alguns minutos ou chame um garçom.',
  device_rate_limited: 'Muitas tentativas. Aguarde alguns minutos ou chame um garçom.',
  pin_invalid: 'PIN inválido. Confira com quem está na mesa.',
  staff_offline: `${ptBR.offline.title}. ${ptBR.offline.body}`,
  // BR-20: mesma mensagem de tenant_blocked — o cliente não precisa saber que é cobrança.
  billing_blocked: 'Restaurante indisponível',
};

export { ForbiddenException };
