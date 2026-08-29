import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { DbModule } from './modules/db/db.module';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { PlatformModule } from './modules/platform/platform.module';
import { TablesModule } from './modules/tables/tables.module';
import { EventsModule } from './modules/events/events.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { StorageModule } from './modules/storage/storage.module';
import { PublicModule } from './modules/public/public.module';
import { PresenceModule } from './modules/presence/presence.module';
import { ServiceModule } from './modules/service/service.module';
import { OrderingModule } from './modules/ordering/ordering.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { IpRateLimitGuard } from './common/guards/ip-rate-limit.guard';
import { RequestContextModule } from './common/request-context.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        transport:
          process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
        genReqId: (req) => (req.headers['x-request-id'] as string) ?? undefined,
        customProps: (req) => {
          const ctx = (req as { messaCtx?: { tenantId?: string; userId?: string } }).messaCtx;
          return ctx ? { tenantId: ctx.tenantId, userId: ctx.userId } : {};
        },
      },
    }),
    ScheduleModule.forRoot(),
    RequestContextModule,
    DbModule,
    EventsModule,
    HealthModule,
    IdentityModule,
    PlatformModule,
    TablesModule,
    CatalogModule,
    TenantModule,
    StorageModule,
    PublicModule,
    PresenceModule,
    ServiceModule,
    OrderingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: IpRateLimitGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
