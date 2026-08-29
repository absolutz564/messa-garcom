import { Injectable } from '@nestjs/common';
import { schema, type Tx } from '@messa/db';
import type { EventType } from '@messa/contracts';
import type { Actor } from '@messa/domain';

export interface AppendEventInput {
  tenantId: string;
  type: EventType;
  aggregateType: string;
  aggregateId: string;
  actor: Actor;
  payload?: Record<string, unknown>;
}

/**
 * BR-17: todo evento é gravado NA MESMA transação da mudança de estado.
 * Payload nunca contém PIN.
 */
@Injectable()
export class OutboxService {
  async append(tx: Tx, input: AppendEventInput): Promise<string> {
    if (input.payload && 'pin' in input.payload) {
      throw new Error('Payload de evento não pode conter PIN');
    }
    const [row] = await tx
      .insert(schema.domainEvents)
      .values({
        tenantId: input.tenantId,
        type: input.type,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        actor: input.actor,
        payload: input.payload ?? {},
      })
      .returning({ id: schema.domainEvents.id });
    return row!.id;
  }
}
