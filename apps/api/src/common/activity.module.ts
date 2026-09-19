import { Global, Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ActivityService } from './activity.service';

/**
 * Rotas que **não** contam como movimento.
 *
 * O health check do Fly bate a cada 15 s e o monitor externo a cada poucos
 * minutos, para sempre. Se essas batidas marcassem atividade, o sistema nunca
 * pareceria ocioso e os jobs jamais parariam de consultar o banco — o custo que
 * `ActivityService` existe para cortar continuaria igual, só que com mais código.
 */
const IGNORADAS = new Set(['/health', '/ready']);

@Global()
@Module({ providers: [ActivityService], exports: [ActivityService] })
export class ActivityModule implements NestModule {
  constructor(private readonly activity: ActivityService) {}

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: { url?: string }, _res: unknown, next: () => void) => {
        // `url` traz a query string; só o caminho interessa.
        const caminho = (req.url ?? '').split('?')[0]!;
        if (!IGNORADAS.has(caminho)) this.activity.marcar();
        next();
      })
      .forRoutes('*');
  }
}
