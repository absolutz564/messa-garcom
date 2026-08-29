import { Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { AccessTokenClaims } from '@messa/contracts';
import { IS_PUBLIC } from '../decorators';
import { currentContext, type StaffPrincipal } from '../request-context';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      principal?: StaffPrincipal;
      messaCtx?: Record<string, unknown>;
    }>();
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException({ code: 'unauthorized' });

    let claims: AccessTokenClaims;
    try {
      claims = await this.jwt.verifyAsync<AccessTokenClaims>(header.slice(7));
    } catch {
      throw new UnauthorizedException({ code: 'token_invalid' });
    }

    const principal: StaffPrincipal = {
      kind: 'staff',
      userId: claims.sub,
      tenantId: claims.tenant_id,
      role: claims.role,
      isPlatformAdmin: claims.is_platform_admin,
      mfa: Boolean(claims.mfa),
      jti: claims.jti,
    };
    req.principal = principal;
    req.messaCtx = { tenantId: principal.tenantId, userId: principal.userId };
    const store = currentContext();
    if (store) store.principal = principal;
    return true;
  }
}
