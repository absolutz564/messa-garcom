'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from './api';

/** Fetch simples com reload manual. Suficiente para o admin do MVP. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));

  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      setData(await api<T>(path));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Erro de rede');
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, setData };
}

export function errorMessage(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : e instanceof Error ? e.message : 'Erro inesperado';
}
