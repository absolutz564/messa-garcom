import { AsyncLocalStorage } from 'node:async_hooks';
import type { Role } from '@messa/contracts';

/** Ator autenticado (staff). Cliente anônimo terá contexto próprio na fase 2. */
export interface StaffPrincipal {
  kind: 'staff';
  userId: string;
  tenantId: string | null;
  role: Role | null;
  isPlatformAdmin: boolean;
  /** 2FA verificado (obrigatório para /platform). */
  mfa: boolean;
  jti: string;
}

export interface RequestContext {
  requestId: string;
  principal?: StaffPrincipal;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentContext(): RequestContext | undefined {
  return requestContext.getStore();
}
