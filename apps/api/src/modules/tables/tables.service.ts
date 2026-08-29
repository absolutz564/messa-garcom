import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, ne } from 'drizzle-orm';
import QRCode from 'qrcode';
import { schema, type DbHandle, type Tx } from '@messa/db';
import { generatePublicToken } from '@messa/domain';
import type { Table } from '@messa/contracts';
import { APP_CONFIG, type AppConfig } from '../../config/config';
import { DB } from '../db/db.module';
import { OutboxService } from '../events/outbox.service';

/** Mesas e QR (RF-20..25). */
@Injectable()
export class TablesService {
  constructor(
    @Inject(DB) private readonly db: DbHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly outbox: OutboxService,
  ) {}

  list(tenantId: string): Promise<Table[]> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const rows = await tx
        .select()
        .from(schema.tables)
        .where(eq(schema.tables.tenantId, tenantId))
        .orderBy(asc(schema.tables.sortOrder), asc(schema.tables.displayName));
      return rows.map((r) => this.toDto(r));
    });
  }

  get(tenantId: string, id: string): Promise<Table> {
    return this.db.withTenantTx(tenantId, async (tx) => this.toDto(await this.find(tx, tenantId, id)));
  }

  create(tenantId: string, displayName: string, actorUserId: string): Promise<Table> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      await this.assertNameFree(tx, tenantId, displayName);
      const [row] = await tx
        .insert(schema.tables)
        .values({ tenantId, displayName, publicToken: generatePublicToken() })
        .returning();
      await this.changed(tx, tenantId, row!.id, actorUserId, { displayName });
      return this.toDto(row!);
    });
  }

  /** RF-22: renomear não altera o token. */
  update(
    tenantId: string,
    id: string,
    input: { displayName?: string; isActive?: boolean; sortOrder?: number },
    actorUserId: string,
  ): Promise<Table> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      if (input.displayName) await this.assertNameFree(tx, tenantId, input.displayName, id);
      if (input.isActive === false) {
        const [live] = await tx
          .select({ id: schema.sessions.id })
          .from(schema.sessions)
          .where(and(eq(schema.sessions.tableId, id), ne(schema.sessions.status, 'closed')))
          .limit(1);
        if (live) throw new ConflictException({ code: 'table_has_live_session', message: 'Encerre a sessão antes de desativar a mesa' });
      }
      const set = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      const [row] = await tx
        .update(schema.tables)
        .set(set)
        .where(and(eq(schema.tables.tenantId, tenantId), eq(schema.tables.id, id)))
        .returning();
      if (!row) throw new NotFoundException({ code: 'not_found' });
      await this.changed(tx, tenantId, id, actorUserId, input);
      return this.toDto(row);
    });
  }

  /** RF-25: rotação de token — QR antigo passa a responder 410. */
  rotateToken(tenantId: string, id: string, actorUserId: string): Promise<Table> {
    return this.db.withTenantTx(tenantId, async (tx) => {
      const current = await this.find(tx, tenantId, id);
      await tx.insert(schema.revokedTableTokens).values({ token: current.publicToken, tenantId, tableId: id });
      const [row] = await tx
        .update(schema.tables)
        .set({ publicToken: generatePublicToken() })
        .where(eq(schema.tables.id, id))
        .returning();
      await this.changed(tx, tenantId, id, actorUserId, { tokenRotated: true });
      return this.toDto(row!);
    });
  }

  async qrSvg(tenantId: string, id: string): Promise<string> {
    const table = await this.get(tenantId, id);
    return QRCode.toString(table.qrUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  }

  async qrPng(tenantId: string, id: string): Promise<Buffer> {
    const table = await this.get(tenantId, id);
    return QRCode.toBuffer(table.qrUrl, { type: 'png', width: 800, margin: 1, errorCorrectionLevel: 'M' });
  }

  qrUrlFor(token: string): string {
    return `${this.config.QR_BASE_URL}/t/${token}`;
  }

  private async find(tx: Tx, tenantId: string, id: string) {
    const [row] = await tx.select().from(schema.tables).where(and(eq(schema.tables.tenantId, tenantId), eq(schema.tables.id, id)));
    if (!row) throw new NotFoundException({ code: 'not_found' });
    return row;
  }

  private async assertNameFree(tx: Tx, tenantId: string, displayName: string, exceptId?: string) {
    const [dup] = await tx
      .select({ id: schema.tables.id })
      .from(schema.tables)
      .where(and(eq(schema.tables.tenantId, tenantId), eq(schema.tables.displayName, displayName), exceptId ? ne(schema.tables.id, exceptId) : undefined));
    if (dup) throw new ConflictException({ code: 'table_name_taken', message: 'Já existe uma mesa com esse nome' });
  }

  private changed(tx: Tx, tenantId: string, id: string, actorUserId: string, payload: Record<string, unknown>) {
    return this.outbox.append(tx, { tenantId, type: 'table.changed', aggregateType: 'table', aggregateId: id, actor: { kind: 'staff', id: actorUserId }, payload });
  }

  private toDto(r: typeof schema.tables.$inferSelect): Table {
    return {
      id: r.id,
      displayName: r.displayName,
      publicToken: r.publicToken,
      qrUrl: this.qrUrlFor(r.publicToken),
      isActive: r.isActive,
      sortOrder: r.sortOrder,
    };
  }
}
