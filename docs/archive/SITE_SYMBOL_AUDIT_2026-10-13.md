# Site symbol-level reachability audit (2026-10-13)

## Purpose

PR #202 extends the file-level audit from PR #197 with a review-only
ESLint AST scan of local bindings and statically imported named exports.
The scan covers JavaScript source under `site/` and test helpers under `scripts/`.

Run `node scripts/audit-site-symbols.mjs` to reproduce the candidate report.

## Initial evidence and safe changes

The first tested revision scanned 376 JavaScript modules, reported 29
potentially unused local bindings, and found seven named exports with
no recognized static consumers. The generated M2 mock data file exceeded
the 512 KiB parser limit and was excluded.

The first cleanup removes six unused import bindings:

- `site/app.js`: `surfaceSegment`, `surfaceZ`, `transformMulti`.
- `site/controllers/project-controller.js`: `migrateProjectFile`,
  `validateProjectFile`.
- `site/controllers/section-collapse-controller.js`:
  `translateSectionCollapse`.

Subsequent cleanup also retired the uncalled `refreshRecoveryOptions` and
`invMaskPoint` helpers, plus the unused `activeScopeCells` and
`setActiveCell` destructured Mask Browser bindings in `site/app.js`.
The next low-risk cleanup removes six additional unused local bindings
without changing their owning APIs or application behavior:

- GDS: the unused record-header `dataType` local; GDS record parsing
  and `REC.DATATYPE` handling remain unchanged.
- Example regression: the unused `migrateProjectFile` import.
- Developer M2 previews: `field` and `select` from mock views;
  `icon` and `stepper` from mock workspace.

A further M2-only cleanup in the same PR removes six unused component
bindings from `ui-v2/mock-workspace.js`: `emptyState`, `busy`,
`panelHeader`, `divider`, `toolbar`, and `row`. This leaves the
actual DOM helpers, event handlers and scientific renderers untouched.

The underlying controller methods and exported Kernel functions remain
intact. The audit report is an observation, not permission to delete code.

## Exported API review boundary

First-pass export candidates: `prepareModelBoundaryIndexes`,
`simplifyDisplayPolyline`, `formatMainPosition`, `clearWorkspaceState`,
`MAX_SNAPSHOT_BRANCHES`, `MAX_PROCESS_HISTORY_NODES`, and
`MAIN_SNAPSHOT_BRANCH_ID`.

These exports stay unchanged pending review of dynamic imports, external
APIs, global registrations, workers, re-export chains, and test fixtures.
Namespace and literal dynamic-import consumers are handled conservatively.

## Acceptance

`site/tests/site-symbol-reachability.test.mjs` verifies static imports,
dynamic import conservatism, real-repository parsing, and retired
bindings. Browser acceptance remains a separate release gate.
