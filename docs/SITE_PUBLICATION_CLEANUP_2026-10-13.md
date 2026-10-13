# Site publication and dead-code cleanup (2026-10-13)

## Scope and baseline

- Repository: `Xiaolong-6/WaferCAD`.
- Audited `main`: `1e34da5d23f8fd9db8db13b249a7e4816cdb7ced`.
- Implementation: `chore/site-audit-cleanup-20261013`, draft PR #193.
- The original site tree contained 347 tracked files totaling 48,311,837 bytes.

## Confirmed changes

1. Pages stages a filtered copy in `build/pages/`; mock UI code, M1.5
   prototypes, historical review pages and Node tests stay in Git.
2. JS version stamping and the deployed commit metadata modify only the staged
   copy. Welcome previews and real scientific assets retain their original paths.
3. Integration and Phase B acceptance use canonical `site/app.html`.
   The byte-identical `site/app-v2-workstation.html` alias was removed.
4. The preview workflow restores the last verified production root from its
   staged version. It retains its isolated `/preview/` development content.
5. `site/app-legacy.html`, scientific workers, all current example projects
   and `site/guide/` remain intact.

## Publication inventory

A Git-tree inclusion audit of the first implementation revision found:

| Metric | Before | Staged |
| --- | ---: | ---: |
| Files | 347 | 205 |
| Bytes | 48,311,837 | 27,183,349 |

This represents 21,128,488 bytes (43.73%) fewer files in the public artifact.
It does not establish an equivalent reduction in page startup downloads.

## Validation and ownership

- `site/tests/pages-artifact.test.mjs` checks the publish/omit policy, copy
  behavior, source immutability and output-path guard.
- `site/tests/ci-workflow-architecture.test.mjs` checks release and preview
  deployment workflow contracts.
- PR #193 owns `npm run check`, Stage C/M4, Main/Mask, D1 and Phase B gates.
- The initial PR attempt found two Prettier reflows and one obsolete relative
  link in archived handoff evidence; they were corrected in the same branch.
- No local full checkout or browser was available in the connector environment.
  A passing PR CI is required before merge; do not treat audit calculations as
  execution evidence.

## Deferred work

Do not delete Legacy by file-name inference. Welcome still embeds its preview
protocol, and recovery / multi-tab tests exercise both interfaces. Removing it
requires a separate preview migration, legacy compatibility plan and browser
acceptance. Function-level dead-export removal likewise needs call-graph
analysis with explicit runtime, worker, dynamic import and test roots.
