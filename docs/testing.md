# Automated test architecture

WaferCAD browser tests are split by intent. New coverage should go into the narrowest suite that owns the behavior instead of extending one long stateful scenario.

## Test tiers

| Tier | Entry point | Purpose | Expected style |
| --- | --- | --- | --- |
| Fast UI smoke | `npm run test:ui:smoke` | Product gate for boot, workstation readiness, one real process operation, persistence, and project export | Small, independent, fail fast |
| History regression | `npm run test:ui:history` | History restore, Variants, bookmarks, historical Step editing/replay, rollback, and History export | Independent History scenarios; fault injection allowed |
| Persistence regression | `npm run test:ui:persistence` | Autosave, migration, recovery checkpoints, Welcome staged handoff, refresh restore, and multi-tab ownership/takeover | Storage/profile scenarios isolated from process geometry |
| Process geometry regression | `npm run test:ui:process` | Etch/Rough, Implant, Electrical Region, Conformal Deposit/Extend, GLB morphology, and Section geometry contracts | Scientific/process geometry coverage with real UI + export paths |
| Workstation regression | `npm run test:ui:workstation` | Welcome/boot gating, navigation semantics, example-family loading, default tool shell, and basic workstation integration | Shell-level integration; no process-specific geometry |
| Interaction regression | `npm run test:ui:interaction` | Slice/ROI, Mask Draw and shape editors, mask ROI/alignment, exports, maximize/restore, and 3D controls | Pointer/keyboard interaction and view-control contracts |
| Resilience regression | `npm run test:ui:resilience` | Missing Three.js CDN and unavailable WebGL behavior | Explicit degraded-mode diagnostics while 2D remains usable |
| Bundled examples | `npm run test:ui:examples` | Literature/example structural contracts and restore behavior | Example-specific geometry/render invariants |
| Product/visual review | `npm run test:ui:product` | Responsive layouts, interaction quality, renderer diagnostics, and review screenshots | Multiple viewports; deterministic renderer inputs in CI |

The former 2993-line UI smoke has been fully decomposed into focused browser suites. New coverage should go directly into the suite that owns the behavior; there is no generic catch-all UI regression file anymore.

## Fast smoke contract

The fast smoke should stay deliberately small. It currently proves that:

1. Welcome boots without exposing the editor shell.
2. A normal start reaches the workstation and wide-screen Overview.
3. The real 3D renderer settles without a render error.
4. Core tool navigation is bound and Project is available.
5. One representative Deposit operation completes through the real UI.
6. Autosave/reload preserves the result and a requested project export contains it.

A failure here should stop the expensive browser regression steps early.

## Rules for new tests

- Prefer a fresh browser context/page for a logically independent scenario.
- Test user interaction with real Playwright pointer/keyboard actions when clickability or hit testing is part of the contract.
- Programmatic DOM activation is acceptable for state-machine or fault-injection tests, but the corresponding user interaction should have its own pointer-level test.
- Prefer stable state attributes such as `data-render-state` and model revisions over exact status-copy strings when wording is not the behavior under test.
- Avoid fixed sleeps when an observable completion condition exists.
- Capture `pageerror` and unexpected native dialogs in every browser suite.
- Keep screenshots used only for human product review separate from future pixel-baseline gates.
- Example tests should assert structural invariants, not only that a canvas is non-empty.

## Current ownership

- `workstation-regression.mjs`: Welcome, boot gating, navigation, example-family loading, and core workstation shell.
- `history-regression.mjs`: History tree, Variants, bookmarks, historical Step restore/edit/replay, rollback, and History export.
- `persistence-regression.mjs`: autosave, migration, recovery checkpoints, staged Welcome handoff, refresh restore, and multi-tab ownership.
- `process-geometry-regression.mjs`: Etch/Rough, Implant, Electrical Region, Conformal Deposit/Extend, exported morphology, and scientific Section geometry checks.
- `interaction-regression.mjs`: Slice/ROI, Mask Draw, mask ROI/alignment, view exports, maximize/restore, and 3D inspection controls.
- `resilience-regression.mjs`: missing Three.js and unavailable WebGL degraded-mode behavior.
- `example-regression.mjs`: bundled literature/example structural contracts.
- `product-regression.mjs`: responsive product review, layout geometry, renderer diagnostics, and review screenshots.

## Visual regression policy

`product-regression.mjs` already produces review screenshots and checks layout geometry across multiple viewports. Those artifacts are useful for product review but are not equivalent to pixel-baseline assertions.

Before introducing screenshot baselines, keep deterministic rendering inputs (including the pinned Three.js source in CI), select a small set of stable views, and define explicit tolerances for raster/WebGL differences. Structural geometry invariants remain the primary gate for scientific correctness.

## Next optimization target

`product-regression.mjs` is now the largest remaining browser test file. It should not be split by line count alone because its shared helpers feed both responsive-layout checks and wide-screen renderer acceptance cases.

The next safe refactor is:

1. Extract reusable product-review helpers (browser/context setup, capture, layout checks, project loading) into a dedicated helper module.
2. Keep responsive/workstation visual contracts in a product-layout suite.
3. Move wide-screen renderer/roughness/LOD/implant acceptance into a renderer-product suite.
4. Keep the generated review report/index as an orchestration layer over both outputs.

Do this only after the current focused-suite split is validated; avoid duplicating the expensive renderer cases across multiple entry points.
