import { Body, Controller, Delete, Get, Header, HttpCode, Inject, Param, Patch, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { JoinSessionSchema, UpdateParticipantSchema } from '@messa/contracts';
import { DomainError } from '@messa/domain';
import { Public } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { RateLimit } from '../../common/guards/ip-rate-limit.guard';
import { DB } from '../db/db.module';
import type { DbHandle } from '@messa/db';
import { CustomerContextService } from '../presence/customer-context.service';
import { PublicTableService } from '../public/public.module';
import { SessionService } from './session.service';

/** Superfície do cliente anônimo (F02, F05, F06, F15). Sem JWT; identidade por cookies. */
@Public()
@RateLimit({ bucket: 'public', limit: 120, windowMs: 60_000 })
@Controller('public')
export class PublicSessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly customer: CustomerContextService,
    private readonly tables: PublicTableService,
    @Inject(DB) private readonly db: DbHandle,
  ) {}

  @Post('tables/:token/requests')
  @HttpCode(201)
  async request(@Param('token') token: string, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const t = await this.tables.resolve(token);
    const deviceId = await this.db.withTenantTx(t.tenantId, (tx) => this.customer.ensureDevice(req, reply, t.tenantId, tx));
    return this.sessions.requestService(t.tenantId, t.tableId, deviceId);
  }

  /** Polling de fallback (F02). Ao ficar aprovada, emite o cookie de participante (F05). */
  @Get('tables/:token/requests/:id')
  @Header('Cache-Control', 'no-store')
  async requestStatus(@Param('token') token: string, @Param('id') id: string, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const t = await this.tables.resolve(token);
    const deviceId = this.customer.readDevice(req, t.tenantId);
    if (!deviceId) throw new DomainError('not_found', 'Solicitação não encontrada');
    const { request, participantId } = await this.sessions.getCustomerRequest(t.tenantId, id, deviceId);
    if (request.status === 'approved' && request.sessionId && participantId) {
      this.customer.setParticipant(reply, { p: participantId, s: request.sessionId, t: t.tenantId, d: deviceId });
    }
    return request;
  }

  @RateLimit({ bucket: 'join', limit: 20, windowMs: 10 * 60_000 })
  @Post('tables/:token/join')
  @HttpCode(200)
  async join(@Param('token') token: string, @Body(new ZodPipe(JoinSessionSchema)) body: { pin: string }, @Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const t = await this.tables.resolve(token);
    const deviceId = await this.db.withTenantTx(t.tenantId, (tx) => this.customer.ensureDevice(req, reply, t.tenantId, tx));
    const { sessionId, participantId } = await this.sessions.join(t.tenantId, t.tableId, deviceId, body.pin);
    this.customer.setParticipant(reply, { p: participantId, s: sessionId, t: t.tenantId, d: deviceId });
    return this.sessions.customerSession(t.tenantId, sessionId, participantId);
  }

  /** Nome informal do participante (opcional). */
  @Patch('session/me')
  me(@Req() req: FastifyRequest, @Body(new ZodPipe(UpdateParticipantSchema)) body: { name: string | null }) {
    const c = this.customer.requireParticipant(req);
    return this.sessions.setParticipantName(c.t, c.s, c.p, body.name);
  }

  /** RF-68 — pedir a conta / desistir. */
  @Post('session/bill')
  @HttpCode(200)
  requestBill(@Req() req: FastifyRequest) {
    const c = this.customer.requireParticipant(req);
    return this.sessions.requestBill(c.t, c.s, c.p);
  }

  @Delete('session/bill')
  @HttpCode(200)
  cancelBill(@Req() req: FastifyRequest) {
    const c = this.customer.requireParticipant(req);
    return this.sessions.cancelBill(c.t, c.s, c.p);
  }

  /** Sessão atual do participante. 410 quando encerrada (cookie é limpo). */
  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(@Req() req: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const c = this.customer.requireParticipant(req);
    try {
      return await this.sessions.customerSession(c.t, c.s, c.p);
    } catch (e) {
      if (e instanceof DomainError && e.code === 'session_closed') this.customer.clearParticipant(reply);
      throw e;
    }
  }
}
