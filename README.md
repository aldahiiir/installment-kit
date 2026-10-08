# installment-kit

Pure functions for billing enrollments in installments. Zero dependencies, no database, no framework: you pass numbers in and persist what comes out.

> **Status:** 0.x. The API can still change between minor versions. MIT licensed.

## What problem it solves

Anything that charges in parts (schools, gyms, clubs, courses, events, clinics) ends up rewriting the same rules, and gets the same bugs:

- A price changes after the plan was made (a scholarship granted late) and the installments no longer add up.
- Paying the rest of a part-paid item overwrites the first payment.
- The "paid / part-paid / reserved" status is computed in five places and drifts.
- A fee that must never be discounted gets a discount.
- Someone signs up for two activities at the same hour.

## Install and use

```bash
npm install installment-kit
```

Node 18+, ESM and CommonJS, TypeScript types included. Money is an **integer in the smallest unit you choose** (cents, or whole pesos). Anything else throws a `KitError`.

```ts
import { splitAmount, rebalance, applyPayment, priceItems, refundable, wouldConflict, isValidCurp } from 'installment-kit';
```

Each module also has its own entry point: `installment-kit/installments`, `/ledger`, `/discounts`, `/schedule`, `/curp`.

## Use cases

### Split a price into installments
```ts
splitAmount(1000, 3); // [333, 333, 334]  remainder goes to the last one
```

### The price changed after the plan existed
```ts
const plan = [{ amount: 500, status: 'PENDING' }, { amount: 500, status: 'PENDING' }, { amount: 500, status: 'PENDING' }];
rebalance(plan, 1050);
// { action: 'updated', from: 1500, to: 1050, amounts: [350, 350, 350] }
```
If any installment is already `PAID`, it returns `{ action: 'blocked', reason: 'PAID_INSTALLMENTS' }` and changes nothing. What to do with money already collected is a human decision. The function writes nothing: you save `amounts` yourself.

### Take a payment and get the status
```ts
const first = applyPayment({ price: 1400, paid: 0 }, 700);  // PARTIALLY_PAID, balance 700
const rest  = applyPayment(first);                          // no amount = settle the balance -> PAID
```
Payments always accumulate. Overpayment is reported in `overpaid`, never swallowed.

### Discounts, with a fee that never gets one
```ts
const rules = { global: 50, byItem: new Map([['robotics', 20]]) };
priceItems([{ id: 'fee', price: 700, discountable: false }, { id: 'robotics', price: 2000 }], rules);
// fee stays 700; robotics 20% (the item rule wins over the global 50%) -> 1600
```

### Refund after removing something
```ts
refundable(1400, 700); // 700: collected 1400, only 700 is still owed
```

### Two activities at the same time
```ts
wouldConflict(candidate, selected); // true when day matches and times overlap; back-to-back is fine
```

### Mexican CURP (optional)
```ts
isValidCurp(' abcd010101hdfrrr09 '); // true. Shape only: the check digit is not verified
```

## What it does not do

- It does not move money, talk to a payment gateway, store anything, or send receipts.
- No interest, loans, taxes or currencies. For money formatting use `Intl.NumberFormat`; for arbitrary currency math use a library such as `dinero.js`.
- No due dates yet. Installment dates are yours to compute.
- The amount of installments is up to you; nothing here assumes 3.

## Develop

```bash
npm install
npm test
npm run typecheck
```
