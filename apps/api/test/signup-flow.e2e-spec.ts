/** RF-06 / BR-21 / PDR-018 / ADR-007 — cadastro self-service. */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { DB } from '../src/modules/db/db.module';

const run = Date.now().toString(36);
const PASSWORD = 'password123';

describe('self-service signup (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;

  const signup = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/auth/signup', payload });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new DomainErrorFilter());
    await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<DbHandle>(DB);
  });

  afterAll(async () => {
    await app.close();
  });

  it('cria restaurante + admin, já devolve sessão logada e trial de 14 dias', async () => {
    const email = `dono-${run}@test.local`;
    const res = await signup({ restaurantName: `Bar do Zé ${run}`, adminName: 'Zé', email, password: PASSWORD, acceptedPrivacy: true });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    // Login automático (ADR-007): já vem access token e tenant ativo como admin.
    expect(body.accessToken).toBeTruthy();
    expect(body.activeTenant.role).toBe('admin');
    expect(body.user.email).toBe(email);
    expect(body.isPlatformAdmin).toBe(false);
    // Cookie de refresh emitido igual ao login normal.
    expect(String(res.headers['set-cookie'])).toContain('messa_refresh');

    // BR-20: nasce em trial de 14 dias.
    const [tenant] = await db.withPlatformTx((tx) => tx.select().from(schema.tenants).where(eq(schema.tenants.id, body.activeTenant.tenantId)));
    expect(tenant!.billingStatus).toBe('trial');
    const daysLeft = Math.round((tenant!.trialEndsAt!.getTime() - Date.now()) / 86_400_000);
    expect(daysLeft).toBe(14);

    // Slug derivado do nome, sem acento, sem ser pedido no formulário (BR-21).
    expect(tenant!.slug.startsWith('bar-do-ze-')).toBe(true);

    // Áreas de serviço padrão criadas, igual ao fluxo do Super Admin.
    const areas = await db.withTenantTx(tenant!.id, (tx) => tx.select().from(schema.serviceAreas).where(eq(schema.serviceAreas.tenantId, tenant!.id)));
    expect(areas.map((a) => a.key).sort()).toEqual(['bar', 'kitchen']);

    // O token serve de verdade: já dá pra usar o painel.
    const tables = await app.inject({ method: 'GET', url: '/staff/tables', headers: { authorization: `Bearer ${body.accessToken}` } });
    expect(tables.statusCode).toBe(200);
  });

  it('mesmo nome de restaurante ⇒ slug distinto, sem colisão', async () => {
    const a = await signup({ restaurantName: 'Cantina Repetida', adminName: 'A', email: `a-${run}@test.local`, password: PASSWORD, acceptedPrivacy: true });
    const b = await signup({ restaurantName: 'Cantina Repetida', adminName: 'B', email: `b-${run}@test.local`, password: PASSWORD, acceptedPrivacy: true });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    expect(a.json().activeTenant.tenantSlug).not.toBe(b.json().activeTenant.tenantSlug);
  });

  it('e-mail já cadastrado ⇒ 409 email_in_use, sem anexar membership à conta alheia (ADR-007)', async () => {
    const email = `repetido-${run}@test.local`;
    const first = await signup({ restaurantName: 'Primeiro', adminName: 'Dono', email, password: PASSWORD, acceptedPrivacy: true });
    expect(first.statusCode).toBe(201);

    const second = await signup({ restaurantName: 'Invasor', adminName: 'Outro', email, password: 'outrasenha123', acceptedPrivacy: true });
    expect(second.statusCode).toBe(409);
    expect(second.json().code).toBe('email_in_use');

    // A conta original continua com exatamente uma membership.
    const [user] = await db.withPlatformTx((tx) => tx.select().from(schema.users).where(eq(schema.users.email, email)));
    const memberships = await db.withPlatformTx((tx) => tx.select().from(schema.memberships).where(eq(schema.memberships.userId, user!.id)));
    expect(memberships).toHaveLength(1);
  });

  it('sem aceitar a política de privacidade ⇒ 422', async () => {
    const res = await signup({ restaurantName: 'Sem Aceite', adminName: 'X', email: `noaccept-${run}@test.local`, password: PASSWORD, acceptedPrivacy: false });
    expect(res.statusCode).toBe(422);
  });

  it('senha curta ⇒ 422', async () => {
    const res = await signup({ restaurantName: 'Senha Fraca', adminName: 'X', email: `weak-${run}@test.local`, password: '123', acceptedPrivacy: true });
    expect(res.statusCode).toBe(422);
  });
});
