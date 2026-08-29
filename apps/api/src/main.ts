import 'reflect-metadata';
import { config as dotenv } from 'dotenv';
import path from 'node:path';
dotenv({ path: path.resolve(__dirname, '..', '..', '..', '.env') });
dotenv();
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { UPLOADS_DIR } from './modules/storage/storage.module';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { loadConfig } from './config/config';
import { DomainErrorFilter } from './common/filters/domain-error.filter';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 1_048_576 }),
    { bufferLogs: true },
  );
  app.useLogger(app.get(Logger));
  app.useGlobalFilters(new DomainErrorFilter());
  app.enableCors({ origin: [config.WEB_PUBLIC_URL], credentials: true });
  app.enableShutdownHooks();

  await app.register(fastifyCookie as never, { secret: config.COOKIE_SECRET });
  await app.register(fastifyHelmet as never, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(fastifyMultipart as never, { limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
  await app.register(fastifyStatic as never, { root: UPLOADS_DIR, prefix: '/uploads/', decorateReply: false, maxAge: '31536000000', immutable: true });

  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
  app.get(Logger).log(`Messa API on :${config.API_PORT}`);
}

bootstrap();
