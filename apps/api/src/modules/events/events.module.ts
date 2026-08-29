import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { EventPublisher } from './event-publisher.service';
import { RealtimeGateway } from './realtime.gateway';

/** Outbox + publisher + gateway WebSocket (ADR-003). */
@Global()
@Module({
  providers: [OutboxService, EventPublisher, RealtimeGateway],
  exports: [OutboxService, RealtimeGateway],
})
export class EventsModule {}
