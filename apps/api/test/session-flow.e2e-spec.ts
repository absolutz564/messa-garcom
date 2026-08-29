/**
 * Fluxos F02–F06, F12–F15 e regras BR-03/04/05/07/08/10/13/14 de ponta a ponta.
 * Requer DATABASE_URL apontando para um banco migrado.
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
import { SessionService } from '../src/modules/service/session.service';

const run = Date.now().toString(36);
const PASSWORD = 'password123';

/** Simula um celular: guarda os cookies HttpOnly recebidos. */
class Phone {
  cookies: Record<string, string> = {};
  constructor(private readonly app: NestFastifyApplication) {}
  async call(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) {
    const res = await this.app.inject({ method, url, payload, headers: { cookie: Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ') } });
    const set = res.headers['set-cookie'];
    for (const c of Array.isArray(set) ? set : set ? [set] : []) {
      const [pair] = c.split(';');
      const [k, v] = pair!.split('=');
      if (v === '' || c.includes('Max-Age=0') || c.includes('Expires=Thu, 01 Jan 1970')) delete this.cookies[k!];
      else this.cookies[k!] = v!;
    }
    return res;
  }
}

describe('session flow (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;
  let tenantId: string;
  let operator: string;
  let waiter: string;
  let tables: Array<{ id: string; publicToken: string; displayName: string }>;
  const phone = () => new Phone(app);
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
    const platformEmail = `pf-${run}@test.local`;
    const login = async (email: string) => (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD } })).json().accessToken as string;
    const pf = await createPlatformAdmin(app, db, platformEmail, PASSWORD);
    const t = await app.inject({ method: 'POST', url: '/platform/tenants', headers: { authorization: `Bearer ${pf}` }, payload: { name: 'Flow', slug: `flow-${run}`, adminEmail: `flow-${run}@test.local`, adminName: 'Admin', adminPassword: PASSWORD } });
    tenantId = t.json().id;
    const admin = await login(`flow-${run}@test.local`);
    for (const role of ['operator', 'waiter'] as const) {
      const inv = await app.inject({ method: 'POST', url: '/admin/members/invite', headers: { authorization: `Bearer ${admin}` }, payload: { name: role, email: `${role}-${run}@test.local`, role } });
      if (inv.statusCode !== 201) throw new Error(`invite failed: ${inv.statusCode} ${inv.body}`);
      await db.withPlatformTx(async (tx) => {
        const [u] = await tx.select().from(schema.users).where(eq(schema.users.email, `${role}-${run}@test.local`));
        await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, u!.id));
        await tx.update(schema.memberships).set({ status: 'active' }).where(eq(schema.memberships.userId, u!.id));
      });
    }
    operator = await login(`operator-${run}@test.local`);
    waiter = await login(`waiter-${run}@test.local`);
    tables = [];
    for (const n of ['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5']) {
      tables.push((await app.inject({ method: 'POST', url: '/admin/tables', headers: { authorization: `Bearer ${admin}` }, payload: { displayName: n } })).json());
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('F02–F06: request → approve → session with PIN → second phone joins with PIN', async () => {
    const [t] = tables;
    const a = phone();
    const r1 = await a.call('POST', `/public/tables/${t!.publicToken}/requests`);
    expect(r1.statusCode).toBe(201);
    expect(r1.json().status).toBe('pending');
    expect(a.cookies.messa_device).toBeDefined();
    // idempotente por (mesa, dispositivo)
    const r1b = await a.call('POST', `/public/tables/${t!.publicToken}/requests`);
    expect(r1b.json().id).toBe(r1.json().id);
    // mesa aparece como requested
    const pub = await a.call('GET', `/public/tables/${t!.publicToken}`);
    expect(pub.json().state).toBe('requested');

    const queue = await staff(operator, 'GET', '/staff/requests');
    expect(queue.json().map((r: { id: string }) => r.id)).toContain(r1.json().id);
    // garçom não aprova
    expect((await staff(waiter, 'POST', `/staff/requests/${r1.json().id}/approve`, {})).statusCode).toBe(403);
    const ap = await staff(operator, 'POST', `/staff/requests/${r1.json().id}/approve`, {});
    expect(ap.statusCode).toBe(200);
    expect(ap.json().status).toBe('approved');
    // segunda aprovação ⇒ 409
    expect((await staff(operator, 'POST', `/staff/requests/${r1.json().id}/approve`, {})).statusCode).toBe(409);

    // cliente A consulta: aprovada ⇒ cookie de participante
    const st = await a.call('GET', `/public/tables/${t!.publicToken}/requests/${r1.json().id}`);
    expect(st.json().status).toBe('approved');
    expect(a.cookies.messa_participant).toBeDefined();
    const sess = await a.call('GET', '/public/session');
    expect(sess.statusCode).toBe(200);
    expect(sess.json().pin).toMatch(/^\d{4}$/);
    expect(sess.json().participant.ordinal).toBe(1);
    const pin = sess.json().pin as string;

    // cliente B: mesa ocupada ⇒ solicitar dá 409; PIN errado ⇒ 401; PIN certo ⇒ entra
    const b = phone();
    expect((await b.call('POST', `/public/tables/${t!.publicToken}/requests`)).statusCode).toBe(409);
    const wrong = await b.call('POST', `/public/tables/${t!.publicToken}/join`, { pin: pin === '0000' ? '0001' : '0000' });
    expect(wrong.statusCode).toBe(401);
    const ok = await b.call('POST', `/public/tables/${t!.publicToken}/join`, { pin });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().participant.ordinal).toBe(2);
    expect(ok.json().participantsCount).toBe(2);
    // staff vê a sessão com 2 participantes e o mesmo PIN
    const map = await staff(waiter, 'GET', '/staff/tables');
    const entry = map.json().find((x: { id: string }) => x.id === t!.id);
    expect(entry.state).toBe('occupied');
    expect(entry.session.pin).toBe(pin);
    expect(entry.session.participantsCount).toBe(2);
    // eventos gravados sem PIN no payload
    const events = await db.withTenantTx(tenantId, (tx) => tx.select().from(schema.domainEvents).where(eq(schema.domainEvents.tenantId, tenantId)));
    expect(JSON.stringify(events.map((e) => e.payload))).not.toContain(pin);
  });

  it('F14/F15: close ⇒ participants get 410, PIN invalid, table free', async () => {
    const [t] = tables;
    const a = phone();
    const map = await staff(operator, 'GET', '/staff/tables');
    const entry = map.json().find((x: { id: string }) => x.id === t!.id);
    const pin = entry.session.pin as string;
    const closed = await staff(operator, 'POST', `/staff/sessions/${entry.session.id}/close`, {});
    expect(closed.statusCode).toBe(200);
    expect(closed.json().status).toBe('closed');
    expect((await a.call('POST', `/public/tables/${t!.publicToken}/join`, { pin })).statusCode).toBe(410);
    const map2 = await staff(operator, 'GET', '/staff/tables');
    expect(map2.json().find((x: { id: string }) => x.id === t!.id).state).toBe('free');
  });

  it('BR-04: two rejections in 15 min ⇒ third request blocked (429), operator not notified', async () => {
    const t = tables[1]!;
    const spam = phone();
    const r1 = await spam.call('POST', `/public/tables/${t.publicToken}/requests`);
    expect((await staff(operator, 'POST', `/staff/requests/${r1.json().id}/reject`)).statusCode).toBe(200);
    const r2 = await spam.call('POST', `/public/tables/${t.publicToken}/requests`);
    expect(r2.statusCode).toBe(201);
    expect(r2.json().id).not.toBe(r1.json().id);
    const rej2 = await staff(operator, 'POST', `/staff/requests/${r2.json().id}/reject`);
    expect(rej2.statusCode).toBe(200);
    const before = (await staff(operator, 'GET', '/staff/requests')).json().length;
    const r3 = await spam.call('POST', `/public/tables/${t.publicToken}/requests`);
    expect(r3.statusCode).toBe(429);
    expect(r3.json().code).toBe('device_blocked');
    expect(r3.json().details.blockedUntil).toBeDefined();
    expect((await staff(operator, 'GET', '/staff/requests')).json().length).toBe(before);
    // outro dispositivo na mesma mesa não é afetado
    expect((await phone().call('POST', `/public/tables/${t.publicToken}/requests`)).statusCode).toBe(201);
  });

  it('BR-03 item 5: table rate limit across devices; approving one expires the others', async () => {
    const t = tables[2]!;
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await phone().call('POST', `/public/tables/${t.publicToken}/requests`);
      expect(r.statusCode).toBe(201);
      ids.push(r.json().id);
    }
    const sixth = await phone().call('POST', `/public/tables/${t.publicToken}/requests`);
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().code).toBe('table_rate_limited');
    expect((await staff(operator, 'POST', `/staff/requests/${ids[0]}/approve`, {})).statusCode).toBe(200);
    const pending = (await staff(operator, 'GET', '/staff/requests')).json().filter((r: { table: { id: string } }) => r.table.id === t.id);
    expect(pending).toHaveLength(0);
  });

  it('BR-14: waiter opens a free table directly and gets the PIN; cannot open twice', async () => {
    const t = tables[3]!;
    const open = await staff(waiter, 'POST', `/staff/tables/${t.id}/open`);
    expect(open.statusCode).toBe(201);
    expect(open.json().pin).toMatch(/^\d{4}$/);
    expect(open.json().openedBy).toBe('waiter');
    expect((await staff(waiter, 'POST', `/staff/tables/${t.id}/open`)).statusCode).toBe(409);
    // cliente entra com o PIN informado pelo garçom
    const c = phone();
    expect((await c.call('POST', `/public/tables/${t.publicToken}/join`, { pin: open.json().pin })).statusCode).toBe(200);
    // garçom não encerra (operador sim)
    expect((await staff(waiter, 'POST', `/staff/sessions/${open.json().id}/close`, {})).statusCode).toBe(403);
  });

  it('BR-08/BR-10/PDR-003: inactive session ⇒ new device may request; continue vs new session', async () => {
    const t = tables[4]!;
    const first = phone();
    const r = await first.call('POST', `/public/tables/${t.publicToken}/requests`);
    await staff(operator, 'POST', `/staff/requests/${r.json().id}/approve`, {});
    await first.call('GET', `/public/tables/${t.publicToken}/requests/${r.json().id}`);
    const s1 = (await first.call('GET', '/public/session')).json();

    // simula 1h sem pedidos e roda o job
    await db.withTenantTx(tenantId, (tx) => tx.update(schema.sessions).set({ lastActivityAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(schema.sessions.id, s1.id)));
    await app.get(SessionService).markInactiveSessions();
    expect((await first.call('GET', `/public/tables/${t.publicToken}`)).json().state).toBe('inactive');
    expect((await first.call('GET', '/public/session')).json().status).toBe('inactive');

    // Cliente B sem PIN solicita (PDR-003); operador sem escolher resolução ⇒ 422
    const second = phone();
    const r2 = await second.call('POST', `/public/tables/${t.publicToken}/requests`);
    expect(r2.statusCode).toBe(201);
    const q = (await staff(operator, 'GET', '/staff/requests')).json().find((x: { id: string }) => x.id === r2.json().id);
    expect(q.liveSession.status).toBe('inactive');
    expect((await staff(operator, 'POST', `/staff/requests/${r2.json().id}/approve`, {})).statusCode).toBe(422);

    // "Continuar sessão anterior": B entra na sessão antiga, que volta a active
    const cont = await staff(operator, 'POST', `/staff/requests/${r2.json().id}/approve`, { resolution: 'continue_session' });
    expect(cont.statusCode).toBe(200);
    await second.call('GET', `/public/tables/${t.publicToken}/requests/${r2.json().id}`);
    const s2 = (await second.call('GET', '/public/session')).json();
    expect(s2.id).toBe(s1.id);
    expect(s2.status).toBe('active');
    expect(s2.participant.ordinal).toBe(2);

    // Inativa de novo; cliente C ⇒ "Nova sessão": antiga fecha (preservada), nova com PIN diferente; A e B perdem acesso
    await db.withTenantTx(tenantId, (tx) => tx.update(schema.sessions).set({ lastActivityAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(schema.sessions.id, s1.id)));
    await app.get(SessionService).markInactiveSessions();
    const third = phone();
    const r3 = await third.call('POST', `/public/tables/${t.publicToken}/requests`);
    const nw = await staff(operator, 'POST', `/staff/requests/${r3.json().id}/approve`, { resolution: 'new_session' });
    expect(nw.statusCode).toBe(200);
    await third.call('GET', `/public/tables/${t.publicToken}/requests/${r3.json().id}`);
    const s3 = (await third.call('GET', '/public/session')).json();
    expect(s3.id).not.toBe(s1.id);
    expect(s3.pin).not.toBe(s1.pin);
    expect(s3.participant.ordinal).toBe(1);
    expect((await first.call('GET', '/public/session')).statusCode).toBe(410);
    expect((await second.call('GET', '/public/session')).statusCode).toBe(410);
    const old = await db.withTenantTx(tenantId, (tx) => tx.select().from(schema.sessions).where(eq(schema.sessions.id, s1.id)));
    expect(old[0]!.status).toBe('closed');
    expect(old[0]!.closeReason).toBe('replaced_by_new');
  });
});
