/**
 * BR-19 / PDR-016 — restaurante sem conexão. A ordem dos testes importa: o tenant nasce
 * offline (nenhum socket de staff jamais existiu) e só fica online quando o teste declara.
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

const run = Date.now().toString(36);
const PASSWORD = 'password123';

class Phone {
  cookies: Record<string, string> = {};
  constructor(private readonly app: NestFastifyApplication) {}
  async call(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>, headers: Record<string, string> = {}) {
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

describe('staff presence (e2e) — BR-19', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;
  let tenantId: string;
  let operator: string;
  let table: { id: string; publicToken: string };
  let beer: string;
  let keyN = 0;
  const key = () => ({ 'idempotency-key': `p-${run}-${++keyN}` });
  const phone = () => new Phone(app);
  const staff = (token: string, method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });

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
    const pf = await createPlatformAdmin(app, db, `pfp-${run}@test.local`, PASSWORD);
    const t = await app.inject({ method: 'POST', url: '/platform/tenants', headers: { authorization: `Bearer ${pf}` }, payload: { name: 'Presence', slug: `pres-${run}`, adminEmail: `pres-${run}@test.local`, adminName: 'Admin', adminPassword: PASSWORD } });
    tenantId = t.json().id;
    const admin = await login(`pres-${run}@test.local`);
    const inv = await staff(admin, 'POST', '/admin/members/invite', { name: 'operator', email: `op-p-${run}@test.local`, role: 'operator' });
    if (inv.statusCode !== 201) throw new Error(inv.body);
    await db.withPlatformTx(async (tx) => {
      const [u] = await tx.select().from(schema.users).where(eq(schema.users.email, `op-p-${run}@test.local`));
      await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, u!.id));
      await tx.update(schema.memberships).set({ status: 'active' }).where(eq(schema.memberships.userId, u!.id));
    });
    operator = await login(`op-p-${run}@test.local`);
    table = (await staff(admin, 'POST', '/admin/tables', { displayName: 'Mesa P1' })).json();
    const areas = (await staff(admin, 'GET', '/admin/service-areas')).json() as Array<{ id: string; key: string }>;
    const cat = (await staff(admin, 'POST', '/admin/categories', { name: 'Bebidas' })).json().id;
    beer = (await staff(admin, 'POST', '/admin/products', { categoryId: cat, serviceAreaId: areas.find((a) => a.key === 'bar')!.id, name: 'Cerveja', priceCents: 990 })).json().id;
  });

  afterAll(async () => {
    await app.close();
  });

  // --- equipe offline (nenhum socket de staff jamais conectou neste tenant)

  it('expõe staffOnline=false na mesa pública e no endpoint de presença', async () => {
    const pub = await app.inject({ method: 'GET', url: `/public/tables/${table.publicToken}` });
    expect(pub.json().staffOnline).toBe(false);
    const pres = await app.inject({ method: 'GET', url: `/public/tables/${table.publicToken}/presence` });
    expect(pres.statusCode).toBe(200);
    expect(pres.json()).toEqual({ staffOnline: false });
  });

  it('recusa iniciar atendimento com 409 staff_offline', async () => {
    const a = phone();
    const r = await a.call('POST', `/public/tables/${table.publicToken}/requests`);
    expect(r.statusCode).toBe(409);
    expect(r.json().code).toBe('staff_offline');
  });

  it('não cria solicitação nenhuma na fila do operador', async () => {
    const queue = await staff(operator, 'GET', '/staff/requests');
    expect(queue.json().filter((r: { table: { id: string } }) => r.table.id === table.id)).toHaveLength(0);
  });

  // --- equipe online

  it('com a equipe conectada, o fluxo volta ao normal', async () => {
    markStaffOnline(app, tenantId);
    const pres = await app.inject({ method: 'GET', url: `/public/tables/${table.publicToken}/presence` });
    expect(pres.json()).toEqual({ staffOnline: true });

    const a = phone();
    const r = await a.call('POST', `/public/tables/${table.publicToken}/requests`);
    expect(r.statusCode).toBe(201);
    expect((await staff(operator, 'POST', `/staff/requests/${r.json().id}/approve`, {})).statusCode).toBe(200);
    await a.call('GET', `/public/tables/${table.publicToken}/requests/${r.json().id}`);

    // Pedido em sessão ativa nunca depende de presença — só o caminho `resume_session` depende.
    const o = await a.call('POST', '/public/session/orders', { items: [{ productId: beer, quantity: 1 }] }, key());
    expect(o.statusCode).toBe(201);
    expect(o.json().awaitingConfirmation).toBe(false);
  });
});
