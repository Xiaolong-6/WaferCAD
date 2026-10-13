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

A Git-tree inclusion audit of the first implementation revision found
347 tracked files (48,311,837 bytes) in `site/` before filtering and
205 files (27,183,349 bytes) in the staged production tree.

This represents 21,128,488 bytes (43.73%) fewer files in the public artifact.
It does not establish an equivalent reduction in page startup downloads.

## Validation and ownership

- `site/tests/pages-artifact.test.mjs` checks the publish/omit policy, copy
  behavior, source immutability, output-path guard, and real staged entrypoint assets.
- `site/tests/ci-workflow-architecture.test.mjs` checks release and preview
  deployment workflow contracts.
- PR #193 owns `npm run check`, Stage C/M4, Main/Mask, D1 and Phase B gates.
- The initial PR attempt found two Prettier reflows and one obsolete relative
  link in archived handoff evidence; they were corrected in the same branch.
- No local full checkout or browser was available in the connector environment.
  A passing PR CI is required before merge; do not treat audit calculations as
  execution evidence.


## Developer asset ownership (follow-up to PR #197)

The reachability report classifies 11 JS/CSS modules as developer-only.
All are retained in Git for repository-level acceptance:

- **M2 design and parity baseline** (`site/app-v2.html`,
  `check-m2-live-parity.mjs`): `ui-v2/history-tree.js`,
  `ui-v2/live-preview.js`, `ui-v2/mock-data.js`,
  `ui-v2/mock-domain-panels.js`, `ui-v2/mock-views.js`,
  `ui-v2/mock-workspace.js`, and `ui-v2/shell-preview.js`.
  Keep until M2 parity acceptance is retired.
- **M2.5 shell regression** (`site/ui-v2/app.html`,
  `check-m2-shell.mjs`): `ui-v2/production-workspace.js`.
  Keep until the shell contract is retired.
- **D1 experimental view gates** (`site/app-v2-real.html`,
  `ui-v2-d1.yml`): `ui-v2/real-section-controls.js`,
  `ui-v2/real-view-bridge.js`, and `ui-v2/real-view-bridge.css`.
  Keep while D1 acceptance exercises the original scientific hosts.

The Pages follow-up also excludes `ui-v2/history-tree.js`, which was
omitted from the first denylist. CI now compares the developer-only
reachability report against the Pages publishing policy to catch
similar omissions. Static file reachability cannot prove per-symbol
liveness and does not authorize deleting developer test assets.

## Deferred work

Do not delete Legacy by file-name inference. Welcome still embeds its preview
protocol, and recovery / multi-tab tests exercise both interfaces. Removing it
requires a separate preview migration, legacy compatibility plan and browser
acceptance. Function-level dead-export removal likewise needs call-graph
analysis with explicit runtime, worker, dynamic import and test roots.
