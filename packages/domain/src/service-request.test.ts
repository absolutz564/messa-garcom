import { describe, expect, it } from 'vitest';
import { decideOpenRequest, shouldBlockDevice } from './service-request';
import { RULES } from './constants';

const now = new Date('2026-08-29T20:35:00Z');
const base = {
  now,
  tableState: 'free' as const,
  tenantBlocked: false,
  activeBlockUntil: null,
  existingPendingRequestId: null,
  tableRequestsInWindow: 0,
};

describe('decideOpenRequest (BR-03)', () => {
  it('creates with 10 min TTL on a free table', () => {
    const d = decideOpenRequest(base);
    expect(d.kind).toBe('create');
    if (d.kind === 'create') expect(d.expiresAt.getTime() - now.getTime()).toBe(RULES.REQUEST_TTL_MS);
  });
  it('blocked device is rejected before anything else and never notifies', () => {
    const until = new Date(now.getTime() + 1000);
    const d = decideOpenRequest({ ...base, activeBlockUntil: until, tableState: 'free' });
    expect(d).toEqual({ kind: 'reject', code: 'device_blocked', blockedUntil: until });
  });
  it('expired block is ignored', () => {
    const d = decideOpenRequest({ ...base, activeBlockUntil: new Date(now.getTime() - 1) });
    expect(d.kind).toBe('create');
  });
  it('reuses existing pending request (idempotent)', () => {
    const d = decideOpenRequest({ ...base, existingPendingRequestId: 'r1' });
    expect(d).toEqual({ kind: 'reuse_pending', requestId: 'r1' });
  });
  it('table rate limit applies regardless of device', () => {
    const d = decideOpenRequest({ ...base, tableRequestsInWindow: RULES.TABLE_REQUEST_LIMIT });
    expect(d).toEqual({ kind: 'reject', code: 'table_rate_limited' });
  });
  it('occupied table ⇒ session_active (use PIN)', () => {
    expect(decideOpenRequest({ ...base, tableState: 'occupied' })).toEqual({
      kind: 'reject',
      code: 'session_active',
    });
  });
  it('inactive table allows request (PDR-003)', () => {
    expect(decideOpenRequest({ ...base, tableState: 'inactive' }).kind).toBe('create');
  });
  it('disabled table / blocked tenant', () => {
    expect(decideOpenRequest({ ...base, tableState: 'disabled' })).toMatchObject({ code: 'table_not_available' });
    expect(decideOpenRequest({ ...base, tenantBlocked: true })).toMatchObject({ code: 'tenant_blocked' });
  });
});

describe('shouldBlockDevice (BR-04) — exemplo do PRD', () => {
  it('20:31 rejected, 20:34 rejected ⇒ blocked at 20:34 for 30 min', () => {
    const t1 = new Date('2026-08-29T20:31:00Z');
    const t2 = new Date('2026-08-29T20:34:00Z');
    const r = shouldBlockDevice(t2, [t1, t2]);
    expect(r).toEqual({ block: true, until: new Date(t2.getTime() + RULES.BLOCK_DURATION_MS) });
  });
  it('single rejection does not block', () => {
    expect(shouldBlockDevice(now, [now])).toEqual({ block: false });
  });
  it('old rejections outside 15 min window do not count', () => {
    const old = new Date(now.getTime() - RULES.BLOCK_REJECTION_WINDOW_MS - 1);
    expect(shouldBlockDevice(now, [old, now])).toEqual({ block: false });
  });
});
