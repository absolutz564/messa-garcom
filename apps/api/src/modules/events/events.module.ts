import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { EventPublisher } from './event-publisher.service';
import { RealtimeGateway } from './realtime.gateway';
import { StaffPresenceService } from './staff-presence.service';

/** Outbox + publisher + gateway WebSocket (ADR-003) + presença da equipe (ADR-005). */
@Global()
@Module({
  providers: [OutboxService, EventPublisher, RealtimeGateway, StaffPresenceService],
  exports: [OutboxService, RealtimeGateway, StaffPresenceService],
})
export class EventsModule {}
