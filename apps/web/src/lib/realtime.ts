'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { DomainEventEnvelope } from '@messa/contracts';
import { API_URL, getSession } from './api';

type Handler = (event: DomainEventEnvelope) => void;

/**
 * Assina eventos de domínio (ADR-003). Staff autentica com o access token;
 * cliente anônimo autentica pelos cookies (withCredentials). Reconexão automática.
 * O chamador deve manter um polling de fallback — este hook não garante entrega.
 */
export function useRealtime(onEvent: Handler, opts: { staff?: boolean; enabled?: boolean } = {}) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const { staff = false, enabled = true } = opts;

  useEffect(() => {
    if (!enabled) return;
    const socket: Socket = io(API_URL, {
      withCredentials: true,
      auth: staff ? (cb) => cb({ token: getSession()?.accessToken }) : undefined,
      reconnectionDelayMax: 5000,
    });
    socket.on('event', (e: DomainEventEnvelope) => handler.current(e));
    return () => {
      socket.disconnect();
    };
  }, [staff, enabled]);
}

/** Reconecta o socket quando o cookie de participante muda (entrou/saiu da sessão). */
export function useRealtimeKeyed(key: string, onEvent: Handler, opts: { enabled?: boolean } = {}) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const { enabled = true } = opts;
  useEffect(() => {
    if (!enabled) return;
    const socket = io(API_URL, { withCredentials: true, reconnectionDelayMax: 5000 });
    socket.on('event', (e: DomainEventEnvelope) => handler.current(e));
    return () => {
      socket.disconnect();
    };
  }, [key, enabled]);
}
