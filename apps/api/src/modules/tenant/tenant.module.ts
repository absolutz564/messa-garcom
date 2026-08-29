import { Body, Controller, Get, Inject, Injectable, Module, NotFoundException, Patch } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import { UpdateTenantBrandingSchema, type TenantBranding, type UpdateTenantBranding } from '@messa/contracts';
import { CurrentPrincipal, Roles } from '../../common/decorators';
import type { StaffPrincipal } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { DB } from '../db/db.module';
import { OutboxService } from '../events/outbox.service';

export function brandingDto(t: typeof schema.tenants.$inferSelect): TenantBranding {
  return { id: t.id, slug: t.slug, name: t.name, logoUrl: t.logoUrl, primaryColor: t.primaryColor };
}

/** Branding do restaurante (RF-10). */
@Injectable()
export class TenantService {
  constructor(
    @Inject(DB) private readonly db: DbHandle,
    private readonly outbox: OutboxService,
  ) {}

  get(tenantId: string): Promise<TenantBranding> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const [t] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, tenantId));
      if (!t) throw new NotFoundException({ code: 'not_found' });
      return brandingDto(t);
    });
  }

  update(tenantId: string, input: UpdateTenantBranding, actorUserId: string): Promise<TenantBranding> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const set = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      const [t] = await tx.update(schema.tenants).set(set).where(eq(schema.tenants.id, tenantId)).returning();
      if (!t) throw new NotFoundException({ code: 'not_found' });
      await this.outbox.append(tx, {
        tenantId,
        type: 'catalog.changed',
        aggregateType: 'tenant',
        aggregateId: tenantId,
        actor: { kind: 'staff', id: actorUserId },
        payload: { branding: true },
      });
      return brandingDto(t);
    });
  }
}

@Controller('admin/tenant')
export class TenantController {
  constructor(private readonly tenant: TenantService) {}

  @Get()
  @Roles('operator', 'waiter')
  get(@CurrentPrincipal() p: StaffPrincipal) {
    return this.tenant.get(p.tenantId!);
  }

  @Patch()
  @Roles('admin')
  update(@CurrentPrincipal() p: StaffPrincipal, @Body(new ZodPipe(UpdateTenantBrandingSchema)) body: UpdateTenantBranding) {
    return this.tenant.update(p.tenantId!, body, p.userId);
  }
}

@Module({ controllers: [TenantController], providers: [TenantService], exports: [TenantService] })
export class TenantModule {}
