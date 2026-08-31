import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { BillingService } from './billing.service';

/**
 * Job de 5 min (BR-20/ADR-006): gera a próxima cobrança perto do vencimento,
 * confirma sozinho toda cobrança pendente (o admin não precisa manter a tela
 * aberta) e limpa cobranças vencidas sem pagamento.
 */
@Injectable()
export class BillingJobs implements OnModuleDestroy {
  private readonly log = new Logger(BillingJobs.name);
  private stopped = false;
  private running = false;

  constructor(private readonly billing: BillingService) {}

  onModuleDestroy() {
    this.stopped = true;
  }

  @Interval(5 * 60_000)
  async tick() {
    if (this.stopped || this.running) return;
    this.running = true;
    try {
      const created = await this.billing.generateRenewalCharges();
      const confirmed = await this.billing.confirmPendingCharges();
      const expired = await this.billing.expireStaleCharges();
      if (created || confirmed || expired) this.log.log(`created=${created} confirmed=${confirmed} expired=${expired}`);
    } catch (err) {
      this.log.error(err);
    } finally {
      this.running = false;
    }
  }
}
