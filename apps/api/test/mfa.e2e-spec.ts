/** 2FA obrigatório para platform admin (05-security/threat-model.md). */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { hash } from '@node-rs/argon2';
import { schema, type DbHandle } from '@messa/db';
import { AppModule } from '../src/app.module';
import { DomainErrorFilter } from '../src/common/filters/domain-error.filter';
import { totpCode } from '../src/common/totp';
import { DB } from '../src/modules/db/db.module';

const run = Date.now().toString(36);
const PASSWORD = 'password123';

describe('platform admin 2FA (e2e)', () => {
  let app: NestFastifyApplication;
  const email = `pf-mfa-${run}@test.local`;
  const cookies: Record<string, string> = {};

  async function call(method: 'GET' | 'POST', url: string, payload?: Record<string, unknown>, token?: string) {
    const res = await app.inject({ method, url, payload, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') } });
    const set = res.headers['set-cookie'];
    for (const c of Array.isArray(set) ? set : set ? [set] : []) {
      const [k, v] = c.split(';')[0]!.split('=');
      cookies[k!] = v!;
    }
    return res;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new DomainErrorFilter());
    await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    const db = app.get<DbHandle>(DB);
    await db.withGlobalTx((tx) => tx.insert(schema.users).values({ email, name: 'PF', passwordHash: null, isPlatformAdmin: true }));
    const passwordHash = await hash(PASSWORD);
    await db.withGlobalTx(async (tx) => {
      const { eq } = await import('drizzle-orm');
      await tx.update(schema.users).set({ passwordHash }).where(eq(schema.users.email, email));
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('platform admin without 2FA can log in but cannot use /platform until enabling it', async () => {
    const login = await call('POST', '/auth/login', { email, password: PASSWORD });
    expect(login.statusCode).toBe(200);
    expect(login.json().mfa).toBe(false);
    const token = login.json().accessToken as string;
    const blocked = await call('GET', '/platform/tenants', undefined, token);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().code).toBe('totp_setup_required');

    const setup = await call('POST', '/auth/2fa/setup', {}, token);
    expect(setup.statusCode).toBe(200);
    expect(setup.json().secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.json().qrSvg).toContain('<svg');
    const secret = setup.json().secret as string;

    expect((await call('POST', '/auth/2fa/enable', { code: '000000' }, token)).statusCode).toBe(400);
    const enabled = await call('POST', '/auth/2fa/enable', { code: totpCode(secret, Date.now()) }, token);
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json().mfa).toBe(true);
    const ok = await call('GET', '/platform/tenants', undefined, enabled.json().accessToken);
    expect(ok.statusCode).toBe(200);

    // A partir daqui o login exige o código
    const noCode = await call('POST', '/auth/login', { email, password: PASSWORD });
    expect(noCode.statusCode).toBe(401);
    expect(noCode.json().code).toBe('totp_required');
    const wrong = await call('POST', '/auth/login', { email, password: PASSWORD, totpCode: '123456' });
    expect(wrong.json().code).toBe('totp_invalid');
    const right = await call('POST', '/auth/login', { email, password: PASSWORD, totpCode: totpCode(secret, Date.now()) });
    expect(right.statusCode).toBe(200);
    expect(right.json().mfa).toBe(true);
    // setup de novo não é permitido com 2FA ativo
    expect((await call('POST', '/auth/2fa/setup', {}, right.json().accessToken)).statusCode).toBe(400);
  });
});
