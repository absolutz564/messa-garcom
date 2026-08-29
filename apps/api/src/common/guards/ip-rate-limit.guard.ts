import { HttpException, Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export interface RateLimitRule {
  /** Nome do balde (rotas com o mesmo nome compartilham o limite). */
  bucket: string;
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT = 'messa:rate_limit';
/** Última linha de defesa por IP (05-security/auth.md). As regras de domínio vêm antes. */
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT, rule);

/**
 * Janela deslizante em memória. Suficiente para 1 instância (MVP);
 * com >1 instância, trocar o store por Redis (mesma interface).
 */
export class SlidingWindowStore {
  private readonly hits = new Map<string, number[]>();
  private lastSweep = Date.now();

  /** Registra um hit e devolve quantos existem na janela (incluindo este). */
  hit(key: string, windowMs: number, now = Date.now()): number {
    const from = now - windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > from);
    list.push(now);
    this.hits.set(key, list);
    if (now - this.lastSweep > 60_000) this.sweep(now);
    return list.length;
  }

  private sweep(now: number) {
    this.lastSweep = now;
    for (const [k, list] of this.hits) {
      if (list.length === 0 || list[list.length - 1]! < now - 3_600_000) this.hits.delete(k);
    }
  }
}

@Injectable()
export class IpRateLimitGuard implements CanActivate {
  private readonly store = new SlidingWindowStore();

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(RATE_LIMIT, [ctx.getHandler(), ctx.getClass()]);
    if (!rule) return true;
    const req = ctx.switchToHttp().getRequest<{ ip: string; headers: Record<string, string | undefined> }>();
    const ip = req.ip;
    const n = this.store.hit(`${rule.bucket}:${ip}`, rule.windowMs);
    if (n > rule.limit) {
      throw new HttpException({ code: 'ip_rate_limited', message: 'Muitas requisições. Tente novamente em instantes.' }, 429);
    }
    return true;
  }
}
