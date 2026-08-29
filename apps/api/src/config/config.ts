import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().default(3001),
  API_PUBLIC_URL: z.string().url().default('http://localhost:3001'),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  QR_BASE_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECRET: z.string().min(32),
  PIN_ENCRYPTION_KEY: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  LOG_LEVEL: z.string().default('info'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Messa <no-reply@messa-garcom.com.br>'),
  UPLOADS_DIR: z.string().optional(),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let cached: AppConfig | undefined;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cached) return cached;
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const APP_CONFIG = Symbol('APP_CONFIG');
