/**
 * F07, F09, F11–F14 com pedidos: BR-09, BR-11, BR-12, BR-13, BR-15, RNF-16.
 */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { schema, type DbHandle } from '@messa/db';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { DB } from '../src/modules/db/db.module';
import { createPlatformAdmin, markStaffOnline } from './helpers';
import { SessionService } from '../src/modules/service/session.service';

const run = Date.now().toString(36);
const PASSWORD = 'password123';

class Phone {
  cookies: Record<string, string> = {};
  constructor(private readonly app: NestFastifyApplication) {}
  async call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: Record<string, unknown>, headers: Record<string, string> = {}) {
    const res = await this.app.inject({ method, url, payload, headers: { ...headers, cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ') } });
    const set = res.headers['set-cookie'];
    for (const c of Array.isArray(set) ? set : set ? [set] : []) {
      const [k, v] = c.split(';')[0]!.split('=');
      if (v === '' || c.includes('Max-Age=0')) delete this.cookies[k!];
      else this.cookies[k!] = v!;
    }
    return res;
  }
}

describe('orders flow (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;
  let tenantId: string;
  let admin: string;
  let operator: string;
  let waiter: string;
  let table: { id: string; publicToken: string };
  let burger: string;
  let beer: string;
  let keyN = 0;
  const key = () => ({ 'idempotency-key': `k-${run}-${++keyN}` });
  const phone = () => new Phone(app);
  const staff = (token: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: Record<string, unknown>, headers: Record<string, string> = {}) =>
    app.inject({ method, url, payload, headers: { ...headers, authorization: `Bearer ${token}` } });

  /** Cliente A entra numa sessão nova da mesa (solicita, operador libera, consulta). */
  async function seatCustomer() {
    const a = phone();
    const r = await a.call('POST', `/public/tables/${table.publicToken}/requests`);
    expect(r.statusCode).toBe(201);
    expect((await staff(operator, 'POST', `/staff/requests/${r.json().id}/approve`, {})).statusCode).toBe(200);
    await a.call('GET', `/public/tables/${table.publicToken}/requests/${r.json().id}`);
    const s = await a.call('GET', '/public/session');
    expect(s.statusCode).toBe(200);
    return { phone: a, sessionId: s.json().id as string, pin: s.json().pin as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new DomainErrorFilter());
    await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<DbHandle>(DB);

    const passwordHash = await hash(PASSWORD);
    const platformEmail = `pfo-${run}@test.local`;
    const login = async (email: string) => (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })).json().accessToken as string;
    const pf = await createPlatformAdmin(app, db, platformEmail, PASSWORD);
    const t = await app.inject({ method: 'POST', url: '/platform/tenants', headers: { authorization: `Bearer ${pf}` }, payload: { name: 'Orders', slug: `orders-${run}`, adminEmail: `orders-${run}@test.local`, adminName: 'Admin', adminPassword: PASSWORD } });
    tenantId = t.json().id;
    markStaffOnline(app, tenantId); // BR-19: e2e não abre socket; declara o painel aberto.
    admin = await login(`orders-${run}@test.local`);
    for (const role of ['operator', 'waiter'] as const) {
      const inv = await staff(admin, 'POST', '/admin/members/invite', { name: role, email: `${role}-o-${run}@test.local`, role });
      if (inv.statusCode !== 201) throw new Error(inv.body);
      await db.withPlatformTx(async (tx) => {
        const [u] = await tx.select().from(schema.users).where(eq(schema.users.email, `${role}-o-${run}@test.local`));
        await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, u!.id));
        await tx.update(schema.memberships).set({ status: 'active' }).where(eq(schema.memberships.userId, u!.id));
      });
    }
    operator = await login(`operator-o-${run}@test.local`);
    waiter = await login(`waiter-o-${run}@test.local`);
    table = (await staff(admin, 'POST', '/admin/tables', { displayName: 'Mesa 7' })).json();
    const areas = (await staff(admin, 'GET', '/admin/service-areas')).json() as Array<{ id: string; key: string }>;
    const kitchen = areas.find((a) => a.key === 'kitchen')!.id;
    const bar = areas.find((a) => a.key === 'bar')!.id;
    const cat = (await staff(admin, 'POST', '/admin/categories', { name: 'Tudo' })).json().id;
    burger = (await staff(admin, 'POST', '/admin/products', { categoryId: cat, serviceAreaId: kitchen, name: 'X-Bacon', priceCents: 2990 })).json().id;
    beer = (await staff(admin, 'POST', '/admin/products', { categoryId: cat, serviceAreaId: bar, name: 'Cerveja', priceCents: 990 })).json().id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('F07: customer orders → snapshot/total server-side → operator queue → ack; idempotent; price change does not affect order', async () => {
    const { phone: a, sessionId } = await seatCustomer();
    // PDR-012 rev.: nome informal opcional aparece no pedido para o garçom
    const named = await a.call('PATCH', '/public/session/me', { name: '  Gabi  ' });
    expect(named.statusCode).toBe(200);
    expect(named.json().participant.name).toBe('Gabi');
    const k = key();
    const bad = await a.call('POST', '/public/session/orders', { items: [{ productId: burger, quantity: 2, priceCents: 1 }] });
    expect(bad.statusCode).toBe(400); // sem Idempotency-Key
    const res = await a.call('POST', '/public/session/orders', { items: [{ productId: burger, quantity: 2, notes: ' sem cebola ' }, { productId: beer, quantity: 3 }] }, k);
    expect(res.statusCode).toBe(201);
    const { order, awaitingConfirmation } = res.json();
    expect(awaitingConfirmation).toBe(false);
    expect(order.status).toBe('submitted');
    expect(order.sequenceNo).toBe(1);
    expect(order.totalCents).toBe(2 * 2990 + 3 * 990);
    expect(order.items.find((i: { productId: string }) => i.productId === burger).notes).toBe('sem cebola');
    expect(order.createdBy).toEqual({ kind: 'customer', participantOrdinal: 1, participantName: 'Gabi' });
    // idempotente
    const again = await a.call('POST', '/public/session/orders', { items: [{ productId: beer, quantity: 1 }] }, k);
    expect(again.json().order.id).toBe(order.id);
    // preço muda depois: snapshot preservado (BR-15)
    await staff(admin, 'PATCH', `/admin/products/${burger}`, { priceCents: 9999 });
    const cons = await a.call('GET', '/public/session/orders');
    expect(cons.json().totalCents).toBe(order.totalCents);
    expect(cons.json().orders[0].items[0].unitPriceCents).toBe(2990);
    // fila do operador
    const q = await staff(operator, 'GET', '/staff/orders');
    const inQueue = q.json().find((o: { id: string }) => o.id === order.id);
    expect(inQueue.table.displayName).toBe('Mesa 7');
    expect((await staff(waiter, 'POST', `/staff/orders/${order.id}/ack`)).statusCode).toBe(403);
    const ack = await staff(operator, 'POST', `/staff/orders/${order.id}/ack`);
    expect(ack.json().status).toBe('acknowledged');
    expect((await staff(operator, 'POST', `/staff/orders/${order.id}/ack`)).statusCode).toBe(409);
    // cliente não cancela pedido já lançado
    expect((await a.call('POST', `/public/session/orders/${order.id}/cancel`)).statusCode).toBe(409);
    // mapa mostra consumo
    const map = (await staff(operator, 'GET', '/staff/tables')).json().find((t: { id: string }) => t.id === table.id);
    expect(map.session.ordersCount).toBe(1);
    expect(map.session.totalCents).toBe(order.totalCents);
    // encerra sem pendências; nome é apagado ao encerrar (LGPD)
    expect((await staff(operator, 'POST', `/staff/sessions/${sessionId}/close`, {})).statusCode).toBe(200);
    const parts = await db.withTenantTx(tenantId, (tx) => tx.select().from(schema.sessionParticipants).where(eq(schema.sessionParticipants.sessionId, sessionId)));
    expect(parts.every((x) => x.displayName === null)).toBe(true);
    await staff(admin, 'PATCH', `/admin/products/${burger}`, { priceCents: 2990 });
  });

  it('F09/BR-12: kitchen closed rejects kitchen items with reasons, drinks still ok', async () => {
    const { phone: a, sessionId } = await seatCustomer();
    await staff(operator, 'PATCH', '/admin/service-areas/kitchen', { isOpen: false });
    const res = await a.call('POST', '/public/session/orders', { items: [{ productId: burger, quantity: 1 }, { productId: beer, quantity: 1 }] }, key());
    expect(res.statusCode).toBe(422);
    expect(res.json().details.rejected).toEqual([{ productId: burger, reason: 'area_closed', areaKey: 'kitchen' }]);
    const ok = await a.call('POST', '/public/session/orders', { items: [{ productId: beer, quantity: 1 }] }, key());
    expect(ok.statusCode).toBe(201);
    await staff(operator, 'PATCH', '/admin/service-areas/kitchen', { isOpen: true });
    // esgotado
    await staff(admin, 'PATCH', `/admin/products/${burger}`, { isAvailable: false });
    const un = await a.call('POST', '/public/session/orders', { items: [{ productId: burger, quantity: 1 }] }, key());
    expect(un.json().details.rejected[0].reason).toBe('unavailable');
    await staff(admin, 'PATCH', `/admin/products/${burger}`, { isAvailable: true });
    // encerrar com pedido não lançado ⇒ 409; forçar ⇒ cancela e fecha (PDR-004)
    const blocked = await staff(operator, 'POST', `/staff/sessions/${sessionId}/close`, {});
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('pending_orders');
    const forced = await staff(operator, 'POST', `/staff/sessions/${sessionId}/close`, { force: true });
    expect(forced.json().status).toBe('closed');
    const orders = await db.withTenantTx(tenantId, (tx) => tx.select().from(schema.orders).where(eq(schema.orders.sessionId, sessionId)));
    expect(orders[0]!.status).toBe('cancelled');
    expect(orders[0]!.cancelReason).toBe('session_closed_unacknowledged');
  });

  it('F08/PDR-002: waiter orders on inactive session ⇒ submitted and session reactivated', async () => {
    const { sessionId } = await seatCustomer();
    await db.withTenantTx(tenantId, (tx) => tx.update(schema.sessions).set({ lastActivityAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(schema.sessions.id, sessionId)));
    await app.get(SessionService).markInactiveSessions();
    const res = await staff(waiter, 'POST', `/staff/sessions/${sessionId}/orders`, { items: [{ productId: beer, quantity: 2 }] }, key());
    expect(res.statusCode).toBe(201);
    expect(res.json().order.status).toBe('submitted');
    expect(res.json().order.createdBy.kind).toBe('staff');
    const s = (await staff(waiter, 'GET', `/staff/sessions/${sessionId}`)).json();
    expect(s.status).toBe('active');
    await staff(operator, 'POST', `/staff/sessions/${sessionId}/close`, { force: true });
  });

  it('F11/F13: customer order on inactive session waits; "continue" confirms it in the same session', async () => {
    const { phone: a, sessionId } = await seatCustomer();
    await db.withTenantTx(tenantId, (tx) => tx.update(schema.sessions).set({ lastActivityAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(schema.sessions.id, sessionId)));
    await app.get(SessionService).markInactiveSessions();
    const res = await a.call('POST', '/public/session/orders', { items: [{ productId: beer, quantity: 1 }] }, key());
    expect(res.statusCode).toBe(201);
    expect(res.json().awaitingConfirmation).toBe(true);
    expect(res.json().order.status).toBe('pending_confirmation');
    const requestId = res.json().requestId as string;
    // não reenvia enquanto aguarda (BR-09)
    const dup = await a.call('POST', '/public/session/orders', { items: [{ productId: beer, quantity: 1 }] }, key());
    expect(dup.statusCode).toBe(409);
    expect(dup.json().code).toBe('awaiting_confirmation');
    const q = (await staff(operator, 'GET', '/staff/requests')).json().find((r: { id: string }) => r.id === requestId);
    expect(q.type).toBe('resume_session');
    const cont = await staff(operator, 'POST', `/staff/requests/${requestId}/approve`, { resolution: 'continue_session' });
    expect(cont.statusCode).toBe(200);
    const cons = (await a.call('GET', '/public/session/orders')).json();
    expect(cons.orders[0].status).toBe('submitted');
    expect((await a.call('GET', '/public/session')).json().status).toBe('active');
    await staff(operator, 'POST', `/staff/sessions/${sessionId}/close`, { force: true });
  });

  it('F11/F12: "new session" migrates the pending order and preserves the old bill', async () => {
    const { phone: a, sessionId: oldId } = await seatCustomer();
    await a.call('POST', '/public/session/orders', { items: [{ productId: burger, quantity: 1 }] }, key());
    const first = (await staff(operator, 'GET', '/staff/orders')).json().find((o: { sessionId: string }) => o.sessionId === oldId);
    await staff(operator, 'POST', `/staff/orders/${first.id}/ack`);
    await db.withTenantTx(tenantId, (tx) => tx.update(schema.sessions).set({ lastActivityAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(schema.sessions.id, oldId)));
    await app.get(SessionService).markInactiveSessions();
    // cliente B entra com o PIN antigo (ainda válido) e pede
    const pin = (await staff(operator, 'GET', `/staff/sessions/${oldId}`)).json().pin;
    const b = phone();
    expect((await b.call('POST', `/public/tables/${table.publicToken}/join`, { pin })).statusCode).toBe(200);
    const res = await b.call('POST', '/public/session/orders', { items: [{ productId: beer, quantity: 4 }] }, key());
    expect(res.json().awaitingConfirmation).toBe(true);
    const nw = await staff(operator, 'POST', `/staff/requests/${res.json().requestId}/approve`, { resolution: 'new_session' });
    expect(nw.statusCode).toBe(200);
    await b.call('GET', `/public/tables/${table.publicToken}/requests/${res.json().requestId}`);
    const bs = (await b.call('GET', '/public/session')).json();
    expect(bs.id).not.toBe(oldId);
    const cons = (await b.call('GET', '/public/session/orders')).json();
    expect(cons.orders).toHaveLength(1);
    expect(cons.orders[0].status).toBe('submitted');
    expect(cons.orders[0].sequenceNo).toBe(1);
    expect(cons.totalCents).toBe(4 * 990);
    // comanda antiga preservada e fechada; A perdeu acesso
    const oldOrders = await db.withTenantTx(tenantId, (tx) => tx.select().from(schema.orders).where(eq(schema.orders.sessionId, oldId)));
    expect(oldOrders).toHaveLength(1);
    expect(oldOrders[0]!.status).toBe('acknowledged');
    expect((await a.call('GET', '/public/session')).statusCode).toBe(410);
    // pedido migrado está na fila com a mesa
    const q = (await staff(operator, 'GET', '/staff/orders')).json().find((o: { id: string }) => o.id === cons.orders[0].id);
    expect(q.table.id).toBe(table.id);
    // cliente cancela o próprio pedido enquanto não lançado (RF-67)
    const cancel = await b.call('POST', `/public/session/orders/${cons.orders[0].id}/cancel`);
    expect(cancel.json().status).toBe('cancelled');
    expect((await b.call('GET', '/public/session/orders')).json().totalCents).toBe(0);
  });
});
