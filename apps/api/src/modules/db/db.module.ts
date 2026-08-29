import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createDb, type DbHandle } from '@messa/db';
import { APP_CONFIG, type AppConfig } from '../../config/config';

export const DB = Symbol('DB');

@Global()
@Module({
  providers: [
    {
      provide: DB,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): DbHandle => createDb(config.DATABASE_URL),
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: DbHandle) {}
  async onApplicationShutdown() {
    await this.db.close();
  }
}
