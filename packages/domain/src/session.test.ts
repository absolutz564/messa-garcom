import { describe, expect, it } from 'vitest';
import {
  assertSessionTransition,
  decideCloseSession,
  decideOrderPlacement,
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
