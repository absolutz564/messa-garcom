import { RULES } from './constants';
import { DomainError, type ActorKind, type SessionStatus } from './types';

/** BR-08: sessão deve virar inactive? */
export function isSessionInactive(now: Date, lastActivityAt: Date): boolean {
  return now.getTime() - lastActivityAt.getTime() >= RULES.SESSION_INACTIVITY_MS;
}

/**
 * BR-08 — status que vale **agora**, derivado na leitura.
 *
 * A coluna `status` só vira `inactive` quando o job de fundo passa. Quem decide
 * o destino de um pedido não pode depender disso: entre a hora de inatividade
 * completar e o job rodar existe uma janela em que a sessão está velha no
 * relógio e `active` no banco — e um pedido de cliente entraria direto, sem a
 * confirmação do operador que BR-09 exige. A janela é de segundos com o job de
 * 60 s, mas passa a ser longa quando ele deixa de rodar com o sistema ocioso.
 *
 * Mesma escolha de `evaluateTenantBilling` (PDR-017): estado derivado na
 * leitura, nunca salvo, para que a decisão e a tela não possam discordar. O job
 * continua existindo — ele é quem grava a mudança e publica o evento para o
 * painel —, mas virou escrituração, não a fonte da verdade.
 */
export function effectiveSessionStatus(persisted: SessionStatus, now: Date, lastActivityAt: Date): SessionStatus {
  if (persisted === 'active' && isSessionInactive(now, lastActivityAt)) return 'inactive';
  return persisted;
}

export type OrderPlacementDecision =
  | { kind: 'submit'; reactivate: boolean }
  | { kind: 'await_confirmation' };

/**
 * BR-09: o que acontece com um pedido conforme status da sessão e ator.
 * - closed ⇒ erro.
 * - active ⇒ submit.
 * - inactive + staff ⇒ submit e reativa (PDR-002).
 * - inactive + customer ⇒ aguarda confirmação do operador.
 */
export function decideOrderPlacement(sessionStatus: SessionStatus, actor: ActorKind): OrderPlacementDecision {
  if (sessionStatus === 'closed') throw new DomainError('session_closed', 'Sessão encerrada');
  if (sessionStatus === 'active') return { kind: 'submit', reactivate: false };
  if (actor === 'staff') return { kind: 'submit', reactivate: true };
  return { kind: 'await_confirmation' };
}

export type CloseSessionDecision =
  | { kind: 'close'; reason: 'manual' }
  | { kind: 'close'; reason: 'forced_with_pending'; cancelOrderIds: string[] }
  | { kind: 'blocked'; pendingOrderIds: string[] };

/** BR-13 / PDR-004: encerrar com pedidos não lançados exige `force`. */
export function decideCloseSession(unacknowledgedOrderIds: string[], force: boolean): CloseSessionDecision {
  if (unacknowledgedOrderIds.length === 0) return { kind: 'close', reason: 'manual' };
  if (!force) return { kind: 'blocked', pendingOrderIds: unacknowledgedOrderIds };
  return { kind: 'close', reason: 'forced_with_pending', cancelOrderIds: unacknowledgedOrderIds };
}

/** Transições permitidas (state-machines.md). */
const TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  active: ['inactive', 'closed'],
  inactive: ['active', 'closed'],
  closed: [],
};

export function assertSessionTransition(from: SessionStatus, to: SessionStatus): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new DomainError('invalid_transition', `Sessão não pode ir de ${from} para ${to}`);
  }
}
