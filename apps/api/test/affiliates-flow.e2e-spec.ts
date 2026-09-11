/** RF-08 / BR-24 — área de afiliados: leitura, credencial própria, sem dado do restaurante. */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import { classify, nomesDeCookie, serializarToque } from '@messa/origem';
import { schema, type DbHandle } from '@messa/db';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { DB } from '../src/modules/db/db.module';
import { AFILIADO_COOKIE } from '../src/modules/affiliates/affiliate-session';

const run = Date.now().toString(36);
const PASSWORD = 'password123';
const SENHA_AFILIADO = 'senha-de-teste-afiliado';
const CODIGO = `parceiro-${run}`;

describe('afiliados (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;
  let cookieDeSessao: string;

  /** Link de divulgação como o gerador do painel monta: canal indicação ⇒ medium `referral`. */
  function cookiesDeAfiliado(codigo: string): string {
    const toque = classify({
      url: `https://messa-garcom.com.br/?utm_source=${codigo}&utm_medium=referral&utm_campaign=indicacao`,
      referrer: null,
    });
    if (!toque) throw new Error('classify devolveu null — teste mal montado');
    const nomes = nomesDeCookie('og');
    return `${nomes.primeiro}=${serializarToque(toque)}; ${nomes.ultimo}=${serializarToque(toque)}`;
  }

  /** O que o rastreador envia no primeiro toque de um visitante novo. */
  const visitar = (source: string, extras: Record<string, unknown> = {}) =>
    app.inject({ method: 'POST', url: '/public/origem/visita', payload: { channel: 'referral', source, medium: 'referral', campaign: 'indicacao', landingPath: '/?utm_source=x', ...extras } });

  async function cadastrar(nome: string, email: string, cookie?: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/signup',
      payload: { restaurantName: nome, adminName: 'Dono', email, password: PASSWORD, acceptedPrivacy: true },
      ...(cookie ? { headers: { cookie } } : {}),
    });
    expect(res.statusCode).toBe(201);
    return res.json().activeTenant.tenantId as string;
  }

  beforeAll(async () => {
    // A área só existe com o hash configurado; o teste configura o dele antes do boot.
    process.env.AFILIADOS_SENHA_HASH = Buffer.from(await hash(SENHA_AFILIADO)).toString('base64');

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

  it('sem sessão o painel responde 404, não 401 — a área não se anuncia', async () => {
    const res = await app.inject({ method: 'GET', url: '/afiliados/painel' });
    expect(res.statusCode).toBe(404);
  });

  it('senha errada não diz qual campo errou', async () => {
    const res = await app.inject({ method: 'POST', url: '/afiliados/entrar', payload: { usuario: 'afiliados', senha: 'errada' } });
    expect(res.statusCode).toBe(401);
    expect(res.json().message).toBe('Usuário ou senha incorretos.');

    const usuario = await app.inject({ method: 'POST', url: '/afiliados/entrar', payload: { usuario: 'outro', senha: SENHA_AFILIADO } });
    expect(usuario.json().message).toBe('Usuário ou senha incorretos.');
  });

  it('credencial certa abre a sessão', async () => {
    const res = await app.inject({ method: 'POST', url: '/afiliados/entrar', payload: { usuario: 'afiliados', senha: SENHA_AFILIADO } });
    expect(res.statusCode).toBe(200);
    const set = res.headers['set-cookie'];
    const bruto = (Array.isArray(set) ? set : [set as string]).find((c) => c.startsWith(AFILIADO_COOKIE));
    expect(bruto).toBeDefined();
    // HttpOnly: a senha é compartilhada, mas a sessão não fica legível por script.
    expect(bruto).toContain('HttpOnly');
    cookieDeSessao = bruto!.split(';')[0]!;
  });

  it('visita: responde 204 sempre, e só grava o que passa pela lista fechada', async () => {
    // Três visitantes novos pelo link do afiliado.
    for (let i = 0; i < 3; i++) expect((await visitar(CODIGO)).statusCode).toBe(204);
    // Visita direta não é clique em link de ninguém; corpo ruim não vira erro.
    expect((await visitar(CODIGO, { channel: 'direct' })).statusCode).toBe(204);
    expect((await visitar(CODIGO, { channel: 'hacker' })).statusCode).toBe(204);
    // Corpo JSON sem nada aproveitável também é 204: devolver erro ensinaria um
    // robô a calibrar a tentativa seguinte. (JSON malformado o Fastify rejeita
    // antes de chegar aqui, com 400 — isso é do parser, não desta rota.)
    expect((await app.inject({ method: 'POST', url: '/public/origem/visita', payload: {} })).statusCode).toBe(204);
    // Dado pessoal no corpo não tem por onde entrar.
    expect((await visitar(CODIGO, { ip: '203.0.113.9', userAgent: 'Mozilla' })).statusCode).toBe(204);

    const visitas = await db.withPlatformTx((tx) => tx.select().from(schema.origemVisita).where(eq(schema.origemVisita.source, CODIGO)));
    expect(visitas).toHaveLength(4); // 3 + a que veio com ip/userAgent, sem eles
    expect(visitas.every((v) => v.channel === 'referral')).toBe(true);
    expect(visitas.every((v) => v.landingPath === '/')).toBe(true); // sem query string
    expect(JSON.stringify(visitas)).not.toContain('203.0.113.9');
  });

  it('código com cliques e zero cadastros aparece no painel — é o caso que a contagem existe para mostrar', async () => {
    const soCliques = `curioso-${run}`;
    await visitar(soCliques);
    await visitar(soCliques);

    const res = await app.inject({ method: 'GET', url: '/afiliados/painel', headers: { cookie: cookieDeSessao } });
    const bloco = (res.json() as Array<{ codigo: string; visitas: number; cadastros: number }>).find((b) => b.codigo === soCliques);
    expect(bloco).toMatchObject({ visitas: 2, cadastros: 0 });
  });

  it('painel agrupa por código e mostra situação, sem identificar o restaurante', async () => {
    const emTeste = await cadastrar(`Bar Afiliado ${run}`, `afl-teste-${run}@test.local`, cookiesDeAfiliado(CODIGO));
    const pagante = await cadastrar(`Bar Pagante ${run}`, `afl-pago-${run}@test.local`, cookiesDeAfiliado(CODIGO));
    // Cadastro sem link de divulgação não pertence a afiliado nenhum.
    const direto = await cadastrar(`Bar Direto ${run}`, `afl-direto-${run}@test.local`);

    await db.withPlatformTx((tx) =>
      tx.insert(schema.origemEvento).values({ id: `ev-pagou-${run}`, subjectType: 'tenant', subjectId: pagante, name: 'pagou', value: '149.00', currency: 'BRL' }),
    );

    const res = await app.inject({ method: 'GET', url: '/afiliados/painel', headers: { cookie: cookieDeSessao } });
    expect(res.statusCode).toBe(200);

    const bloco = (res.json() as Array<{ codigo: string; visitas: number; cadastros: number; pagantes: number; indicacoes: Array<Record<string, unknown>> }>).find(
      (b) => b.codigo === CODIGO,
    );
    expect(bloco).toBeDefined();
    expect(bloco!.visitas).toBe(4); // as do teste da rota, sob o mesmo código
    expect(bloco!.cadastros).toBe(2);
    expect(bloco!.pagantes).toBe(1);

    const situacoes = bloco!.indicacoes.map((i) => i.situacao).sort();
    expect(situacoes).toEqual(['em_teste', 'pagante']);

    // O corpo inteiro não pode conter nome nem e-mail de restaurante nenhum.
    expect(res.body).not.toContain('Bar Afiliado');
    expect(res.body).not.toContain('@test.local');
    // E o cadastro direto não aparece em bloco nenhum.
    expect(res.body).not.toContain(direto.slice(-6).toUpperCase());
    expect(bloco!.indicacoes.map((i) => i.referencia)).toContain(emTeste.slice(-6).toUpperCase());
  });

  it('sessão de afiliado não vale como sessão de staff', async () => {
    const token = cookieDeSessao.slice(AFILIADO_COOKIE.length + 1);
    // O emissor do token é outro, então o guard de staff o recusa na verificação —
    // não por acidente de um principal vazio, mas pela própria biblioteca.
    const res = await app.inject({ method: 'GET', url: '/platform/tenants', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(401);
  });

  it('sair invalida o acesso ao painel', async () => {
    const saiu = await app.inject({ method: 'POST', url: '/afiliados/sair', headers: { cookie: cookieDeSessao } });
    expect(saiu.statusCode).toBe(204);

    const semCookie = await app.inject({ method: 'GET', url: '/afiliados/painel' });
    expect(semCookie.statusCode).toBe(404);
  });
});
