import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { uuidv7 } from 'uuidv7';
import { requestContext } from './request-context';

@Module({})
export class RequestContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: { headers: Record<string, unknown>; id?: string }, _res: unknown, next: () => void) => {
        const requestId = (req.headers['x-request-id'] as string | undefined) ?? req.id ?? uuidv7();
        requestContext.run({ requestId }, next);
      })
      .forRoutes('*');
  }
}
