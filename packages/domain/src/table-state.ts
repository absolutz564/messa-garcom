import type { SessionStatus, TableState } from './types';

export interface TableStateInput {
  isActive: boolean;
  liveSessionStatus: Exclude<SessionStatus, 'closed'> | null;
  hasPendingOpenRequest: boolean;
}

/** Estado da mesa é DERIVADO (docs/02-domain/state-machines.md). Nunca persistido. */
export function deriveTableState(input: TableStateInput): TableState {
  if (!input.isActive) return 'disabled';
  if (input.liveSessionStatus === 'active') return 'occupied';
  if (input.liveSessionStatus === 'inactive') return 'inactive';
  if (input.hasPendingOpenRequest) return 'requested';
  return 'free';
}
