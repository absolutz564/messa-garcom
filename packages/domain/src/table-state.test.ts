import { describe, expect, it } from 'vitest';
import { deriveTableState } from './table-state';

describe('deriveTableState', () => {
  it('disabled wins over everything', () => {
    expect(
      deriveTableState({ isActive: false, liveSessionStatus: 'active', hasPendingOpenRequest: true }),
    ).toBe('disabled');
  });
  it('active session ⇒ occupied', () => {
    expect(
      deriveTableState({ isActive: true, liveSessionStatus: 'active', hasPendingOpenRequest: true }),
    ).toBe('occupied');
  });
  it('inactive session ⇒ inactive even with pending request', () => {
    expect(
      deriveTableState({ isActive: true, liveSessionStatus: 'inactive', hasPendingOpenRequest: true }),
    ).toBe('inactive');
  });
  it('pending request without session ⇒ requested', () => {
    expect(
      deriveTableState({ isActive: true, liveSessionStatus: null, hasPendingOpenRequest: true }),
    ).toBe('requested');
  });
  it('nothing ⇒ free', () => {
    expect(
      deriveTableState({ isActive: true, liveSessionStatus: null, hasPendingOpenRequest: false }),
    ).toBe('free');
  });
});
