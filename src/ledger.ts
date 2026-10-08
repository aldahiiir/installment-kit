import { assertAmount } from './errors.js';

export type PaidStatus = 'RESERVED' | 'PARTIALLY_PAID' | 'PAID';

export interface Account {
  price: number;
  paid: number;
}

export interface Settlement extends Account {
  balance: number;
  status: PaidStatus;
  /** Amount received above the price. Not refunded automatically. */
  overpaid: number;
}

/** Nothing owed counts as PAID, so a free item (price 0) is PAID. */
export function statusFor(price: number, paid: number): PaidStatus {
  assertAmount(price, 'price');
  assertAmount(paid, 'paid');
  if (paid >= price) return 'PAID';
  return paid > 0 ? 'PARTIALLY_PAID' : 'RESERVED';
}

/**
 * Add a payment ON TOP of what was already paid. Omit `amount` to settle the full balance.
 * Accumulating (never overwriting) is the point: paying the rest of a part-paid item must keep the first payment.
 */
export function applyPayment(account: Account, amount?: number): Settlement {
  const received = amount ?? Math.max(0, account.price - account.paid);
  assertAmount(received, 'amount');
  const paid = account.paid + received;
  return {
    price: account.price,
    paid,
    balance: Math.max(0, account.price - paid),
    status: statusFor(account.price, paid),
    overpaid: Math.max(0, paid - account.price),
  };
}

/** How much to give back when what is owed drops below what was collected (an item removed, a discount granted late). */
export function refundable(paid: number, dueAfter: number): number {
  assertAmount(paid, 'paid');
  assertAmount(dueAfter, 'dueAfter');
  return Math.max(0, paid - dueAfter);
}
