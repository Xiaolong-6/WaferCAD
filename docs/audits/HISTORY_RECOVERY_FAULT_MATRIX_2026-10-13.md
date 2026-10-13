# History/Recovery fault matrix — 2026-10-13

Baseline: `main@2949dfc` (includes PR #199).

## New contract tests

- Controller Edit/Insert checkpoints reject declined, quota, and transaction-error writers before state mutation.
- Both rejected and thrown second-step Replay failures restore all Layer IDs, Variant HEADs, and recovery-state metadata.
- Replay interaction begin/end ownership is balanced on every failed path.

## Verification limits

The new cases use deterministic controller injections. They do not emulate a real browser crash or prove durable IndexedDB atomicity. Real `test:ui:history`, `test:ui:persistence`, and reload/interruption acceptance remain necessary. Recipe Run All retains successful Step commits when a later Step fails; Recipe-wide rollback is not asserted.

Run locally: `node --test site/tests/history-recovery-fault-matrix.test.mjs`.
