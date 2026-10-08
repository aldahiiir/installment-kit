export type KitErrorCode = 'INVALID_AMOUNT' | 'INVALID_PARTS' | 'INVALID_PERCENT' | 'INVALID_TIME';

export class KitError extends Error {
  constructor(readonly code: KitErrorCode, message: string) {
    super(message);
    this.name = 'KitError';
  }
}

/** Money is always an integer in the smallest unit you choose (cents, or whole pesos). */
export function assertAmount(value: number, label = 'amount'): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new KitError('INVALID_AMOUNT', `${label} must be a non-negative integer, got ${value}`);
  }
}
