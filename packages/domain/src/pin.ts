import { RULES } from './constants';

/** Fonte de aleatoriedade injetável (CSPRNG na aplicação, determinística em testes). */
export type RandomInt = (maxExclusive: number) => number;

/** BR-07: PIN de 4 dígitos, qualquer combinação (restringir reduziria entropia). */
export function generatePin(randomInt: RandomInt): string {
  let pin = '';
  for (let i = 0; i < RULES.PIN_LENGTH; i++) pin += String(randomInt(10));
  return pin;
}

export interface PinAttemptInput {
  now: Date;
  sessionStatus: 'active' | 'inactive' | 'closed';
  pinLockedUntil: Date | null;
  failedAttempts: number;
  /** Comparação feita pela aplicação (timing-safe). */
  pinMatches: boolean;
  /** Tentativas falhas deste dispositivo na janela (rate limit por dispositivo). */
  deviceFailedInWindow: number;
}

export type PinAttemptDecision =
  | { kind: 'accept' }
  | { kind: 'reject'; code: 'session_closed' | 'pin_locked' | 'device_rate_limited' | 'pin_invalid'; lockUntil?: Date; newFailedAttempts?: number };

/** BR-07 — avaliação de uma tentativa de entrada com PIN. */
export function decidePinAttempt(input: PinAttemptInput): PinAttemptDecision {
  if (input.sessionStatus === 'closed') return { kind: 'reject', code: 'session_closed' };
  if (input.pinLockedUntil && input.pinLockedUntil > input.now) {
    return { kind: 'reject', code: 'pin_locked', lockUntil: input.pinLockedUntil };
  }
  if (input.deviceFailedInWindow >= RULES.PIN_DEVICE_MAX_ATTEMPTS) {
    return { kind: 'reject', code: 'device_rate_limited' };
  }
  if (input.pinMatches) return { kind: 'accept' };
  const newFailedAttempts = input.failedAttempts + 1;
  if (newFailedAttempts >= RULES.PIN_MAX_FAILED_ATTEMPTS) {
    return {
      kind: 'reject',
      code: 'pin_invalid',
      newFailedAttempts,
      lockUntil: new Date(input.now.getTime() + RULES.PIN_LOCK_DURATION_MS),
    };
  }
  return { kind: 'reject', code: 'pin_invalid', newFailedAttempts };
}
