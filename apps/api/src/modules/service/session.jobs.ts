import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SessionService } from './session.service';

/** Jobs de 60 s (06-database/schema.md): expiração de solicitações e inatividade de sessões. */
@Injectable()
export class SessionJobs implements OnModuleDestroy {
  private readonly log = new Logger(SessionJobs.name);
  private stopped = false;
  private running = false;

  constructor(private readonly sessions: SessionService) {}

  onModuleDestroy() {
    this.stopped = true;
  }

  @Interval(60_000)
  async tick() {
    if (this.stopped || this.running) return;
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
