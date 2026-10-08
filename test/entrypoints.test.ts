import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import * as esm from '../src/index.js';

const require = createRequire(import.meta.url);

test('the CommonJS build exposes the same API as the ESM build', () => {
  const cjs = require('../../dist-cjs/src/index.js');
  assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
  assert.deepEqual(cjs.splitAmount(1000, 3), esm.splitAmount(1000, 3));
  assert.equal(cjs.statusFor(100, 50), esm.statusFor(100, 50));
  assert.throws(() => cjs.splitAmount(1.5, 3), (e: any) => e.code === 'INVALID_AMOUNT' && e.name === 'KitError');
});

test('every subpath export resolves in both module systems', async () => {
  for (const sub of ['installments', 'ledger', 'discounts', 'schedule', 'curp']) {
    assert.ok(Object.keys(await import(`../../dist/src/${sub}.js`)).length > 0, sub);
    assert.ok(Object.keys(require(`../../dist-cjs/src/${sub}.js`)).length > 0, sub);
  }
});
