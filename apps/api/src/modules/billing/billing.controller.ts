import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ChoosePlanSchema, type ChoosePlan } from '@messa/contracts';
import { CurrentPrincipal, Roles } from '../../common/decorators';
import { RateLimit } from '../../common/guards/ip-rate-limit.guard';
import type { StaffPrincipal } from '../../common/request-context';
import { ZodPipe } from '../../common/zod.pipe';
import { BillingService } from './billing.service';

/** Assinatura do tenant (BR-20/PDR-017). Leitura para qualquer staff; ações financeiras só para admin. */
@Controller('admin/billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  @Roles('admin', 'operator', 'waiter')
  status(@CurrentPrincipal() p: StaffPrincipal) {
    return this.billing.getStatus(p.tenantId!);
  }

  @Post('plan')
  @Roles('admin')
  @HttpCode(200)
  choosePlan(@CurrentPrincipal() p: StaffPrincipal, @Body(new ZodPipe(ChoosePlanSchema)) body: ChoosePlan) {
    return this.billing.choosePlan(p.tenantId!, body.plan);
  }

  /**
   * Única porta que cria cobrança (BR-20/PDR-024) — por isso ela tem teto.
   *
   * Cada chamada vira um pagamento real no provedor. Quem está pagando precisa
   * de uma, talvez duas se a primeira vencer; dez por hora já é alguém segurando
   * o botão. O limite não protege contra fraude (a rota exige admin do tenant),
   * protege contra repetição acidental custar dinheiro.
   */
  @Post('pix')
  @Roles('admin')
  @RateLimit({ bucket: 'billing_pix', limit: 10, windowMs: 60 * 60_000 })
  @HttpCode(200)
  createCharge(@CurrentPrincipal() p: StaffPrincipal) {
    return this.billing.getOrCreateCharge(p.tenantId!);
  }

  @Get('pix/:id')
  @Roles('admin')
  verifyCharge(@CurrentPrincipal() p: StaffPrincipal, @Param('id', ParseUUIDPipe) id: string) {
    return this.billing.verifyCharge(p.tenantId!, id);
  }
}
