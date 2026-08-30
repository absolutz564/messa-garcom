/** RF-68 / BR-18 — pedido de conta. */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { schema, type DbHandle } from '@messa/db';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { DB } from '../src/modules/db/db.module';
import { createPlatformAdmin } from './helpers';

const run = Date.now().toString(36);
const PASSWORD = 'password123';

class Phone {
  cookies: Record<string, string> = {};
  constructor(private readonly app: NestFastifyApplication) {}
  async call(method: 'GET' | 'POST' | 'DELETE', url: string, payload?: Record<string, unknown>, headers: Record<string, string> = {}) {
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

describe('bill request (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;
  let admin: string;
  let operator: string;
  let waiter: string;
  let table: { id: string; publicToken: string };
  let beer: string;
  let keyN = 0;
  const key = () => ({ 'idempotency-key': `b-${run}-${++keyN}` });
  const staff = (token: string, method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new DomainErrorFilter());
    await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<DbHandle>(DB);
    const passwordHash = await hash(PASSWORD);
    const login = async (email: string) => (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })).json().accessToken as string;
    const pf = await createPlatformAdmin(app, db, `pfb-${run}@test.local`, PASSWORD);
    await app.inject({ method: 'POST', url: '/platform/tenants', headers: { authorization: `Bearer ${pf}` }, payload: { name: 'Bill', slug: `bill-${run}`, adminEmail: `bill-${run}@test.local`, adminName: 'Admin', adminPassword: PASSWORD } });
    admin = await login(`bill-${run}@test.local`);
    for (const role of ['operator', 'waiter'] as const) {
      await staff(admin, 'POST', '/admin/members/invite', { name: role, email: `${role}-b-${run}@test.local`, role });
      await db.withPlatformTx(async (tx) => {
        const [u] = await tx.select().from(schema.users).where(eq(schema.users.email, `${role}-b-${run}@test.local`));
        await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, u!.id));
        await tx.update(schema.memberships).set({ status: 'active' }).where(eq(schema.memberships.userId, u!.id));
      });
    }
    operator = await login(`operator-b-${run}@test.local`);
    waiter = await login(`waiter-b-${run}@test.local`);
    table = (await staff(admin, 'POST', '/admin/tables', { displayName: 'Mesa 9' })).json();
    const areas = (await staff(admin, 'GET', '/admin/service-areas')).json() as Array<{ id: string; key: string }>;
    const cat = (await staff(admin, 'POST', '/admin/categories', { name: 'Bebidas' })).json().id;
    beer = (await staff(admin, 'POST', '/admin/products', { categoryId: cat, serviceAreaId: areas.find((a) => a.key === 'bar')!.id, name: 'Cerveja', priceCents: 990 })).json().id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('customer requests bill → staff sees it, acknowledges → customer sees "on the way"; close after payment', async () => {
    const a = new Phone(app);
    const r = await a.call('POST', `/public/tables/${table.publicToken}/requests`);
    await staff(operator, 'POST', `/staff/requests/${r.json().id}/approve`, {});
    await a.call('GET', `/public/tables/${table.publicToken}/requests/${r.json().id}`);
    const ord = await a.call('POST', '/public/session/orders', { items: [{ productId: beer, quantity: 2 }] }, key());
    expect(ord.statusCode).toBe(201);
    const sessionId = ord.json().order.sessionId as string;
    await staff(operator, 'POST', `/staff/orders/${ord.json().order.id}/ack`);

    // pede a conta (idempotente)
    const bill = await a.call('POST', '/public/session/bill');
    expect(bill.statusCode).toBe(200);
    expect(bill.json().bill.requestedAt).toBeTruthy();
    expect(bill.json().bill.acknowledgedAt).toBeNull();
    expect(bill.json().totalCents).toBe(1980);
    const again = await a.call('POST', '/public/session/bill');
    expect(again.json().bill.requestedAt).toBe(bill.json().bill.requestedAt);

    // cliente não pede mais itens; staff ainda pode
    const blocked = await a.call('POST', '/public/session/orders', { items: [{ productId: beer, quantity: 1 }] }, key());
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('bill_requested');
    expect((await staff(waiter, 'POST', `/staff/sessions/${sessionId}/orders`, { items: [{ productId: beer, quantity: 1 }] }, )).statusCode).toBe(400); // sem Idempotency-Key → 400 (só confirma que não é 409)

    // painel vê a conta pedida
    const map = (await staff(operator, 'GET', '/staff/tables')).json().find((t: { id: string }) => t.id === table.id);
    expect(map.session.bill.requestedAt).toBeTruthy();
    // evento gravado
    const ev = await db.withPlatformTx((tx) => tx.select().from(schema.domainEvents).where(eq(schema.domainEvents.type, 'bill.requested')));
    expect(ev.some((e) => e.aggregateId === sessionId)).toBe(true);

    // cliente desiste e pede de novo
    const cancel = await a.call('DELETE', '/public/session/bill');
    expect(cancel.json().bill.requestedAt).toBeNull();
    await a.call('POST', '/public/session/bill');

    // garçom confirma
    const ack = await staff(waiter, 'POST', `/staff/sessions/${sessionId}/bill/ack`);
    expect(ack.statusCode).toBe(200);
    expect(ack.json().bill.acknowledgedAt).toBeTruthy();
    expect(ack.json().status).toBe('active'); // sessão continua aberta
    const cust = await a.call('GET', '/public/session');
    expect(cust.json().bill.acknowledgedAt).toBeTruthy();
    // depois de confirmada, cliente não cancela
    expect((await a.call('DELETE', '/public/session/bill')).statusCode).toBe(409);
    // ack duplicado / sem pedido
    expect((await staff(operator, 'POST', `/staff/sessions/${sessionId}/bill/ack`)).statusCode).toBe(200);

    // pagamento → encerrar
    expect((await staff(operator, 'POST', `/staff/sessions/${sessionId}/close`, {})).statusCode).toBe(200);
    expect((await a.call('GET', '/public/session')).statusCode).toBe(410);
    const t2 = (await staff(operator, 'GET', '/staff/tables')).json().find((t: { id: string }) => t.id === table.id);
    expect(t2.state).toBe('free');
  });

  it('bill ack on a table without a request → 409', async () => {
    const open = await staff(operator, 'POST', `/staff/tables/${table.id}/open`);
    const res = await staff(operator, 'POST', `/staff/sessions/${open.json().id}/bill/ack`);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('bill_not_requested');
    await staff(operator, 'POST', `/staff/sessions/${open.json().id}/close`, {});
  });
});
