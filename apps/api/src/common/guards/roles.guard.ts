import { ForbiddenException, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@messa/contracts';
import { IS_PUBLIC, PLATFORM_ADMIN, ROLES } from '../decorators';
import type { StaffPrincipal } from '../request-context';

/**
 * RBAC (docs/05-security/auth.md).
 * - @PlatformAdmin(): exige is_platform_admin.
 * - @Roles(...): exige membership com um dos papéis; admin herda operator e waiter.
 * - Sem decorator: qualquer staff autenticado com tenant ativo.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;

    const req = ctx.switchToHttp().getRequest<{ principal?: StaffPrincipal }>();
    const p = req.principal;
    if (!p) throw new ForbiddenException({ code: 'forbidden' });

    if (this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN, targets)) {
      if (!p.isPlatformAdmin) throw new ForbiddenException({ code: 'forbidden' });
      if (!p.mfa) throw new ForbiddenException({ code: 'totp_setup_required', message: 'Ative a verificação em duas etapas para acessar a plataforma' });
      return true;
    }

    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    // Sem @Roles: qualquer staff autenticado (inclui platform admin sem tenant — /auth/me, /auth/2fa/*).
    if (!roles || roles.length === 0) return true;
    if (!p.tenantId || !p.role) throw new ForbiddenException({ code: 'no_active_tenant' });
    if (p.role === 'admin') return true;
    if (!roles.includes(p.role)) throw new ForbiddenException({ code: 'forbidden' });
    return true;
  }
}
