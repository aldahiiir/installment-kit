import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyDiscount, applyPayment, findConflicts, hasConflict, isValidCurp, KitError, normalizeCurp,
  percentFor, priceItems, rebalance, refundable, splitAmount, statusFor, wouldConflict,
} from '../src/index.js';

test('splitAmount: remainder goes to the last installment and the parts always add up', () => {
  assert.deepEqual(splitAmount(1000, 3), [333, 333, 334]);
  assert.deepEqual(splitAmount(900, 3), [300, 300, 300]);
  assert.deepEqual(splitAmount(100, 1), [100]);
  for (const total of [0, 1, 2, 999, 1400, 12345]) {
    assert.equal(splitAmount(total, 3).reduce((a, b) => a + b, 0), total);
  }
});

test('splitAmount rejects non-integer money and bad part counts', () => {
  assert.throws(() => splitAmount(10.5, 3), (e) => e instanceof KitError && e.code === 'INVALID_AMOUNT');
  assert.throws(() => splitAmount(-1, 3), (e) => e instanceof KitError && e.code === 'INVALID_AMOUNT');
  assert.throws(() => splitAmount(100, 0), (e) => e instanceof KitError && e.code === 'INVALID_PARTS');
});

test('rebalance: a scholarship granted after the plan was made re-splits the open installments', () => {
  const plan = [{ amount: 500, status: 'PENDING' }, { amount: 500, status: 'PENDING' }, { amount: 500, status: 'PENDING' }];
  assert.deepEqual(rebalance(plan, 1050), { action: 'updated', from: 1500, to: 1050, amounts: [350, 350, 350] });
  assert.deepEqual(rebalance(plan, 1500), { action: 'unchanged', total: 1500 });
});

test('rebalance: never touches a plan with paid installments', () => {
  const plan = [{ amount: 500, status: 'PAID' }, { amount: 500, status: 'PENDING' }, { amount: 500, status: 'PENDING' }];
  assert.deepEqual(rebalance(plan, 1050), { action: 'blocked', reason: 'PAID_INSTALLMENTS', total: 1500, price: 1050 });
});

test('rebalance: cancelled installments are ignored', () => {
  const plan = [{ amount: 700, status: 'CANCELLED' }, { amount: 500, status: 'PENDING' }, { amount: 500, status: 'PENDING' }];
  assert.deepEqual(rebalance(plan, 800), { action: 'updated', from: 1000, to: 800, amounts: [400, 400] });
  assert.deepEqual(rebalance([{ amount: 5, status: 'CANCELLED' }], 100), { action: 'none' });
});

test('statusFor derives the status from price and paid', () => {
  assert.equal(statusFor(1400, 0), 'RESERVED');
  assert.equal(statusFor(1400, 700), 'PARTIALLY_PAID');
  assert.equal(statusFor(1400, 1400), 'PAID');
  assert.equal(statusFor(0, 0), 'PAID');
});

test('applyPayment accumulates: paying the rest of a part-paid item keeps the first payment', () => {
  const first = applyPayment({ price: 1400, paid: 0 }, 700);
  assert.deepEqual([first.paid, first.balance, first.status], [700, 700, 'PARTIALLY_PAID']);
  const rest = applyPayment(first, 700);
  assert.deepEqual([rest.paid, rest.balance, rest.status, rest.overpaid], [1400, 0, 'PAID', 0]);
  assert.equal(applyPayment(first).paid, 1400);
});

test('applyPayment reports overpayment instead of hiding it', () => {
  const s = applyPayment({ price: 1000, paid: 900 }, 300);
  assert.deepEqual([s.paid, s.balance, s.overpaid, s.status], [1200, 0, 200, 'PAID']);
  assert.throws(() => applyPayment({ price: 1000, paid: 0 }, -5), (e) => e instanceof KitError);
});

test('refundable returns only what was collected above what is still owed', () => {
  assert.equal(refundable(1400, 700), 700);
  assert.equal(refundable(700, 1400), 0);
});

test('discounts: the item rule wins over the global one, even when it is lower', () => {
  const rules = { global: 50, byItem: new Map([['robotics', 20]]) };
  assert.equal(percentFor('robotics', rules), 20);
  assert.equal(percentFor('chess', rules), 50);
  assert.equal(percentFor('chess'), 0);
});

test('priceItems skips non-discountable items and rounds to a whole unit', () => {
  const out = priceItems(
    [{ id: 'fee', price: 700, discountable: false }, { id: 'chess', price: 1001 }],
    { global: 33 },
  );
  assert.deepEqual(out.map((i) => [i.id, i.price, i.percent]), [['fee', 700, 0], ['chess', 671, 33]]);
  assert.equal(applyDiscount(1000, 100), 0);
  assert.throws(() => applyDiscount(1000, 101), (e) => e instanceof KitError && e.code === 'INVALID_PERCENT');
});

const mon = (start: string, end: string) => ({ sessions: [{ day: 'MON', start, end }] });

test('schedule: overlap clashes, back-to-back and different days do not', () => {
  assert.equal(hasConflict(mon('15:00', '16:30'), mon('16:00', '17:00')), true);
  assert.equal(hasConflict(mon('15:00', '16:00'), mon('16:00', '17:00')), false);
  assert.equal(hasConflict(mon('15:00', '16:00'), { sessions: [{ day: 'TUE', start: '15:00', end: '16:00' }] }), false);
  assert.equal(hasConflict(mon('15:00:00', '16:00:00'), mon('15:30', '16:30')), true);
});

test('schedule: findConflicts and wouldConflict', () => {
  const a = mon('15:00', '16:00');
  const b = mon('15:30', '16:30');
  const c = mon('17:00', '18:00');
  assert.deepEqual(findConflicts([a, b, c]), [{ a, b }]);
  assert.equal(wouldConflict(c, [a, b]), false);
  assert.equal(wouldConflict(b, [a]), true);
  assert.throws(() => hasConflict(mon('3pm', '4pm'), a), (e) => e instanceof KitError && e.code === 'INVALID_TIME');
});

test('curp: normalizes case and spaces, checks shape only', () => {
  assert.equal(normalizeCurp(' abcd 010101 hdfrrr09 '), 'ABCD010101HDFRRR09');
  assert.equal(isValidCurp('abcd010101hdfrrr09'), true);
  assert.equal(isValidCurp('ABCD010101XDFRRR09'), false);
  assert.equal(isValidCurp('short'), false);
});
