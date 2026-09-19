import { describe, expect, it } from 'vitest';
import {
  assertSessionTransition,
  decideCloseSession,
  decideOrderPlacement,
  effectiveSessionStatus,
  isSessionInactive,
} from './session';
import { RULES } from './constants';

describe('isSessionInactive (BR-08)', () => {
  const now = new Date('2026-08-29T22:00:00Z');
  it('exactly 1h ⇒ inactive', () => {
    expect(isSessionInactive(now, new Date(now.getTime() - RULES.SESSION_INACTIVITY_MS))).toBe(true);
  });
  it('59m59s ⇒ still active', () => {
    expect(isSessionInactive(now, new Date(now.getTime() - RULES.SESSION_INACTIVITY_MS + 1000))).toBe(false);
  });
});

describe('decideOrderPlacement (BR-09)', () => {
  it('active ⇒ submit', () => {
    expect(decideOrderPlacement('active', 'customer')).toEqual({ kind: 'submit', reactivate: false });
  });
  it('inactive + customer ⇒ await confirmation', () => {
    expect(decideOrderPlacement('inactive', 'customer')).toEqual({ kind: 'await_confirmation' });
  });
  it('inactive + staff ⇒ submit and reactivate (PDR-002)', () => {
    expect(decideOrderPlacement('inactive', 'staff')).toEqual({ kind: 'submit', reactivate: true });
  });
  it('closed ⇒ error', () => {
    expect(() => decideOrderPlacement('closed', 'staff')).toThrow(/encerrada/);
  });
});

describe('decideCloseSession (BR-13 / PDR-004)', () => {
  it('no pending ⇒ manual close', () => {
    expect(decideCloseSession([], false)).toEqual({ kind: 'close', reason: 'manual' });
  });
  it('pending without force ⇒ blocked with list', () => {
    expect(decideCloseSession(['o1', 'o2'], false)).toEqual({ kind: 'blocked', pendingOrderIds: ['o1', 'o2'] });
  });
  it('pending with force ⇒ close and cancel', () => {
    expect(decideCloseSession(['o1'], true)).toEqual({
      kind: 'close',
      reason: 'forced_with_pending',
      cancelOrderIds: ['o1'],
    });
  });
});

describe('assertSessionTransition', () => {
  it('closed is terminal', () => {
    expect(() => assertSessionTransition('closed', 'active')).toThrow();
  });
  it('inactive → active allowed', () => {
    expect(() => assertSessionTransition('inactive', 'active')).not.toThrow();
  });
});

describe('effectiveSessionStatus (BR-08)', () => {
  const now = new Date('2026-08-29T22:00:00Z');
  const velha = new Date(now.getTime() - RULES.SESSION_INACTIVITY_MS);
  const recente = new Date(now.getTime() - 60_000);

  it('sessão parada há 1h vale como inativa mesmo antes de o job gravar', () => {
    // É esta a janela que deixava um pedido de cliente entrar sem a confirmação
    // do operador — curta com o job de 60 s, longa quando ele não roda.
    expect(effectiveSessionStatus('active', now, velha)).toBe('inactive');
  });

  it('sessão com movimento recente continua ativa', () => {
    expect(effectiveSessionStatus('active', now, recente)).toBe('active');
  });

  it('não ressuscita o que já está inativo nem encerrado', () => {
    expect(effectiveSessionStatus('inactive', now, recente)).toBe('inactive');
    expect(effectiveSessionStatus('closed', now, recente)).toBe('closed');
    expect(effectiveSessionStatus('closed', now, velha)).toBe('closed');
  });

  it('o pedido do cliente numa sessão velha passa a exigir confirmação', () => {
    expect(decideOrderPlacement(effectiveSessionStatus('active', now, velha), 'customer')).toEqual({ kind: 'await_confirmation' });
    // E o garçom continua reativando direto (PDR-002).
    expect(decideOrderPlacement(effectiveSessionStatus('active', now, velha), 'staff')).toEqual({ kind: 'submit', reactivate: true });
  });
});
