/** Garante que o banco `messa` existe (fallback local sem Docker). */
import { loadEnv } from './env';
loadEnv();
import postgres from 'postgres';

async function main() {
  const url = new URL(process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL ?? '');
  const dbName = url.pathname.replace(/^\//, '') || 'messa';
  url.pathname = '/template1';
  const sql = postgres(url.toString(), { max: 1 });
  const rows = await sql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
  if (rows.length === 0) {
    await sql.unsafe(`CREATE DATABASE "${dbName.replace(/"/g, '')}" ENCODING 'UTF8' TEMPLATE template0`);
    console.log(`database "${dbName}" criado`);
  } else {
    console.log(`database "${dbName}" já existe`);
  }
  await sql.end();
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
