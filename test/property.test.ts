import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDiscount, applyPayment, hasConflict, isValidCurp, normalizeCurp, priceItems, rebalance, refundable, splitAmount, statusFor,
} from '../src/index.js';

// Seeded PRNG (mulberry32): a failure reproduces with the same seed.
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const RUNS = 5000;

test('splitAmount: sums to total, no part differs by more than parts-1 from another, last is the largest', () => {
  const r = rng(1);
  for (let i = 0; i < RUNS; i++) {
    const total = int(r, 0, 1_000_000);
    const parts = int(r, 1, 24);
    const out = splitAmount(total, parts);
    assert.equal(out.length, parts, `seed run ${i}`);
    assert.equal(out.reduce((a, b) => a + b, 0), total, `total=${total} parts=${parts}`);
    assert.ok(out.every((x) => Number.isInteger(x) && x >= 0));
    assert.ok(Math.max(...out) - Math.min(...out) <= parts - 1);
    assert.equal(out[parts - 1], Math.max(...out));
  }
});

test('rebalance: result always sums to the new price and is idempotent', () => {
  const r = rng(2);
  for (let i = 0; i < RUNS; i++) {
    const n = int(r, 1, 6);
    const plan = Array.from({ length: n }, () => ({ amount: int(r, 0, 5000), status: 'PENDING' }));
    const price = int(r, 0, 20000);
    const res = rebalance(plan, price);
    if (res.action === 'updated') {
      assert.equal(res.amounts.reduce((a, b) => a + b, 0), price);
      assert.equal(res.amounts.length, n);
      assert.equal(rebalance(res.amounts.map((amount) => ({ amount, status: 'PENDING' })), price).action, 'unchanged');
    } else {
      assert.equal(res.action, 'unchanged');
      assert.equal(plan.reduce((a, p) => a + p.amount, 0), price);
    }
  }
});

test('rebalance: any paid installment blocks the change, whatever the price', () => {
  const r = rng(3);
  for (let i = 0; i < RUNS; i++) {
    const plan = Array.from({ length: int(r, 2, 5) }, () => ({ amount: int(r, 1, 900), status: r() < 0.4 ? 'PAID' : 'PENDING' }));
    const total = plan.reduce((a, p) => a + p.amount, 0);
    const price = int(r, 0, 5000);
    const res = rebalance(plan, price);
    if (plan.some((p) => p.status === 'PAID') && price !== total) assert.equal(res.action, 'blocked');
  }
});

test('ledger: paying in any split and any order lands on the same paid, balance and status', () => {
  const r = rng(4);
  for (let i = 0; i < RUNS; i++) {
    const price = int(r, 0, 10000);
    const cuts = Array.from({ length: int(r, 1, 6) }, () => int(r, 0, price));
    const amounts = splitAmount(cuts.reduce((a, b) => a + b, 0), cuts.length);
    let acc: ReturnType<typeof applyPayment> = applyPayment({ price, paid: 0 }, 0);
    let prev = 0;
    for (const a of amounts) {
      const s = applyPayment(acc, a);
      assert.ok(s.paid >= prev, 'paid never goes down');
      assert.equal(s.balance, Math.max(0, price - s.paid));
      assert.equal(s.overpaid, Math.max(0, s.paid - price));
      assert.equal(s.status, statusFor(price, s.paid));
      assert.ok(s.balance === 0 || s.overpaid === 0, 'balance and overpaid are never both positive');
      prev = s.paid;
      acc = s;
    }
    const sum = amounts.reduce((a, b) => a + b, 0);
    assert.equal(acc.paid, sum);
    assert.equal(applyPayment({ price, paid: 0 }, sum).status, acc.status);
  }
});

test('ledger: settling the balance always ends PAID with no overpayment', () => {
  const r = rng(5);
  for (let i = 0; i < RUNS; i++) {
    const price = int(r, 0, 10000);
    const s = applyPayment({ price, paid: int(r, 0, price) });
    assert.equal(s.status, 'PAID');
    assert.equal(s.overpaid, 0);
    assert.equal(s.paid, Math.max(price, s.paid));
  }
});

test('refundable never exceeds what was paid and is zero when nothing is overpaid', () => {
  const r = rng(6);
  for (let i = 0; i < RUNS; i++) {
    const paid = int(r, 0, 10000);
    const due = int(r, 0, 10000);
    const back = refundable(paid, due);
    assert.ok(back >= 0 && back <= paid);
    assert.equal(paid - back >= Math.min(paid, due), true);
    if (paid <= due) assert.equal(back, 0);
  }
});

test('discounts: never above the original, 0% is identity, 100% is free, monotonic in percent', () => {
  const r = rng(7);
  for (let i = 0; i < RUNS; i++) {
    const amount = int(r, 0, 100000);
    const p = int(r, 0, 100);
    const q = int(r, p, 100);
    assert.ok(applyDiscount(amount, p) <= amount);
    assert.equal(applyDiscount(amount, 0), amount);
    assert.equal(applyDiscount(amount, 100), 0);
    assert.ok(applyDiscount(amount, q) <= applyDiscount(amount, p));
  }
});

test('priceItems: a non-discountable item is never touched, whatever the rules', () => {
  const r = rng(8);
  for (let i = 0; i < RUNS; i++) {
    const rules = { global: int(r, 0, 100), byItem: new Map([['a', int(r, 0, 100)]]) };
    const out = priceItems([{ id: 'a', price: int(r, 0, 5000), discountable: false }, { id: 'b', price: int(r, 0, 5000) }], rules);
    assert.equal(out[0].price, out[0].original);
    assert.equal(out[0].percent, 0);
    assert.ok(out[1].price <= out[1].original);
  }
});

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

test('schedule: matches a minute-by-minute brute force and is symmetric', () => {
  const r = rng(9);
  const days = ['MON', 'TUE', 'WED'];
  const make = () => ({
    sessions: Array.from({ length: int(r, 1, 3) }, () => {
      const start = int(r, 7 * 60, 19 * 60);
      return { day: days[int(r, 0, 2)], start: hhmm(start), end: hhmm(start + int(r, 30, 180)) };
    }),
  });
  const minutes = (w: ReturnType<typeof make>) => new Set(w.sessions.flatMap((s) => {
    const [sh, sm] = s.start.split(':').map(Number);
    const [eh, em] = s.end.split(':').map(Number);
    return Array.from({ length: eh * 60 + em - (sh * 60 + sm) }, (_, k) => `${s.day}@${sh * 60 + sm + k}`);
  }));
  for (let i = 0; i < RUNS; i++) {
    const a = make();
    const b = make();
    const ma = minutes(a);
    const brute = [...minutes(b)].some((m) => ma.has(m));
    assert.equal(hasConflict(a, b), brute, JSON.stringify({ a, b }));
    assert.equal(hasConflict(a, b), hasConflict(b, a));
    assert.equal(hasConflict(a, a), true);
  }
});

test('curp: normalization is idempotent and validation ignores case and spacing', () => {
  const r = rng(10);
  const pool = 'ABCDHMXYZ0123456789 \t';
  for (let i = 0; i < RUNS; i++) {
    const s = Array.from({ length: int(r, 0, 30) }, () => pool[int(r, 0, pool.length - 1)]).join('');
    assert.equal(normalizeCurp(normalizeCurp(s)), normalizeCurp(s));
    assert.equal(isValidCurp(s), isValidCurp(s.toLowerCase()));
  }
  assert.equal(isValidCurp('ABCD010101HDFRRR09'), true);
});
