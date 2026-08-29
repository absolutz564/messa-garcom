import { config } from 'dotenv';
import path from 'node:path';

/** Carrega o .env da raiz do monorepo (cwd pode ser qualquer pacote). Variáveis já definidas têm precedência. */
export function loadEnv(): void {
  config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
  config();
}
