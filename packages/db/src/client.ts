/**
 * Único ponto de acesso ao banco.
 * Regra: código de aplicação NUNCA usa `db` diretamente — apenas `withTenantTx` / `withPlatformTx`.
 * Ver docs/04-architecture/multi-tenancy.md.
 */
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface DbHandle {
  /** Executa `fn` numa transação com `app.tenant_id` setado (RLS ativa). */
  withTenantTx<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Executa `fn` numa transação com bypass de tenant (somente /platform). Auditar o chamador. */
  withPlatformTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Transação sem tenant para tabelas globais (users, tenants). Falha fechada nas demais. */
  withGlobalTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /**
   * Transação com `app.user_id` (identidade): enxerga as próprias memberships/staff_devices
   * e os tenants correspondentes, sem escolher tenant ainda (login, refresh, switch).
   */
  withUserTx<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  /** Uso exclusivo de testes/migrations. */
  readonly raw: Db;
}

export function createDb(connectionString: string, opts: { max?: number } = {}): DbHandle {
  const client = postgres(connectionString, { max: opts.max ?? 10, prepare: false });
  const db = drizzle(client, { schema });

  return {
    raw: db,
    async withTenantTx(tenantId, fn) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
        return fn(tx);
      });
    },
    async withPlatformTx(fn) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.platform', 'true', true)`);
        return fn(tx);
      });
    },
    async withGlobalTx(fn) {
      return db.transaction(async (tx) => fn(tx));
    },
    async withUserTx(userId, fn) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
        return fn(tx);
      });
    },
    async close() {
      await client.end();
    },
  };
}

export { schema };
