import { describe, expect, it } from 'vitest';
import { isBlockedWhileStaffOffline, isStaffOnline } from './staff-presence';
import { RULES } from './constants';

describe('isBlockedWhileStaffOffline (BR-19)', () => {
  it('bloqueia o que depende de aprovação humana com prazo', () => {
    expect(isBlockedWhileStaffOffline('open_session')).toBe(true);
    expect(isBlockedWhileStaffOffline('resume_session')).toBe(true);
  });

  it('não bloqueia o que só atrasa', () => {
    expect(isBlockedWhileStaffOffline('order')).toBe(false);
    expect(isBlockedWhileStaffOffline('bill')).toBe(false);
    expect(isBlockedWhileStaffOffline('join')).toBe(false);
  });
});

describe('isStaffOnline (BR-19)', () => {
  const now = new Date('2026-08-30T20:00:00Z');

  it('qualquer socket ⇒ online', () => {
    expect(isStaffOnline(now, 1, null)).toBe(true);
  });

  it('nenhum socket e nunca visto ⇒ offline', () => {
    expect(isStaffOnline(now, 0, null)).toBe(false);
  });

  it('dentro da carência ⇒ ainda online (reload de página não é queda)', () => {
    const dropped = new Date(now.getTime() - RULES.STAFF_PRESENCE_GRACE_MS + 1000);
    expect(isStaffOnline(now, 0, dropped)).toBe(true);
  });

  it('carência exata ⇒ offline', () => {
    const dropped = new Date(now.getTime() - RULES.STAFF_PRESENCE_GRACE_MS);
    expect(isStaffOnline(now, 0, dropped)).toBe(false);
  });
});
