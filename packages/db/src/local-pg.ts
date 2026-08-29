// Executado apenas via tsx (pacote ESM); excluído do tsc em tsconfig.json.
/**
 * Postgres local sem Docker (fallback para máquinas sem WSL2/virtualização).
 * Sobe um servidor em infra/.pgdata com as mesmas credenciais do docker-compose.
 * Uso: pnpm db:local   (mantém o processo aberto; Ctrl+C encerra)
 */
import EmbeddedPostgres from 'embedded-postgres';
import path from 'node:path';
import fs from 'node:fs';

async function main() {
  const dataDir = path.resolve(__dirname, '..', '..', '..', 'infra', '.pgdata');
  const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'messa',
    password: 'messa',
    port: 5432,
    persistent: true,
  });
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('messa');
  console.log('postgres local pronto em postgres://messa:messa@localhost:5432/messa');

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
