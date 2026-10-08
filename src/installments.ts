import { assertAmount, KitError } from './errors.js';

export interface Installment {
  amount: number;
  /** Only 'PAID' and 'CANCELLED' have meaning here; any other value counts as an open installment. */
  status: string;
}

export type RebalanceResult =
  | { action: 'none' }
  | { action: 'unchanged'; total: number }
  | { action: 'updated'; from: number; to: number; amounts: number[] }
  | { action: 'blocked'; reason: 'PAID_INSTALLMENTS'; total: number; price: number };

/** Split a price into `parts` equal installments: floor(total / parts) each, the remainder goes to the last one. */
export function splitAmount(total: number, parts: number): number[] {
  assertAmount(total, 'total');
  if (!Number.isInteger(parts) || parts < 1) throw new KitError('INVALID_PARTS', `parts must be an integer >= 1, got ${parts}`);
  const base = Math.floor(total / parts);
  return [...Array(parts - 1).fill(base), total - base * (parts - 1)];
}

/**
 * Re-split an existing plan after the price changed (a scholarship granted later, a correction).
 * Never touches a plan with paid installments: what to do with money already collected is a human decision.
 * Returns the new amounts for the open (non-cancelled) installments, in order. It writes nothing.
 */
export function rebalance(plan: readonly Installment[], newPrice: number): RebalanceResult {
  assertAmount(newPrice, 'newPrice');
  const active = plan.filter((i) => i.status !== 'CANCELLED');
  if (active.length === 0) return { action: 'none' };

  const total = active.reduce((sum, i) => sum + i.amount, 0);
  if (total === newPrice) return { action: 'unchanged', total };
  if (active.some((i) => i.status === 'PAID')) {
    return { action: 'blocked', reason: 'PAID_INSTALLMENTS', total, price: newPrice };
  }
  return { action: 'updated', from: total, to: newPrice, amounts: splitAmount(newPrice, active.length) };
}
