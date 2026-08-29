'use client';

import type { ApiError, LoginResponse } from '@messa/contracts';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const SESSION_KEY = 'messa_session';

export class ApiRequestError extends Error {
  constructor(public readonly error: ApiError) {
    super(error.message);
  }
}

export function getSession(): LoginResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as LoginResponse) : null;
  } catch {
    return null;
  }
}

export function setSession(session: LoginResponse | null) {
  if (typeof window === 'undefined') return;
  if (session) window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else window.localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event('messa:session'));
}

let refreshing: Promise<LoginResponse | null> | null = null;

/** Access token expira em 15 min; o refresh usa o cookie HttpOnly (ADR-004). */
export async function refreshSession(): Promise<LoginResponse | null> {
  if (!refreshing) {
    refreshing = fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          setSession(null);
          return null;
        }
        const session = (await res.json()) as LoginResponse;
        setSession(session);
        return session;
      })
      .catch(() => null)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  raw?: boolean;
}

export async function api<T = unknown>(path: string, opts: ApiOptions = {}, retry = true): Promise<T> {
  const session = getSession();
  const headers = new Headers(opts.headers);
  if (session?.accessToken) headers.set('authorization', `Bearer ${session.accessToken}`);
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API_URL}${path}`, { ...opts, headers, body, credentials: 'include' });
  if (res.status === 401 && retry && session) {
    const refreshed = await refreshSession();
    if (refreshed) return api<T>(path, opts, false);
  }
  if (!res.ok) {
    let err: ApiError;
    try {
      err = (await res.json()) as ApiError;
    } catch {
      err = { statusCode: res.status, code: 'http_error', message: res.statusText };
    }
    throw new ApiRequestError(err);
  }
  if (opts.raw) return (await res.blob()) as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function login(email: string, password: string, tenantId?: string, totpCode?: string): Promise<LoginResponse> {
  const session = await api<LoginResponse>('/auth/login', { method: 'POST', body: { email, password, tenantId, totpCode } }, false);
  setSession(session);
  return session;
}

export async function logout() {
  try {
    await api('/auth/logout', { method: 'POST' }, false);
  } finally {
    setSession(null);
  }
}

/** Destino padrão após login, por papel (auth.md). */
export function homeFor(session: LoginResponse): string {
  if (session.activeTenant?.role === 'admin') return '/admin';
  if (session.activeTenant) return '/staff';
  if (session.isPlatformAdmin) return '/platform';
  return '/staff/login';
}
