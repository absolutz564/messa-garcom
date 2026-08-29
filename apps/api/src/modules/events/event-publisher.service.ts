import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { isNull, sql } from 'drizzle-orm';
import { schema, type DbHandle } from '@messa/db';
import type { DomainEventEnvelope, EventType } from '@messa/contracts';
import { DB } from '../db/db.module';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Lê a outbox e publica. MVP: polling curto (500 ms) — barato e suficiente para ≤ 2 s (RNF-04).
 * Quando houver >1 instância: trocar por LISTEN/NOTIFY + lock `FOR UPDATE SKIP LOCKED` (já usado aqui).
 */
@Injectable()
export class EventPublisher implements OnModuleDestroy {
  private readonly log = new Logger(EventPublisher.name);
  private running = false;
  private stopped = false;

  constructor(
    @Inject(DB) private readonly db: DbHandle,
    private readonly realtime: RealtimeGateway,
  ) {}

  onModuleDestroy() {
    this.stopped = true;
  }

  @Interval(500)
  async tick() {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      await this.publishBatch();
    } catch (err) {
      this.log.error(err);
    } finally {
      this.running = false;
    }
  }

  async publishBatch(limit = 100): Promise<number> {
    return this.db.withPlatformTx(async (tx) => {
      const rows = await tx
        .select()
        .from(schema.domainEvents)
        .where(isNull(schema.domainEvents.publishedAt))
        .orderBy(schema.domainEvents.createdAt)
        .limit(limit)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return 0;

      for (const row of rows) {
        const envelope: DomainEventEnvelope = {
          id: row.id,
          type: row.type as EventType,
          tenantId: row.tenantId,
          aggregateType: row.aggregateType,
          aggregateId: row.aggregateId,
          actor: row.actor as DomainEventEnvelope['actor'],
          occurredAt: row.createdAt.toISOString(),
          payload: row.payload as Record<string, unknown>,
        };
        this.realtime.emit(envelope);
      }
      await tx
        .update(schema.domainEvents)
        .set({ publishedAt: new Date() })
        .where(sql`${schema.domainEvents.id} IN ${rows.map((r) => r.id)}`);
      return rows.length;
    });
  }
}
