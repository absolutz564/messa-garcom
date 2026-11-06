import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ActivityService, OCIOSO_MS } from '../../common/activity.service';
import { BillingService } from './billing.service';

/**
 * Job de 5 min (BR-20/PDR-024): confirma sozinho toda cobrança pendente — é isto
 * que cumpre "o admin não precisa manter a tela aberta" — e limpa as vencidas.
 *
 * **Nenhum job cria cobrança.** Quem cria é a tela de assinatura, sob demanda,
 * com o admin presente. A geração automática existiu e produziu 10.359 cobranças
 * reais de R$ 149 em contas que o próprio sistema já havia bloqueado: ninguém era
 * avisado delas (o evento `billing.charge_created` nunca teve consumidor e o
 * e-mail nunca foi escrito) e cada uma valia 30 minutos. Pagava-se o risco de um
 * job que gasta dinheiro para não entregar aviso nenhum.
 */
@Injectable()
export class BillingJobs implements OnModuleDestroy {
  private readonly log = new Logger(BillingJobs.name);
  private stopped = false;
  private running = false;

  constructor(
    private readonly billing: BillingService,
    private readonly activity: ActivityService,
  ) {}

  onModuleDestroy() {
    this.stopped = true;
  }

  @Interval(5 * 60_000)
  async tick() {
    if (this.stopped || this.running) return;
    /*
     * Quem acabou de pagar um Pix está com a tela da assinatura aberta, e ela
     * confirma sozinha enquanto estiver ali (BR-20). Este job é a rede de
     * segurança para quem fechou a aba — e essa pessoa volta ao sistema em
     * algum momento, o que reabre a porta e confirma em até 5 min. O preço de
     * consultar a cada 5 min com a casa vazia é o banco nunca dormir.
     */
    if (this.activity.ocioso(OCIOSO_MS)) return;
    this.running = true;
    try {
      const confirmed = await this.billing.confirmPendingCharges();
      const expired = await this.billing.expireStaleCharges();
      if (confirmed || expired) this.log.log(`confirmed=${confirmed} expired=${expired}`);
    } catch (err) {
      this.log.error(err);
    } finally {
      this.running = false;
    }
  }
}
