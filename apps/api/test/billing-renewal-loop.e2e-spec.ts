/**
 * BR-20/PDR-024 — nenhum job cria cobrança.
 *
 * Guarda do incidente: o job de renovação gerou 10.359 cobranças reais de R$ 149
 * em quatro contas que o próprio sistema já havia bloqueado. O gatilho era a
 * expiração — a cobrança vale 30 min, e meia hora depois o job não via nenhuma
 * pendente, então criava outra, indefinidamente.
 *
 * A correção não foi pôr um teto nesse ciclo: foi tirar do relógio a permissão
 * de gastar dinheiro. Criar cobrança virou ação de quem está na tela. Este teste
 * roda os jobs com o tenant em todos os estados que antes disparavam a geração e
 * exige que o provedor **nunca** seja chamado por eles.
 *
 * O provedor é falso de propósito: com o verdadeiro, este teste gastaria dinheiro
 * de verdade a cada execução — que é exatamente o defeito que ele vigia.
 */
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import { eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import { AppModule } from '../src/app.module';
import { DB } from '../src/modules/db/db.module';
import { BillingJobs } from '../src/modules/billing/billing.jobs';
import { BillingService } from '../src/modules/billing/billing.service';
import { PixProviderFactory, type PixCharge, type PixProvider } from '../src/modules/billing/pix-provider';
import { createPlatformAdmin } from './helpers';

const run = Date.now().toString(36);
const PASSWORD = 'password123';
const DIA = 86_400_000;

/** Conta quantas cobranças foram pedidas ao provedor. É o número que explodiu. */
class ProvedorFalso implements PixProvider {
  readonly name = 'falso';
  cobrancasCriadas = 0;

  async createCharge(): Promise<PixCharge> {
    this.cobrancasCriadas++;
    return {
      providerChargeId: `falso-${this.cobrancasCriadas}`,
      qrCode: '00020126',
      qrCodeBase64: null,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    };
  }

  async isPaid(): Promise<boolean> {
    return false; // ninguém paga — é o tenant abandonado do incidente
  }
}

describe('nenhum job cria cobrança (e2e)', () => {
  let app: NestFastifyApplication;
  let db: DbHandle;
  let billing: BillingService;
  let jobs: BillingJobs;
  let tenantId: string;
  const provedor = new ProvedorFalso();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PixProviderFactory)
      .useValue({ get: () => provedor })
      .compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.register(fastifyCookie as never, { secret: process.env.COOKIE_SECRET });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<DbHandle>(DB);
    billing = app.get(BillingService);
    jobs = app.get(BillingJobs);

    const pf = await createPlatformAdmin(app, db, `pfloop-${run}@test.local`, PASSWORD);
    const criado = await app.inject({
      method: 'POST',
      url: '/platform/tenants',
      headers: { authorization: `Bearer ${pf}` },
      payload: { name: 'Loop', slug: `loop-${run}`, adminEmail: `loop-${run}@test.local`, adminName: 'Admin', adminPassword: PASSWORD },
    });
    tenantId = criado.json().id;
  });

  afterAll(async () => {
    await app.close();
  });

  /** Coloca o tenant no estado que antes disparava a geração. */
  const vencidoHa = (dias: number) =>
    db.withPlatformTx((tx) =>
      tx
        .update(schema.tenants)
        .set({ billingStatus: 'active', trialEndsAt: null, subscriptionEndsAt: new Date(Date.now() - dias * DIA) })
        .where(eq(schema.tenants.id, tenantId)),
    );

  const cobrancas = () => db.withPlatformTx((tx) => tx.select().from(schema.pixCharges).where(eq(schema.pixCharges.tenantId, tenantId)));

  /** Faz a cobrança pendente vencer, como aconteceria 30 min depois. */
  const passar30min = async () => {
    await db.withPlatformTx((tx) =>
      tx.update(schema.pixCharges).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(schema.pixCharges.tenantId, tenantId)),
    );
    await billing.expireStaleCharges();
  };

  it('o tick do job não cria cobrança em nenhum estado do tenant', async () => {
    // Véspera do vencimento, vencido na carência, bloqueado há dias, há meses:
    // cada um destes disparava a geração antes, e o do meio é onde o ciclo vivia.
    for (const dias of [-4, 1, 4, 30, 365]) {
      await vencidoHa(dias);
      await jobs.tick();
    }
    expect(provedor.cobrancasCriadas).toBe(0);
    expect(await cobrancas()).toHaveLength(0);
  });

  it('cem ticks seguidos continuam sem criar nada — era 1 a cada 30 min', async () => {
    await vencidoHa(20);
    for (let i = 0; i < 100; i++) await jobs.tick();
    expect(provedor.cobrancasCriadas).toBe(0);
  });

  it('a tela cria sob demanda, com o admin presente', async () => {
    const cobranca = await billing.getOrCreateCharge(tenantId);
    expect(cobranca.qrCode).toBeTruthy();
    expect(provedor.cobrancasCriadas).toBe(1);
  });

  it('a mesma tela aberta de novo devolve a cobrança existente, não cria outra', async () => {
    await billing.getOrCreateCharge(tenantId);
    expect(provedor.cobrancasCriadas).toBe(1);
  });

  it('expirar não faz o job nascer de volta — era este o gatilho do ciclo', async () => {
    await passar30min();
    expect((await cobrancas()).every((c) => c.status === 'expired')).toBe(true);

    for (let i = 0; i < 20; i++) await jobs.tick();
    expect(provedor.cobrancasCriadas).toBe(1);
    expect(await cobrancas()).toHaveLength(1);
  });

  it('bloqueado há meses, a tela ainda emite para quem quiser pagar', async () => {
    await vencidoHa(90);
    const cobranca = await billing.getOrCreateCharge(tenantId);
    expect(cobranca.qrCode).toBeTruthy();
    expect(provedor.cobrancasCriadas).toBe(2);
  });
});
