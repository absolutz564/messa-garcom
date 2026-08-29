import { BadRequestException, Body, Controller, Get, Header, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CancelOrderSchema, CreateOrderSchema, type CreateOrder } from '@messa/contracts';
import { CurrentPrincipal, Public, Roles } from '../../common/decorators';
import type { StaffPrincipal } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { RateLimit } from '../../common/guards/ip-rate-limit.guard';
import { CustomerContextService } from '../presence/customer-context.service';
import { OrderService } from './order.service';

function requireKey(key: string | undefined): string {
  if (!key || key.length < 8 || key.length > 128) throw new BadRequestException({ code: 'validation', message: 'Header Idempotency-Key obrigatório (8–128 chars)' });
  return key;
}

/** Cliente (F07, F11). */
@Public()
@RateLimit({ bucket: 'public', limit: 120, windowMs: 60_000 })
@Controller('public/session')
export class PublicOrdersController {
  constructor(
    private readonly orders: OrderService,
    private readonly customer: CustomerContextService,
  ) {}

  @Post('orders')
  @HttpCode(201)
  create(@Req() req: FastifyRequest, @Body(new ZodPipe(CreateOrderSchema)) body: CreateOrder, @Headers('idempotency-key') key?: string) {
    const c = this.customer.requireParticipant(req);
    return this.orders.create(c.t, c.s, { kind: 'customer', participantId: c.p, deviceId: c.d }, body, requireKey(key));
  }

  @Get('orders')
  @Header('Cache-Control', 'no-store')
  list(@Req() req: FastifyRequest) {
    const c = this.customer.requireParticipant(req);
    return this.orders.consumption(c.t, c.s);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancel(@Req() req: FastifyRequest, @Param('id', ParseUUIDPipe) id: string) {
    const c = this.customer.requireParticipant(req);
    return this.orders.cancel(c.t, id, { kind: 'customer', participantId: c.p, deviceId: c.d }, 'cancelled_by_customer');
  }
}

/** Staff (F07 ack, F08 garçom pede, RF-65). */
@Controller('staff')
export class StaffOrdersController {
  constructor(private readonly orders: OrderService) {}

  @Get('orders')
  @Roles('operator')
  queue(@CurrentPrincipal() p: StaffPrincipal) {
    return this.orders.queue(p.tenantId!);
  }

  @Get('orders/recent')
  @Roles('operator')
  recent(@CurrentPrincipal() p: StaffPrincipal) {
    return this.orders.recent(p.tenantId!);
  }

  @Post('sessions/:id/orders')
  @Roles('operator', 'waiter')
  create(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) sessionId: string, @Body(new ZodPipe(CreateOrderSchema)) body: CreateOrder, @Headers('idempotency-key') key?: string) {
    return this.orders.create(p.tenantId!, sessionId, { kind: 'staff', userId: p.userId }, body, requireKey(key));
  }

  @Get('sessions/:id/orders')
  @Roles('operator', 'waiter')
  consumption(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) sessionId: string) {
    return this.orders.consumption(p.tenantId!, sessionId);
  }

  @Post('orders/:id/ack')
  @Roles('operator')
  @HttpCode(200)
  ack(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.acknowledge(p.tenantId!, id, { kind: 'staff', id: p.userId });
  }

  @Post('orders/:id/cancel')
  @Roles('operator')
  @HttpCode(200)
  cancel(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(CancelOrderSchema)) body: { reason?: string }) {
    return this.orders.cancel(p.tenantId!, id, { kind: 'staff', userId: p.userId }, body.reason ?? 'cancelled_by_staff');
  }
}
