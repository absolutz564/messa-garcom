import { Controller, Get, GoneException, Header, Inject, Injectable, Module, NotFoundException, Param } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import { deriveTableState, PUBLIC_TOKEN_REGEX } from '@messa/domain';
import type { Menu, PublicTable, StaffPresence } from '@messa/contracts';
import { Public } from '../../common/decorators';
import { RateLimit } from '../../common/guards/ip-rate-limit.guard';
import { DB } from '../db/db.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CatalogService } from '../catalog/catalog.service';
import { StaffPresenceService } from '../events/staff-presence.service';
import { brandingDto } from '../tenant/tenant.module';

export interface ResolvedTable {
  tenantId: string;
  tableId: string;
  displayName: string;
  isActive: boolean;
}

/** Resolução do QR (BR-02): token → tenant + mesa. Nunca devolve sessão/PIN. */
@Injectable()
export class PublicTableService {
  constructor(
    @Inject(DB) private readonly db: DbHandle,
    private readonly catalog: CatalogService,
    private readonly presence: StaffPresenceService,
  ) {}

  /** Lookup global do token (antes de existir contexto de tenant). Somente leitura. */
  async resolve(token: string): Promise<ResolvedTable> {
    if (!PUBLIC_TOKEN_REGEX.test(token)) throw new NotFoundException({ code: 'not_found' });
    return this.db.withPlatformTx(async (tx) => {
      const [t] = await tx
        .select({ id: schema.tables.id, tenantId: schema.tables.tenantId, displayName: schema.tables.displayName, isActive: schema.tables.isActive, tenantStatus: schema.tenants.status })
        .from(schema.tables)
        .innerJoin(schema.tenants, eq(schema.tenants.id, schema.tables.tenantId))
        .where(eq(schema.tables.publicToken, token));
      if (!t) {
        const [revoked] = await tx.select({ token: schema.revokedTableTokens.token }).from(schema.revokedTableTokens).where(eq(schema.revokedTableTokens.token, token));
        if (revoked) throw new GoneException({ code: 'qr_revoked', message: 'Este QR Code foi substituído. Peça um novo ao restaurante.' });
        throw new NotFoundException({ code: 'not_found' });
      }
      if (!t.isActive || t.tenantStatus !== 'active') throw new NotFoundException({ code: 'not_found' });
      return { tenantId: t.tenantId, tableId: t.id, displayName: t.displayName, isActive: t.isActive };
    });
  }

  async publicTable(token: string): Promise<PublicTable> {
    const r = await this.resolve(token);
    return this.db.withTenantTx(r.tenantId, async (tx) => {
      const [tenant] = await tx.select().from(schema.tenants).where(eq(schema.tenants.id, r.tenantId));
      const [live] = await tx
        .select({ status: schema.sessions.status })
        .from(schema.sessions)
        .where(and(eq(schema.sessions.tableId, r.tableId), inArray(schema.sessions.status, ['active', 'inactive'])));
      const [pending] = await tx
        .select({ id: schema.serviceRequests.id })
        .from(schema.serviceRequests)
        .where(and(eq(schema.serviceRequests.tableId, r.tableId), eq(schema.serviceRequests.status, 'pending'), eq(schema.serviceRequests.type, 'open_session')))
        .limit(1);
      const state = deriveTableState({
        isActive: r.isActive,
        liveSessionStatus: (live?.status as 'active' | 'inactive' | undefined) ?? null,
        hasPendingOpenRequest: Boolean(pending),
      });
      return {
        tenant: brandingDto(tenant!),
        table: { id: r.tableId, displayName: r.displayName },
        state: state as PublicTable['state'],
        staffOnline: this.presence.isOnline(r.tenantId),
      };
    });
  }

  async menu(token: string): Promise<Menu> {
    const r = await this.resolve(token);
    return this.db.withTenantTx(r.tenantId, (tx) => this.catalog.menu(tx, r.tenantId));
  }

  /** BR-19 — só resolve o token e lê a presença em memória; barato o bastante para polling. */
  async staffPresence(token: string): Promise<StaffPresence> {
    const r = await this.resolve(token);
    return { staffOnline: this.presence.isOnline(r.tenantId) };
  }
}

@Public()
@RateLimit({ bucket: 'public', limit: 120, windowMs: 60_000 })
@Controller('public/tables')
export class PublicTablesController {
  constructor(private readonly pub: PublicTableService) {}

  @Get(':token')
  @Header('Cache-Control', 'no-store')
  table(@Param('token') token: string) {
    return this.pub.publicTable(token);
  }

  @Get(':token/menu')
  @Header('Cache-Control', 'no-store')
  menu(@Param('token') token: string) {
    return this.pub.menu(token);
  }

  /**
   * BR-19 — polling de presença do cliente (20 s); o socket `presence` é o caminho rápido.
   * Balde próprio: numa mesma rede Wi-Fi dezenas de celulares dividem o IP, e 3 req/min cada
   * consumiriam o balde `public` inteiro. A resposta é 1 lookup indexado + leitura em memória.
   */
  @RateLimit({ bucket: 'presence', limit: 600, windowMs: 60_000 })
  @Get(':token/presence')
  @Header('Cache-Control', 'no-store')
  presence(@Param('token') token: string) {
    return this.pub.staffPresence(token);
  }
}

@Module({
  imports: [CatalogModule],
  controllers: [PublicTablesController],
  providers: [PublicTableService],
  exports: [PublicTableService],
})
export class PublicModule {}
