import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Cookies assinados do cliente anônimo (ADR-004): `base64url(json).base64url(hmac)`.
 * Independente do framework para ser reutilizado no handshake do WebSocket.
 */
export class CookieCodec {
  constructor(private readonly secret: string) {}

  encode(payload: Record<string, unknown>): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  decode<T extends Record<string, unknown>>(value: string | undefined): T | null {
    if (!value) return null;
    const dot = value.lastIndexOf('.');
    if (dot <= 0) return null;
    const body = value.slice(0, dot);
    const sig = value.slice(dot + 1);
    const expected = this.sign(body);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}

export const DEVICE_COOKIE = 'messa_device';
export const PARTICIPANT_COOKIE = 'messa_participant';

export interface DeviceCookie extends Record<string, unknown> {
  d: string; // deviceId
  t: string; // tenantId
}
export interface ParticipantCookie extends Record<string, unknown> {
  p: string; // participantId
  s: string; // sessionId
  t: string; // tenantId
  d: string; // deviceId
}

/** Parser mínimo de `Cookie:` para o handshake do socket. */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
