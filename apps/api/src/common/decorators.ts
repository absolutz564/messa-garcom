import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Role } from '@messa/contracts';
import type { StaffPrincipal } from './request-context';

export const IS_PUBLIC = 'messa:public';
export const ROLES = 'messa:roles';
export const PLATFORM_ADMIN = 'messa:platform_admin';

/** Rota sem autenticação de staff (cardápio público, login, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Papéis de tenant aceitos. `admin` sempre herda os demais (auth.md). */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Exige `is_platform_admin`. */
export const PlatformAdmin = () => SetMetadata(PLATFORM_ADMIN, true);

export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext): StaffPrincipal => {
  const req = ctx.switchToHttp().getRequest<{ principal?: StaffPrincipal }>();
  if (!req.principal) throw new Error('principal ausente — guard não executado?');
  return req.principal;
});
