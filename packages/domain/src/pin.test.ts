import { describe, expect, it } from 'vitest';
import { decidePinAttempt, generatePin } from './pin';
import { RULES } from './constants';

const now = new Date('2026-08-29T21:00:00Z');
const base = {
  now,
  sessionStatus: 'active' as const,
  pinLockedUntil: null,
  failedAttempts: 0,
  pinMatches: true,
  deviceFailedInWindow: 0,
};

describe('generatePin', () => {
  it('4 digits, allows leading zero', () => {
    expect(generatePin(() => 0)).toBe('0000');
    let i = 0;
    expect(generatePin(() => i++ % 10)).toBe('0123');
  });
});

describe('decidePinAttempt (BR-07)', () => {
  it('closed session never accepts, even with the right PIN', () => {
    expect(decidePinAttempt({ ...base, sessionStatus: 'closed' })).toEqual({ kind: 'reject', code: 'session_closed' });
  });
  it('inactive session accepts (PIN still valid)', () => {
    expect(decidePinAttempt({ ...base, sessionStatus: 'inactive' })).toEqual({ kind: 'accept' });
  });
  it('locked session rejects with lockUntil', () => {
    const until = new Date(now.getTime() + 60_000);
    expect(decidePinAttempt({ ...base, pinLockedUntil: until })).toEqual({ kind: 'reject', code: 'pin_locked', lockUntil: until });
  });
  it('device rate limit', () => {
    expect(decidePinAttempt({ ...base, deviceFailedInWindow: RULES.PIN_DEVICE_MAX_ATTEMPTS })).toMatchObject({ code: 'device_rate_limited' });
  });
  it('10th failure locks the session for 15 min', () => {
    const d = decidePinAttempt({ ...base, pinMatches: false, failedAttempts: RULES.PIN_MAX_FAILED_ATTEMPTS - 1 });
    expect(d).toEqual({
      kind: 'reject',
      code: 'pin_invalid',
      newFailedAttempts: RULES.PIN_MAX_FAILED_ATTEMPTS,
      lockUntil: new Date(now.getTime() + RULES.PIN_LOCK_DURATION_MS),
    });
  });
  it('failure increments counter without lock', () => {
    expect(decidePinAttempt({ ...base, pinMatches: false })).toEqual({ kind: 'reject', code: 'pin_invalid', newFailedAttempts: 1 });
  });
});
