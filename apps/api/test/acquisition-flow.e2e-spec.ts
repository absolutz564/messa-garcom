/** RF-07 / BR-23 — aquisição: de onde veio cada restaurante e quanto custou. */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import { classify, nomesDeCookie, serializarToque } from '@messa/origem';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { DB } from '../src/modules/db/db.module';
import { createPlatformAdmin, markStaffOnline } from './helpers';

const run = Date.now().toString(36);
const PASSWORD = 'password123';

describe('acquisition (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;
  let pf: string;
  const campanha = `lancamento-${run}`;

  const platform = (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, payload, headers: { authorization: `Bearer ${pf}` } });

  /** Simula o que o navegador guardou na primeira visita, vindo de um anúncio. */
  function cookiesDeOrigem(source: string, campaign: string): string {
    const toque = classify({
      url: `https://messa-garcom.com.br/?utm_source=${source}&utm_medium=paid_social&utm_campaign=${campaign}`,
      referrer: 'https://l.instagram.com/',
    });
    if (!toque) throw new Error('classify devolveu null para uma URL com utm — teste mal montado');
    const nomes = nomesDeCookie('og');
    return `${nomes.primeiro}=${serializarToque(toque)}; ${nomes.ultimo}=${serializarToque(toque)}`;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new DomainErrorFilter());
    await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<DbHandle>(DB);
    pf = await createPlatformAdmin(app, db, `pfacq-${run}@test.local`, PASSWORD);
  });

  afterAll(async () => {
    await app.close();
  });

  it('cadastro vindo de anúncio grava a origem e o marco "cadastrou"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { restaurantName: `Bar Origem ${run}`, adminName: 'Dono', email: `acq-${run}@test.local`, password: PASSWORD, acceptedPrivacy: true },
      headers: { cookie: cookiesDeOrigem('instagram', campanha) },
    });
    expect(res.statusCode).toBe(201);
    const tenantId = res.json().activeTenant.tenantId as string;

    const [atribuicao] = await db.withPlatformTx((tx) =>
      tx.select().from(schema.origemAtribuicao).where(eq(schema.origemAtribuicao.subjectId, tenantId)),
    );
    expect(atribuicao!.lastChannel).toBe('paid_social');
    expect(atribuicao!.lastSource).toBe('instagram');
    expect(atribuicao!.lastCampaign).toBe(campanha);
    // LGPD: só o host de quem indicou, nunca a URL inteira.
    expect(atribuicao!.lastReferrerHost).toBe('l.instagram.com');

    const marcos = await db.withPlatformTx((tx) =>
      tx.select().from(schema.origemEvento).where(eq(schema.origemEvento.subjectId, tenantId)),
    );
    expect(marcos.map((m) => m.name)).toEqual(['cadastrou']);
  });

  it('cadastro sem cookie nenhum conta como direto, não como falha', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { restaurantName: `Bar Direto ${run}`, adminName: 'Dono', email: `direto-${run}@test.local`, password: PASSWORD, acceptedPrivacy: true },
    });
    expect(res.statusCode).toBe(201);

    const [atribuicao] = await db.withPlatformTx((tx) =>
      tx.select().from(schema.origemAtribuicao).where(eq(schema.origemAtribuicao.subjectId, res.json().activeTenant.tenantId)),
    );
    expect(atribuicao!.lastChannel).toBe('direct');
  });

  it('pedido de cliente marca "ativou"; pedido de garçom não', async () => {
    const signup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { restaurantName: `Bar Ativa ${run}`, adminName: 'Dono', email: `ativa-${run}@test.local`, password: PASSWORD, acceptedPrivacy: true },
      headers: { cookie: cookiesDeOrigem('instagram', campanha) },
    });
    const admin = signup.json().accessToken as string;
    const tenantId = signup.json().activeTenant.tenantId as string;
    markStaffOnline(app, tenantId);

    const staff = (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>, headers: Record<string, string> = {}) =>
      app.inject({ method, url, payload, headers: { ...headers, authorization: `Bearer ${admin}` } });

    const table = (await staff('POST', '/admin/tables', { displayName: 'Mesa A1' })).json();
    const areas = (await staff('GET', '/admin/service-areas')).json() as Array<{ id: string; key: string }>;
    const cat = (await staff('POST', '/admin/categories', { name: 'Bebidas' })).json().id;
    const beer = (await staff('POST', '/admin/products', { categoryId: cat, serviceAreaId: areas.find((a) => a.key === 'bar')!.id, name: 'Cerveja', priceCents: 990 })).json().id;

    // Pedido do garçom primeiro: a equipe testando não é sinal de aquisição.
    const aberta = await staff('POST', `/staff/tables/${table.id}/open`);
    await staff('POST', `/staff/sessions/${aberta.json().id}/orders`, { items: [{ productId: beer, quantity: 1 }] }, { 'idempotency-key': `acq-staff-${run}` });

    let marcos = await db.withPlatformTx((tx) => tx.select().from(schema.origemEvento).where(eq(schema.origemEvento.subjectId, tenantId)));
    expect(marcos.map((m) => m.name).sort()).toEqual(['cadastrou']);

    // Agora um cliente de verdade, entrando pelo PIN da mesa aberta.
    const pin = aberta.json().pin as string;
    const cookies: Record<string, string> = {};
    const phone = async (method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>, headers: Record<string, string> = {}) => {
      const res = await app.inject({ method, url, payload, headers: { ...headers, cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } });
      const set = res.headers['set-cookie'];
      for (const c of Array.isArray(set) ? set : set ? [set] : []) {
        const [k, v] = c.split(';')[0]!.split('=');
        if (v) cookies[k!] = v;
      }
      return res;
    };
    const entrou = await phone('POST', `/public/tables/${table.publicToken}/join`, { pin });
    expect(entrou.statusCode).toBe(200);
    const pedido = await phone('POST', '/public/session/orders', { items: [{ productId: beer, quantity: 1 }] }, { 'idempotency-key': `acq-cli-${run}` });
    expect(pedido.statusCode).toBe(201);

    marcos = await db.withPlatformTx((tx) => tx.select().from(schema.origemEvento).where(eq(schema.origemEvento.subjectId, tenantId)));
    expect(marcos.map((m) => m.name).sort()).toEqual(['ativou', 'cadastrou']);
  });

  it('relatório junta cadastros, ativação e gasto por campanha', async () => {
    const gasto = await platform('POST', '/platform/acquisition/spend', {
      channel: 'paid_social',
      source: 'instagram',
      campaign: campanha,
      amount: 500,
      periodStart: new Date(Date.now() - 86_400_000).toISOString(),
      periodEnd: new Date().toISOString(),
    });
    expect(gasto.statusCode).toBe(201);

    const res = await platform('GET', '/platform/acquisition/report?agruparPor=campaign');
    expect(res.statusCode).toBe(200);
    const linha = (res.json() as Array<{ chave: string; cadastros: number; ativados: number; gasto: number }>).find((l) => l.chave.includes(campanha));
    expect(linha).toBeDefined();
    expect(linha!.cadastros).toBe(2); // o do primeiro teste e o da ativação
    expect(linha!.ativados).toBe(1);
    expect(linha!.gasto).toBe(500);
  });

  it('link de anúncio nasce com as marcações e não duplica', async () => {
    const body = { channel: 'paid_social', source: 'instagram', campaign: campanha };
    const criado = await platform('POST', '/platform/acquisition/links', body);
    expect(criado.statusCode).toBe(201);
    expect(criado.json().url).toContain(`utm_campaign=${campanha}`);
    expect(criado.json().url).toContain('utm_source=instagram');

    await platform('POST', '/platform/acquisition/links', body);
    const lista = (await platform('GET', '/platform/acquisition/links')).json() as Array<{ campaign: string }>;
    expect(lista.filter((l) => l.campaign === campanha)).toHaveLength(1);
  });

  it('aquisição é só do Super Admin: admin de restaurante recebe 403', async () => {
    const signup = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { restaurantName: `Bar Curioso ${run}`, adminName: 'Dono', email: `curioso-${run}@test.local`, password: PASSWORD, acceptedPrivacy: true },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/platform/acquisition/report',
      headers: { authorization: `Bearer ${signup.json().accessToken}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
