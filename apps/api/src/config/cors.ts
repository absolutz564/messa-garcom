import type { AppConfig } from './config';

/**
 * CORS do API para o web (mesmo site em produção; portas diferentes em dev).
 * Métodos explícitos: o padrão do Fastify é só GET/HEAD/POST e bloqueia PATCH/DELETE no preflight.
 * Compartilhado entre main.ts e os testes e2e para que o preflight seja testado.
 */
export function corsOptions(config: Pick<AppConfig, 'WEB_PUBLIC_URL'>) {
  return {
    origin: [config.WEB_PUBLIC_URL],
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['authorization', 'content-type', 'idempotency-key'],
    maxAge: 600,
  };
}
