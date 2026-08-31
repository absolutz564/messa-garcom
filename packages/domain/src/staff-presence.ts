import { RULES } from './constants';

/** Ações do cliente cuja permissão depende de haver alguém da equipe conectado (BR-19). */
export type CustomerAction = 'open_session' | 'resume_session' | 'order' | 'join' | 'bill';

/**
 * BR-19 — a equipe offline só bloqueia o que morre sem um humano: `open_session` e
 * `resume_session` viram solicitação pendente que expira em 10 min (BR-03) e, no caso do
 * resume, arrasta o pedido para `cancelled` (BR-10). Pedido em sessão ativa e pedido de
 * conta apenas atrasam — o painel os encontra na reconexão, então bloquear destruiria valor.
 */
export function isBlockedWhileStaffOffline(action: CustomerAction): boolean {
  return action === 'open_session' || action === 'resume_session';
}

/**
 * BR-19 — a equipe está online enquanto há socket de staff; sem nenhum, só depois da carência
 * (um F5 no painel derruba e reconecta o socket em ~1 s e não pode virar "restaurante offline").
 * `lastSeenAt` é o instante em que o último socket caiu.
 */
export function isStaffOnline(now: Date, socketCount: number, lastSeenAt: Date | null): boolean {
  if (socketCount > 0) return true;
  if (!lastSeenAt) return false;
  return now.getTime() - lastSeenAt.getTime() < RULES.STAFF_PRESENCE_GRACE_MS;
}
