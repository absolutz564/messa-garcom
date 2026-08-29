import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { schema, type DbHandle, type Tx } from '@messa/db';
import { APP_CONFIG, type AppConfig } from '../../config/config';
import { CookieCodec, DEVICE_COOKIE, PARTICIPANT_COOKIE, type DeviceCookie, type ParticipantCookie } from '../../common/cookie-codec';
import { DB } from '../db/db.module';

const YEAR_S = 365 * 86_400;

/**
 * Identidade do cliente anônimo (ADR-004, RF-43):
 * - `messa_device`: pseudônimo persistente por tenant (base do anti-spam).
 * - `messa_participant`: vínculo com a sessão atual.
 * Ambos HttpOnly e assinados; o cliente nunca escolhe seus IDs.
 */
@Injectable()
export class CustomerContextService {
  readonly codec: CookieCodec;

  constructor(
    @Inject(DB) private readonly db: DbHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    this.codec = new CookieCodec(config.COOKIE_SECRET);
  }

  /** Lê o cookie de dispositivo válido para o tenant; null se ausente/inválido/outro tenant. */
  readDevice(req: FastifyRequest, tenantId: string): string | null {
    const c = this.codec.decode<DeviceCookie>(req.cookies?.[DEVICE_COOKIE]);
    return c && c.t === tenantId ? c.d : null;
  }

  /** Garante um Device para (req, tenant): reaproveita o cookie ou cria e emite um novo. */
  async ensureDevice(req: FastifyRequest, reply: FastifyReply, tenantId: string, tx: Tx): Promise<string> {
    const existing = this.readDevice(req, tenantId);
    if (existing) {
      const [row] = await tx.select({ id: schema.devices.id }).from(schema.devices).where(eq(schema.devices.id, existing));
      if (row) {
        await tx.update(schema.devices).set({ lastSeenAt: new Date() }).where(eq(schema.devices.id, existing));
        return existing;
      }
    }
    const [created] = await tx.insert(schema.devices).values({ tenantId }).returning({ id: schema.devices.id });
    this.setCookie(reply, DEVICE_COOKIE, this.codec.encode({ d: created!.id, t: tenantId } satisfies DeviceCookie), YEAR_S);
    return created!.id;
  }

  readParticipant(req: FastifyRequest): ParticipantCookie | null {
    return this.codec.decode<ParticipantCookie>(req.cookies?.[PARTICIPANT_COOKIE]);
  }

  requireParticipant(req: FastifyRequest): ParticipantCookie {
    const p = this.readParticipant(req);
    if (!p) throw new UnauthorizedException({ code: 'not_in_session', message: 'Você não está em um atendimento' });
    return p;
  }

  setParticipant(reply: FastifyReply, c: ParticipantCookie) {
    // Vida longa no cookie; a validade real é o status da sessão (BR-07/BR-13).
    this.setCookie(reply, PARTICIPANT_COOKIE, this.codec.encode(c), 2 * 86_400);
  }

  clearParticipant(reply: FastifyReply) {
    reply.clearCookie(PARTICIPANT_COOKIE, { path: '/' });
  }

  private setCookie(reply: FastifyReply, name: string, value: string, maxAge: number) {
    reply.setCookie(name, value, {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
  }
}
