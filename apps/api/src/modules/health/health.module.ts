import { Controller, Get, Inject, Module, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { DbHandle } from '@messa/db';
import { Public } from '../../common/decorators';
import { DB } from '../db/db.module';

@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: DbHandle) {}

  @Public()
  @Get('health')
  live() {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.db.raw.execute(sql`select 1`);
      return { status: 'ok', db: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ code: 'db_unavailable' });
    }
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
