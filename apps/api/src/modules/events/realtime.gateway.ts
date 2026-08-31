import { Logger, type OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { EVENT_ROOMS, type AccessTokenClaims, type DomainEventEnvelope, type StaffPresence } from '@messa/contracts';
import { DEVICE_COOKIE, PARTICIPANT_COOKIE, parseCookieHeader, type DeviceCookie, type ParticipantCookie } from '../../common/cookie-codec';
import { CustomerContextService } from '../presence/customer-context.service';
import { StaffPresenceService } from './staff-presence.service';

/**
 * ADR-003. O servidor decide as rooms; o cliente nunca faz `join` arbitrário.
 * Staff (JWT):   tenant:{id}
 * Cliente (cookies): device:{id}, tenant-sessions:{tenantId}, session:{id} (se participante)
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server!: Server;
  private readonly log = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly customer: CustomerContextService,
    private readonly presence: StaffPresenceService,
  ) {}

  onModuleInit() {
    // BR-19: a virada de presença vai para os clientes do tenant como mensagem própria,
    // separada de `event` — presença não é evento de domínio (ADR-005).
    this.presence.onChange((tenantId, staffOnline) => {
      this.server?.to(`tenant-sessions:${tenantId}`).emit('presence', { staffOnline } satisfies StaffPresence);
    });
  }

  async handleConnection(socket: Socket) {
    const token = (socket.handshake.auth?.token as string | undefined) ?? this.bearer(socket);
    if (token) {
      try {
        const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
        if (claims.tenant_id) {
          await socket.join(`tenant:${claims.tenant_id}`);
          socket.data.staffTenantId = claims.tenant_id;
          this.presence.connected(claims.tenant_id);
        }
        socket.data.claims = claims;
        return;
      } catch {
        socket.disconnect(true);
        return;
      }
    }
    const cookies = parseCookieHeader(socket.handshake.headers.cookie);
    const device = this.customer.codec.decode<DeviceCookie>(cookies[DEVICE_COOKIE]);
    if (!device) {
      socket.disconnect(true);
      return;
    }
    await socket.join([`device:${device.d}`, `tenant-sessions:${device.t}`]);
    const participant = this.customer.codec.decode<ParticipantCookie>(cookies[PARTICIPANT_COOKIE]);
    if (participant && participant.d === device.d) await socket.join(`session:${participant.s}`);
  }

  handleDisconnect(socket: Socket) {
    const tenantId = socket.data.staffTenantId as string | undefined;
    if (tenantId) this.presence.disconnected(tenantId);
  }

  emit(event: DomainEventEnvelope) {
    if (!this.server) return;
    const targets = EVENT_ROOMS[event.type] ?? [];
    const payload = event.payload;
    for (const target of targets) {
      switch (target) {
        case 'tenant':
          this.server.to(`tenant:${event.tenantId}`).emit('event', event);
          break;
        case 'session': {
          const sessionId = event.aggregateType === 'session' ? event.aggregateId : (payload.sessionId as string | undefined);
          if (sessionId) this.server.to(`session:${sessionId}`).emit('event', event);
          break;
        }
        case 'request':
          if (typeof payload.deviceId === 'string') this.server.to(`device:${payload.deviceId}`).emit('event', event);
          break;
        case 'all_sessions':
          this.server.to(`tenant-sessions:${event.tenantId}`).emit('event', event);
          break;
      }
    }
  }

  /** Cliente que acabou de entrar numa sessão avisa o socket (após receber o cookie). */
  private bearer(socket: Socket): string | undefined {
    const h = socket.handshake.headers.authorization;
    return h?.startsWith('Bearer ') ? h.slice(7) : undefined;
  }
}
