import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ActivityService, OCIOSO_MS } from '../../common/activity.service';
import { SessionService } from './session.service';

/** Jobs de 60 s (06-database/schema.md): expiração de solicitações e inatividade de sessões. */
@Injectable()
export class SessionJobs implements OnModuleDestroy {
  private readonly log = new Logger(SessionJobs.name);
  private stopped = false;
  private running = false;

  constructor(
    private readonly sessions: SessionService,
    private readonly activity: ActivityService,
  ) {}

  onModuleDestroy() {
    this.stopped = true;
  }

  @Interval(60_000)
  async tick() {
    if (this.stopped || this.running) return;
    /*
     * Com a casa vazia não há solicitação expirando nem sessão envelhecendo que
     * alguém vá ver. **A regra de BR-09 não depende deste job**: o destino de um
     * pedido usa `effectiveSessionStatus`, que deriva a inatividade do relógio
     * na hora da leitura. Este job grava a mudança e publica o evento para o
     * painel — escrituração, não fonte da verdade.
     */
    if (this.activity.ocioso(OCIOSO_MS)) return;
    this.running = true;
    try {
      const expired = await this.sessions.expireRequests();
      const inactive = await this.sessions.markInactiveSessions();
      if (expired || inactive) this.log.log(`expired=${expired} inactive=${inactive}`);
    } catch (err) {
      this.log.error(err);
    } finally {
      this.running = false;
    }
  }
}
