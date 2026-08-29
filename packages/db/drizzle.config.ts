import { config as dotenv } from 'dotenv';
import path from 'node:path';
dotenv({ path: path.resolve(__dirname, '..', '..', '.env') });
dotenv();
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.DATABASE_MIGRATOR_URL ?? process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
