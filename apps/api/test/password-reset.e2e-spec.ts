/** RF-75 / BR-22 — recuperação de senha. */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { DB } from '../src/modules/db/db.module';

const run = Date.now().toString(36);
const PASSWORD = 'password123';
const NEW_PASSWORD = 'novasenha456';

describe('password reset (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;
  const email = `reset-${run}@test.local`;

  const post = (url: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url, payload });

  /** O token só existe no e-mail; nos testes plantamos um hash conhecido direto no banco. */
  async function plantToken(expiresAt: Date): Promise<string> {
    const token = randomBytes(24).toString('base64url');
    await db.withPlatformTx((tx) =>
      tx
        .update(schema.users)
        .set({ passwordResetTokenHash: createHash('sha256').update(token).digest('hex'), passwordResetExpiresAt: expiresAt })
        .where(eq(schema.users.email, email)),
    );
    return token;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new DomainErrorFilter());
    await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<DbHandle>(DB);

    await post('/auth/signup', { restaurantName: `Reset ${run}`, adminName: 'Dono', email, password: PASSWORD, acceptedPrivacy: true });
  });

  afterAll(async () => {
    await app.close();
  });

  it('pedido de redefinição responde 204 igual para conta existente e inexistente (sem enumeração)', async () => {
    const existente = await post('/auth/forgot-password', { email });
    const inexistente = await post('/auth/forgot-password', { email: `ninguem-${run}@test.local` });
    expect(existente.statusCode).toBe(204);
    expect(inexistente.statusCode).toBe(204);
    expect(existente.body).toBe(inexistente.body);
  });

  it('token válido troca a senha: a antiga para de funcionar e a nova entra', async () => {
    const token = await plantToken(new Date(Date.now() + 60 * 60_000));
    const res = await post('/auth/reset-password', { token, password: NEW_PASSWORD });
    expect(res.statusCode).toBe(204);

    expect((await post('/auth/login', { email, password: PASSWORD })).statusCode).toBe(401);
    expect((await post('/auth/login', { email, password: NEW_PASSWORD })).statusCode).toBe(200);
  });

  it('token é de uso único', async () => {
    const token = await plantToken(new Date(Date.now() + 60 * 60_000));
    expect((await post('/auth/reset-password', { token, password: NEW_PASSWORD })).statusCode).toBe(204);

    const reuso = await post('/auth/reset-password', { token, password: 'outrasenha789' });
    expect(reuso.statusCode).toBe(400);
    expect(reuso.json().code).toBe('reset_invalid');
  });

  it('token expirado não vale', async () => {
    const token = await plantToken(new Date(Date.now() - 60_000));
    const res = await post('/auth/reset-password', { token, password: 'outrasenha789' });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('reset_invalid');
  });

  it('token inexistente não vale', async () => {
    const res = await post('/auth/reset-password', { token: randomBytes(24).toString('base64url'), password: 'outrasenha789' });
    expect(res.statusCode).toBe(400);
  });

  it('trocar a senha revoga os dispositivos conectados (BR-22)', async () => {
    const login = await post('/auth/login', { email, password: NEW_PASSWORD });
    expect(login.statusCode).toBe(200);
    const refreshCookie = String(login.headers['set-cookie']).match(/messa_refresh=([^;]+)/)?.[1] ?? '';
    expect(refreshCookie).toBeTruthy();

    const token = await plantToken(new Date(Date.now() + 60 * 60_000));
    await post('/auth/reset-password', { token, password: PASSWORD });

    const refresh = await app.inject({ method: 'POST', url: '/auth/refresh', headers: { cookie: `messa_refresh=${refreshCookie}` } });
    expect(refresh.statusCode).toBe(401);
  });
});
