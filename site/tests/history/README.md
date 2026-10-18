# History Node test ownership

These five tests cover Step/operation labels, off-thread HEAD validation, History mutation rollback, replay remapping, and multi-failure Recovery restoration. Their scientific and transaction assertions are retained verbatim; only relative import paths changed during relocation.

`npm test` keeps its existing `site/tests/*.test.mjs` discovery glob. The root `site/tests/history-suite.test.mjs` checks the required five owners and imports **every** `*.test.mjs` in this directory. Additional history tests automatically join the standard Node gate.

Direct specialized invocations (`ui-v2-p1-cpu.yml`, M3D path ownership, and the native-v2 scientific owners) reference these canonical paths explicitly. `snapshots.test.mjs`, project-wide History/Recipe integration, persistence and browser tests are intentionally not relocated: they have broader, separately owned invariants.

See [test architecture](../../../docs/testing.md) and [transaction integrity](../../../docs/science/PROCESS_HISTORY_TRANSACTION_INTEGRITY_2026-10-13.md).
