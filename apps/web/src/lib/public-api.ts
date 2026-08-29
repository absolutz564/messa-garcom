'use client';

import type { ApiError, CreateOrder, CreateOrderResult, CustomerRequest, CustomerSession, Order, SessionConsumption } from '@messa/contracts';
import { API_URL, ApiRequestError } from './api';

/** Chamadas do cliente anônimo: sem bearer, sempre com cookies. */
async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    let err: ApiError;
    try {
      err = (await res.json()) as ApiError;
    } catch {
      err = { statusCode: res.status, code: 'http_error', message: res.statusText };
    }
    throw new ApiRequestError(err);
  }
  return (await res.json()) as T;
}

export const publicApi = {
  requestService: (token: string) => call<CustomerRequest>(`/public/tables/${token}/requests`, { method: 'POST' }),
  requestStatus: (token: string, id: string) => call<CustomerRequest>(`/public/tables/${token}/requests/${id}`),
  join: (token: string, pin: string) => call<CustomerSession>(`/public/tables/${token}/join`, { method: 'POST', body: JSON.stringify({ pin }) }),
  session: () => call<CustomerSession>('/public/session'),
  createOrder: (body: CreateOrder, idempotencyKey: string) => call<CreateOrderResult>('/public/session/orders', { method: 'POST', body: JSON.stringify(body), headers: { 'idempotency-key': idempotencyKey } }),
  consumption: () => call<SessionConsumption>('/public/session/orders'),
  cancelOrder: (id: string) => call<Order>(`/public/session/orders/${id}/cancel`, { method: 'POST' }),
  tableState: (token: string) => call<{ state: 'free' | 'requested' | 'occupied' | 'inactive' }>(`/public/tables/${token}`),
};

export function isApiError(e: unknown, code?: string): e is ApiRequestError {
  return e instanceof ApiRequestError && (!code || e.error.code === code);
}
