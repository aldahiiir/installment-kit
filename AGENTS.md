# Working on installment-kit

- Pure functions only: no I/O, no clock, no database, no framework, no runtime dependencies. Callers persist the results.
- Money is an integer in the smallest unit the caller picks. Reject anything else instead of rounding silently.
- Tie each change to a reproducible billing case (a plan that no longer adds up, a payment that overwrote the first one). Keep example data fictional.
- Add a test that fails for the broken behavior, then make it pass. Run `npm test` and `npm run typecheck`.
- School-specific rules (a fixed fee, a fixed number of installments) are parameters, never constants in `src/`.
- Describe only behavior the tests demonstrate. State limits plainly.
