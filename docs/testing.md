# Automated test architecture

WaferCAD browser tests are split by intent. New coverage should go into the narrowest suite that owns the behavior instead of extending one long stateful scenario.

## Test tiers

| Tier | Entry point | Purpose | Expected style |
| --- | --- | --- | --- |
| Fast UI smoke | `npm run test:ui:smoke` | Product gate for boot, workstation readiness, one real process operation, persistence, and project export | Small, independent, fail fast |
| History regression | `npm run test:ui:history` | History restore, Variants, bookmarks, historical Step editing/replay, rollback, and History export | Independent History scenarios; fault injection allowed |
| Full UI regression | `npm run test:ui:regression` | Remaining broad interaction and persistence coverage while it is decomposed | Comprehensive; may use fault injection and internal contracts |
| Bundled examples | `npm run test:ui:examples` | Literature/example structural contracts and restore behavior | Example-specific geometry/render invariants |
| Product/visual review | `npm run test:ui:product` | Responsive layouts, interaction quality, renderer diagnostics, and review screenshots | Multiple viewports; deterministic renderer inputs in CI |

The full UI regression suite is intentionally a preservation layer. It started as the former 2993-line smoke scenario; History coverage has now been migrated into its own suite. Its coverage should move into focused suites incrementally; do not add new unrelated scenarios to it by default.

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

## Next decomposition targets

The preserved full regression should be split in this order because these areas already have clear boundaries:

1. Autosave, migration, recovery, and multi-tab ownership.
2. Rough / Conformal / Implant / Electrical process contracts.
3. Mask drawing, ROI, Section, and export interactions.
4. Resilience cases such as missing Three.js and unavailable WebGL.

After those migrations, `scripts/ui-regression.mjs` can be removed and the focused suites can run independently with clearer failure ownership.

## Visual regression policy

`product-regression.mjs` already produces review screenshots and checks layout geometry across multiple viewports. Those artifacts are useful for product review but are not equivalent to pixel-baseline assertions.

Before introducing screenshot baselines, keep deterministic rendering inputs (including the pinned Three.js source in CI), select a small set of stable views, and define explicit tolerances for raster/WebGL differences. Structural geometry invariants remain the primary gate for scientific correctness.
