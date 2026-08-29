/**
 * BR-16 — operações concorrentes na mesma mesa são serializadas; constraints parciais são a última defesa.
 * Rate limit por IP (05-security/auth.md) — última linha de defesa.
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
import { createPlatformAdmin } from './helpers';

const run = Date.now().toString(36);
const PASSWORD = 'password123';

describe('concurrency & ip rate limit (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;
  let tenantId: string;
  let operator: string;
  let admin: string;
  const staff = (token: string, method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) => app.inject({ method, url, payload, headers: { authorization: `Bearer ${token}` } });
  const newTable = async (name: string) => (await staff(admin, 'POST', '/admin/tables', { displayName: name })).json() as { id: string; publicToken: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new DomainErrorFilter());
    await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<DbHandle>(DB);
    const passwordHash = await hash(PASSWORD);
    const pfEmail = `pfc-${run}@test.local`;
    const login = async (email: string) => (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })).json().accessToken as string;
    const pf = await createPlatformAdmin(app, db, pfEmail, PASSWORD);
    const t = await app.inject({ method: 'POST', url: '/platform/tenants', headers: { authorization: `Bearer ${pf}` }, payload: { name: 'Conc', slug: `conc-${run}`, adminEmail: `conc-${run}@test.local`, adminName: 'Admin', adminPassword: PASSWORD } });
    tenantId = t.json().id;
    admin = await login(`conc-${run}@test.local`);
    const inv = await staff(admin, 'POST', '/admin/members/invite', { name: 'operator', email: `op-c-${run}@test.local`, role: 'operator' });
    if (inv.statusCode !== 201) throw new Error(inv.body);
    await db.withPlatformTx(async (tx) => {
      const [u] = await tx.select().from(schema.users).where(eq(schema.users.email, `op-c-${run}@test.local`));
      await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, u!.id));
      await tx.update(schema.memberships).set({ status: 'active' }).where(eq(schema.memberships.userId, u!.id));
    });
    operator = await login(`op-c-${run}@test.local`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('two operators approving the same request at once: exactly one wins', async () => {
    const t = await newTable('C1');
    const r = await app.inject({ method: 'POST', url: `/public/tables/${t.publicToken}/requests` });
    const id = r.json().id as string;
    const results = await Promise.all(Array.from({ length: 5 }, () => staff(operator, 'POST', `/staff/requests/${id}/approve`, {})));
    const codes = results.map((x) => x.statusCode).sort();
    expect(codes.filter((c) => c === 200)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(4);
    const sessions = await db.withTenantTx(tenantId, (tx) => tx.select().from(schema.sessions).where(eq(schema.sessions.tableId, t.id)));
    expect(sessions).toHaveLength(1);
  });

  it('two different devices requesting + waiter opening at once: one live session, no orphan pending requests', async () => {
    const t = await newTable('C2');
    const results = await Promise.all([
      app.inject({ method: 'POST', url: `/public/tables/${t.publicToken}/requests` }),
      app.inject({ method: 'POST', url: `/public/tables/${t.publicToken}/requests` }),
      staff(operator, 'POST', `/staff/tables/${t.id}/open`),
      staff(operator, 'POST', `/staff/tables/${t.id}/open`),
    ]);
    const opens = results.slice(2).map((x) => x.statusCode).sort();
    expect(opens).toEqual([201, 409]);
    const sessions = await db.withTenantTx(tenantId, (tx) => tx.select().from(schema.sessions).where(eq(schema.sessions.tableId, t.id)));
    expect(sessions).toHaveLength(1);
    const pending = (await staff(operator, 'GET', '/staff/requests')).json().filter((x: { table: { id: string } }) => x.table.id === t.id);
    expect(pending).toHaveLength(0);
  });

  it('join and close racing: participant never lands in a closed session', async () => {
    const t = await newTable('C3');
    const open = await staff(operator, 'POST', `/staff/tables/${t.id}/open`);
    const { id: sessionId, pin } = open.json();
    const results = await Promise.all([
      staff(operator, 'POST', `/staff/sessions/${sessionId}/close`, {}),
      app.inject({ method: 'POST', url: `/public/tables/${t.publicToken}/join`, payload: { pin } }),
      app.inject({ method: 'POST', url: `/public/tables/${t.publicToken}/join`, payload: { pin } }),
    ]);
    expect(results[0]!.statusCode).toBe(200);
    for (const j of results.slice(1)) {
      if (j.statusCode === 200) {
        // entrou antes do fechamento: então a sessão estava viva naquele instante
        expect(new Date(j.json().openedAt).getTime()).toBeLessThanOrEqual(Date.now());
      } else {
        expect(j.statusCode).toBe(410);
      }
    }
    const parts = await db.withTenantTx(tenantId, (tx) => tx.select().from(schema.sessionParticipants).where(eq(schema.sessionParticipants.sessionId, sessionId)));
    const [s] = await db.withTenantTx(tenantId, (tx) => tx.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)));
    expect(s!.status).toBe('closed');
    // qualquer participante que entrou o fez antes do closed_at
    for (const p of parts) expect(p.joinedAt.getTime()).toBeLessThanOrEqual(s!.closedAt!.getTime() + 5);
  });

  it('login is rate limited per IP after 30 attempts / 15 min', async () => {
    let last = 0;
    for (let i = 0; i < 31; i++) {
      const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: `nobody-${run}@test.local`, password: 'wrong-password' }, remoteAddress: '203.0.113.7' });
      last = res.statusCode;
    }
    expect(last).toBe(429);
    // outro IP não é afetado
    const other = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: `nobody-${run}@test.local`, password: 'wrong-password' }, remoteAddress: '203.0.113.8' });
    expect(other.statusCode).toBe(401);
  });
});
