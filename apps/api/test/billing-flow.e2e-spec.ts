/** BR-20 / PDR-017 / ADR-006 — cobrança da assinatura. */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { DB } from '../src/modules/db/db.module';
import { createPlatformAdmin, markStaffOnline } from './helpers';

const run = Date.now().toString(36);
const PASSWORD = 'password123';

describe('billing (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;
  let admin: string;
  let tenantId: string;
  let table: { id: string; publicToken: string };
  const staff = (token: string, method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new DomainErrorFilter());
    await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<DbHandle>(DB);
    const login = async (email: string) => (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })).json().accessToken as string;
    const pf = await createPlatformAdmin(app, db, `pfbill-${run}@test.local`, PASSWORD);
    const created = await app.inject({ method: 'POST', url: '/platform/tenants', headers: { authorization: `Bearer ${pf}` }, payload: { name: 'Billing', slug: `billing-${run}`, adminEmail: `billing-${run}@test.local`, adminName: 'Admin', adminPassword: PASSWORD } });
    tenantId = created.json().id;
    admin = await login(`billing-${run}@test.local`);
    markStaffOnline(app, tenantId);
    table = (await staff(admin, 'POST', '/admin/tables', { displayName: 'Mesa Billing' })).json();
  });

  afterAll(async () => {
    await app.close();
  });

  it('tenant novo nasce em trial de 14 dias e libera pedidos normalmente', async () => {
    const res = await staff(admin, 'GET', '/admin/billing');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.phase).toBe('trial');
    expect(body.daysLeft).toBeGreaterThanOrEqual(13);
    expect(body.plan).toBeNull();

    const open = await app.inject({ method: 'POST', url: `/public/tables/${table.publicToken}/requests` });
    expect(open.statusCode).toBe(201);
  });

  it('escolhe um plano', async () => {
    const res = await staff(admin, 'POST', '/admin/billing/plan', { plan: 'annual' });
    expect(res.statusCode).toBe(200);
    expect(res.json().plan).toBe('annual');
  });

  it('sem MERCADO_PAGO_ACCESS_TOKEN configurado, gerar Pix devolve billing_unavailable (nada quebra)', async () => {
    const res = await staff(admin, 'POST', '/admin/billing/pix');
    expect(res.statusCode).toBe(503);
    expect(res.json().code).toBe('billing_unavailable');
  });

  it('vencido dentro da carência (3 dias): status past_due mas ainda libera open_session', async () => {
    const pastDue = new Date(Date.now() - 1 * 86_400_000);
    await db.withPlatformTx((tx) => tx.update(schema.tenants).set({ billingStatus: 'active', trialEndsAt: null, subscriptionEndsAt: pastDue }).where(eq(schema.tenants.id, tenantId)));

    const status = await staff(admin, 'GET', '/admin/billing');
    expect(status.json().phase).toBe('past_due');

    const open = await app.inject({ method: 'POST', url: `/public/tables/${table.publicToken}/requests` });
    expect(open.statusCode).toBe(201);
  });

  it('vencido além da carência: bloqueia open_session mas login/tela de cobrança continuam de pé', async () => {
    const blockedSince = new Date(Date.now() - 5 * 86_400_000);
    await db.withPlatformTx((tx) => tx.update(schema.tenants).set({ subscriptionEndsAt: blockedSince }).where(eq(schema.tenants.id, tenantId)));

    const open = await app.inject({ method: 'POST', url: `/public/tables/${table.publicToken}/requests` });
    expect(open.statusCode).toBe(403);
    expect(open.json().code).toBe('billing_blocked');

    // BR-14: o garçom não pode virar uma via de escape do bloqueio abrindo mesa livre direto.
    const table2 = (await staff(admin, 'POST', '/admin/tables', { displayName: 'Mesa Billing 2' })).json();
    const openByStaff = await staff(admin, 'POST', `/staff/tables/${table2.id}/open`);
    expect(openByStaff.statusCode).toBe(403);
    expect(openByStaff.json().code).toBe('billing_blocked');

    // Login e a tela de cobrança continuam acessíveis — é o próprio admin que precisa pagar.
    const status = await staff(admin, 'GET', '/admin/billing');
    expect(status.statusCode).toBe(200);
    expect(status.json().phase).toBe('blocked');
  });

  it('Super Admin vê a fase de cobrança na lista de tenants, sem afetar tenants.status', async () => {
    const pf = await createPlatformAdmin(app, db, `pfbill2-${run}@test.local`, PASSWORD);
    const list = await staff(pf, 'GET', '/platform/tenants');
    const row = list.json().find((t: { id: string }) => t.id === tenantId);
    expect(row.billing.phase).toBe('blocked');
    expect(row.status).toBe('active'); // bloqueio de cobrança nunca escreve em tenants.status (ADR-006)
  });
});
