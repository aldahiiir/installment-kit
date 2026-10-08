import { assertAmount, KitError } from './errors.js';

export type ItemId = string | number;

export interface DiscountRules {
  /** Percent applied to every discountable item without its own rule. */
  global?: number | null;
  /** Percent for one specific item. It wins over `global`, even when it is lower. */
  byItem?: ReadonlyMap<ItemId, number>;
}

export interface PricedItem {
  id: ItemId;
  price: number;
  /** false = never discounted (a fixed admin fee). Default true. */
  discountable?: boolean;
}

export interface PricedResult {
  id: ItemId;
  original: number;
  price: number;
  percent: number;
}

function assertPercent(percent: number): void {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new KitError('INVALID_PERCENT', `percent must be between 0 and 100, got ${percent}`);
  }
}

export function percentFor(id: ItemId, rules?: DiscountRules): number {
  const percent = rules?.byItem?.get(id) ?? rules?.global ?? 0;
  assertPercent(percent);
  return percent;
}

/** Rounds to the nearest whole unit. */
export function applyDiscount(amount: number, percent: number): number {
  assertAmount(amount);
  assertPercent(percent);
  return Math.round(amount * (1 - percent / 100));
}

export function priceItems(items: readonly PricedItem[], rules?: DiscountRules): PricedResult[] {
  return items.map((item) => {
    const percent = item.discountable === false ? 0 : percentFor(item.id, rules);
    return { id: item.id, original: item.price, price: applyDiscount(item.price, percent), percent };
  });
}
