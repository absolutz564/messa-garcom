/**
 * Guarda de boot: monta o grafo de dependências completo do Nest, sem banco.
 *
 * Existe por causa de um incidente real (2026-08-31): o cadastro self-service fez
 * `auth.service` injetar `PlatformService` enquanto `platform.service` ainda importava
 * `AuthService` para hashear senha. O ciclo de import passa no typecheck, passa no
 * `nest build`, e só estoura no boot ("Nest can't resolve dependencies... index [5]") —
 * derrubou a API em produção. Nenhum e2e pegou, porque todos exigem Postgres e não
 * rodam nesta máquina.
 *
 * Não toca no banco: o cliente do postgres.js só conecta na primeira query, então o
 * grafo inteiro resolve offline. Roda no `pnpm test`, junto com os unitários.
 */
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';

process.env.DATABASE_URL ??= 'postgres://boot:boot@127.0.0.1:5432/boot';
process.env.JWT_SECRET ??= 'boot-jwt-secret-boot-jwt-secret-boot-jwt';
process.env.COOKIE_SECRET ??= 'boot-cookie-secret-boot-cookie-secret-boot';
process.env.PIN_ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64');
process.env.LOG_LEVEL = 'silent';

describe('AppModule (boot)', () => {
  it('resolve todas as dependências, sem ciclo de import', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.close();
  }, 30_000);
});
