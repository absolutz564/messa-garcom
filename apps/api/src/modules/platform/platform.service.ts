import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import type { CreateTenant, Tenant } from '@messa/contracts';
import { DB } from '../db/db.module';
import { OutboxService } from '../events/outbox.service';
import { AuthService } from '../identity/auth.service';

/** Super Admin (RF-03). Toda operação roda em withPlatformTx e é auditada via outbox. */
@Injectable()
export class PlatformService {
  constructor(
    @Inject(DB) private readonly db: DbHandle,
    private readonly outbox: OutboxService,
  ) {}

  async list(): Promise<Tenant[]> {
    return this.db.withPlatformTx(async (tx) => {
      const rows = await tx.select().from(schema.tenants).orderBy(desc(schema.tenants.createdAt));
      return rows.map(toDto);
    });
  }

  async create(input: CreateTenant, actorUserId: string): Promise<Tenant> {
    const passwordHash = await AuthService.hashPassword(input.adminPassword);
    return this.db.withPlatformTx(async (tx) => {
      const [existing] = await tx.select({ id: schema.tenants.id }).from(schema.tenants).where(eq(schema.tenants.slug, input.slug));
      if (existing) throw new ConflictException({ code: 'slug_taken', message: 'Slug já em uso' });

      const [tenant] = await tx.insert(schema.tenants).values({ slug: input.slug, name: input.name }).returning();

      // Admin do restaurante: reaproveita usuário existente (RF-72) ou cria.
      const email = input.adminEmail.toLowerCase();
      let [user] = await tx.select().from(schema.users).where(eq(schema.users.email, email));
      if (!user) {
        [user] = await tx.insert(schema.users).values({ email, name: input.adminName, passwordHash }).returning();
      }
      await tx.insert(schema.memberships).values({
        tenantId: tenant!.id,
        userId: user!.id,
        role: 'admin',
        status: 'active',
        acceptedAt: new Date(),
      });

      // Áreas de serviço fixas do MVP.
      await tx.insert(schema.serviceAreas).values([
        { tenantId: tenant!.id, key: 'kitchen', name: 'Cozinha' },
        { tenantId: tenant!.id, key: 'bar', name: 'Bar' },
      ]);

      await this.outbox.append(tx, {
        tenantId: tenant!.id,
        type: 'tenant.created',
        aggregateType: 'tenant',
        aggregateId: tenant!.id,
        actor: { kind: 'staff', id: actorUserId },
        payload: { slug: tenant!.slug, adminUserId: user!.id },
      });
      return toDto(tenant!);
    });
  }

  async setStatus(tenantId: string, status: 'active' | 'blocked', actorUserId: string): Promise<Tenant> {
    return this.db.withPlatformTx(async (tx) => {
      const [tenant] = await tx.update(schema.tenants).set({ status }).where(eq(schema.tenants.id, tenantId)).returning();
      if (!tenant) throw new NotFoundException({ code: 'not_found' });
      await this.outbox.append(tx, {
        tenantId,
        type: status === 'blocked' ? 'tenant.blocked' : 'tenant.unblocked',
        aggregateType: 'tenant',
        aggregateId: tenantId,
        actor: { kind: 'staff', id: actorUserId },
      });
      return toDto(tenant);
    });
  }
}

function toDto(t: typeof schema.tenants.$inferSelect): Tenant {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    logoUrl: t.logoUrl,
    primaryColor: t.primaryColor,
    status: t.status as Tenant['status'],
    createdAt: t.createdAt.toISOString(),
  };
}
