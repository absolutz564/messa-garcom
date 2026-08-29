/**
 * Suíte de isolamento de tenant (docs/04-architecture/multi-tenancy.md).
 * Cria tenants A e B, autentica como admin de A e tenta acessar recursos de B.
 * Esperado: 404 (nunca 200, nunca 403 que confirme existência).
 * Requer DATABASE_URL apontando para um banco migrado.
 */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { DB } from '../src/modules/db/db.module';
import { createPlatformAdmin } from './helpers';

const run = Date.now().toString(36);
const PLATFORM_EMAIL = `platform-${run}@test.local`;
const PASSWORD = 'password123';

describe('tenant isolation (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;
  let platformToken: string;
  let tenantA: { id: string; adminToken: string; tableId: string };
  let tenantB: { id: string; adminToken: string; tableId: string };

  const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts);

  const login = async (email: string, tenantId?: string) => {
    const res = await inject({ method: 'POST', url: '/auth/login', payload: { email, password: PASSWORD, tenantId } });
    expect(res.statusCode).toBe(200);
    return res.json().accessToken as string;
  };

  const createTenant = async (slug: string) => {
    const res = await inject({
      method: 'POST',
      url: '/platform/tenants',
      headers: { authorization: `Bearer ${platformToken}` },
      payload: { name: slug, slug, adminEmail: `${slug}@test.local`, adminName: 'Admin', adminPassword: PASSWORD },
    });
    expect(res.statusCode).toBe(201);
    const id = res.json().id as string;
    const adminToken = await login(`${slug}@test.local`);
    const table = await inject({
      method: 'POST',
      url: '/admin/tables',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { displayName: 'Mesa 01' },
    });
    expect(table.statusCode).toBe(201);
    return { id, adminToken, tableId: table.json().id as string };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new DomainErrorFilter());
    await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<DbHandle>(DB);

    platformToken = await createPlatformAdmin(app, db, PLATFORM_EMAIL, PASSWORD);
    tenantA = await createTenant(`iso-a-${run}`);
    tenantB = await createTenant(`iso-b-${run}`);
  });

  afterAll(async () => {
    await app.close();
  });

  it('admin of A lists only A tables', async () => {
    const res = await inject({ method: 'GET', url: '/admin/tables', headers: { authorization: `Bearer ${tenantA.adminToken}` } });
    expect(res.statusCode).toBe(200);
    const ids = (res.json() as Array<{ id: string }>).map((t) => t.id);
    expect(ids).toContain(tenantA.tableId);
    expect(ids).not.toContain(tenantB.tableId);
  });

  it('admin of A cannot read a B table by id (404, not 403)', async () => {
    const res = await inject({
      method: 'GET',
      url: `/admin/tables/${tenantB.tableId}`,
      headers: { authorization: `Bearer ${tenantA.adminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('RLS blocks even a raw query scoped to the wrong tenant', async () => {
    const rows = await db.withTenantTx(tenantA.id, (tx) =>
      tx.select().from(schema.tables).where(eq(schema.tables.id, tenantB.tableId)),
    );
    expect(rows).toHaveLength(0);
  });

  it('RLS fails closed when no tenant is set', async () => {
    const rows = await db.withGlobalTx((tx) => tx.select().from(schema.tables));
    expect(rows).toHaveLength(0);
  });

  it('catalog, tenant and members endpoints never expose or mutate another tenant', async () => {
    const h = { authorization: `Bearer ${tenantA.adminToken}` };
    // categoria de B
    const catB = await inject({ method: 'POST', url: '/admin/categories', headers: { authorization: `Bearer ${tenantB.adminToken}` }, payload: { name: 'Bebidas B' } });
    expect(catB.statusCode).toBe(201);
    const catBId = catB.json().id as string;

    const listA = await inject({ method: 'GET', url: '/admin/categories', headers: h });
    expect((listA.json() as Array<{ id: string }>).map((c) => c.id)).not.toContain(catBId);
    expect((await inject({ method: 'PATCH', url: `/admin/categories/${catBId}`, headers: h, payload: { name: 'hack' } })).statusCode).toBe(404);
    expect((await inject({ method: 'DELETE', url: `/admin/categories/${catBId}`, headers: h })).statusCode).toBe(404);
    // produto em categoria de B usando área de A ⇒ 404 (categoria invisível)
    const areasA = (await inject({ method: 'GET', url: '/admin/service-areas', headers: h })).json() as Array<{ id: string }>;
    const prod = await inject({ method: 'POST', url: '/admin/products', headers: h, payload: { categoryId: catBId, serviceAreaId: areasA[0]!.id, name: 'X', priceCents: 100 } });
    expect(prod.statusCode).toBe(404);
    // mesa de B
    expect((await inject({ method: 'PATCH', url: `/admin/tables/${tenantB.tableId}`, headers: h, payload: { displayName: 'hack' } })).statusCode).toBe(404);
    expect((await inject({ method: 'GET', url: `/admin/tables/${tenantB.tableId}/qr.svg`, headers: h })).statusCode).toBe(404);
    // branding: A só enxerga/edita A
    const tenant = await inject({ method: 'GET', url: '/admin/tenant', headers: h });
    expect(tenant.json().id).toBe(tenantA.id);
    // membros de B invisíveis para A
    const membersA = (await inject({ method: 'GET', url: '/admin/members', headers: h })).json() as Array<{ email: string }>;
    expect(membersA.map((m) => m.email)).not.toContain(`iso-b-${run}@test.local`);
  });

  it('public menu resolves by token without leaking other tenants', async () => {
    const tableB = (await inject({ method: 'GET', url: `/admin/tables/${tenantB.tableId}`, headers: { authorization: `Bearer ${tenantB.adminToken}` } })).json() as { publicToken: string };
    const pub = await inject({ method: 'GET', url: `/public/tables/${tableB.publicToken}` });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().tenant.id).toBe(tenantB.id);
    expect(pub.json().state).toBe('free');
    expect(JSON.stringify(pub.json())).not.toContain('pin');
    expect((await inject({ method: 'GET', url: '/public/tables/AAAAAAAAAAAA' })).statusCode).toBe(404);
  });

  it('non-platform user cannot call /platform', async () => {
    const res = await inject({ method: 'GET', url: '/platform/tenants', headers: { authorization: `Bearer ${tenantA.adminToken}` } });
    expect(res.statusCode).toBe(403);
  });

  it('blocked tenant cannot log in', async () => {
    const block = await inject({
      method: 'PATCH',
      url: `/platform/tenants/${tenantB.id}/status`,
      headers: { authorization: `Bearer ${platformToken}` },
      payload: { status: 'blocked' },
    });
    expect(block.statusCode).toBe(200);
    const res = await inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: `iso-b-${run}@test.local`, password: PASSWORD },
    });
    expect(res.statusCode).toBe(401);
  });
});
