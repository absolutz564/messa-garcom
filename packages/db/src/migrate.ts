import { loadEnv } from './env';
loadEnv();
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';

async function main() {
  const url = process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_MIGRATOR_URL (ou DATABASE_URL) não definido');
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);
  await migrate(db, { migrationsFolder: path.resolve(__dirname, '..', 'migrations') });
  await client.end();
  console.log('migrations aplicadas');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
