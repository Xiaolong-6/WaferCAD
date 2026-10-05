# Automated test architecture

WaferCAD browser tests are split by intent. New coverage should go into the narrowest suite that owns the behavior instead of extending one long stateful scenario.

## Test tiers

| Tier                        | Entry point                   | Purpose                                                                                                                  | Expected style                                                   |
| --------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Fast UI smoke               | `npm run test:ui:smoke`       | Product gate for boot, workstation readiness, one real process operation, persistence, and project export                | Small, independent, fail fast                                    |
| History regression          | `npm run test:ui:history`     | History restore, Variants, bookmarks, historical Step editing/replay, rollback, and History export                       | Independent History scenarios; fault injection allowed           |
| Persistence regression      | `npm run test:ui:persistence` | Autosave, migration, recovery checkpoints, Welcome staged handoff, refresh restore, and multi-tab ownership/takeover     | Storage/profile scenarios isolated from process geometry         |
| Process geometry regression | `npm run test:ui:process`     | Etch/Rough, Implant, Electrical Region, Conformal Deposit/Extend, GLB morphology, and Section geometry contracts         | Scientific/process geometry coverage with real UI + export paths |
| Workstation regression      | `npm run test:ui:workstation` | Welcome/boot gating, navigation semantics, example-family loading, default tool shell, and basic workstation integration | Shell-level integration; no process-specific geometry            |
| Interaction regression      | `npm run test:ui:interaction` | Slice/ROI, Mask Draw and shape editors, mask ROI/alignment, exports, maximize/restore, and 3D controls                   | Pointer/keyboard interaction and view-control contracts          |
| Resilience regression       | `npm run test:ui:resilience`  | Missing Three.js CDN and unavailable WebGL behavior                                                                      | Explicit degraded-mode diagnostics while 2D remains usable       |
| Bundled examples            | `npm run test:ui:examples`    | Literature/example structural contracts and restore behavior                                                             | Example-specific geometry/render invariants                      |
| Product/visual review       | `npm run test:ui:product`     | Responsive layouts, interaction quality, renderer diagnostics, and review screenshots                                    | Multiple viewports; deterministic renderer inputs in CI          |

The former 2993-line UI smoke has been fully decomposed into focused browser suites. New coverage should go directly into the suite that owns the behavior; there is no generic catch-all UI regression file anymore.

### Common local groups

Use the smallest group that matches the change:

- `npm run test:ui:fast`: smoke + workstation + resilience.
- `npm run test:ui:state`: History + persistence/recovery/multi-tab.
- `npm run test:ui:geometry`: process geometry + interaction.
- `npm run test:ui:review`: bundled examples + product layout/renderer review.
- `npm run test:ui:all`: every non-baseline browser suite.
- `npm run test:ui:visual`: opt-in approved visual baselines only.

These commands assume WaferCAD is already served at `WAFERCAD_URL` or the default `http://127.0.0.1:4173`.

### Deterministic browser dependencies

Playwright `1.55.1` and Three `0.179.1` are pinned devDependencies in `package-lock.json`. Install them with `npm ci`, then install Chromium with `npx playwright install chromium` (`--with-deps` on Linux). Serve `site/` locally and set `WAFERCAD_THREE_DIR` to the project's `node_modules/three` directory before running browser tests:

```powershell
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
npm run test:ui:all
```

On POSIX shells, use `WAFERCAD_THREE_DIR="$PWD/node_modules/three" npm run test:ui:all`.

The Browser regression workflow exposes the same local Three package through `WAFERCAD_THREE_DIR`. Normal browser contexts intercept the matching jsDelivr URLs and serve those modules from the local package, so CDN availability is not part of ordinary regression reliability. The dedicated CDN resilience case intentionally bypasses this route; the WebGL-unavailable case still uses pinned Three so it isolates WebGL failure.

GitHub Actions caches both npm downloads and the Playwright Chromium browser directory. The suite remains a single job so those setup costs are paid once; focused test steps still preserve failure ownership without duplicating browser installation.

### CI cost controls

- Quality skips documentation-only pull requests and uses the npm cache.
- Browser regression is path-filtered to application, examples, browser-test, dependency, and workflow changes.
- Browser regression runs `npm test` immediately after `npm ci`; Chromium installation happens only after that fast Node gate passes.
- KLayout compatibility keeps its dedicated parser/UI workflow and caches Chromium for the browser import sweep.
- The heavyweight browser suites remain sequential in one job; splitting them into parallel jobs would duplicate Chromium/setup cost and consume more Actions minutes.

## Node test ownership

The former `site/selftest.mjs` monolith has been removed. `npm test` now runs only `node --test site/tests/*.test.mjs`.

The migrated self-test contracts are owned by focused files:

- `section-surface-rendering.test.mjs`: Section Z collapse, rough LOD/budgets, renderer sidewall ownership, and deterministic rough/pyramid profiles.
- `rough-process.test.mjs`: core model defaults plus rough etch, inherited rough interfaces, pyramid etch, and rough-following films.
- `isotropic-release.test.mjs`: canonical suspended-cavity topology, air-gap preservation, implant fragmentation, and directional-etch compatibility after release.
- `conformal-process.test.mjs`: direct vs conformal growth, mask-edge clipping, sidewall growth, buried-layer rejection, layer mutation, and core vector topology checks.
- `gds-smoke.test.mjs`: demo layout and physical-unit GDS parsing smoke.
- `project-annotation.test.mjs`: project schema validation plus Implant/Electrical Region model/view contracts.

The migration preserves all 203 assertions that were present in the former 1380-line self-test.

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

### Example structure gates

Bundled examples have a fast, browser-independent structure gate in `site/tests/example-structure.test.mjs`, so ordinary `npm test` catches fixture regressions before Browser regression starts. The current contracts include:

- Implant/Electrical annotation steps must not repartition material layers or material regions.
- The fully textured tandem final model must propagate the deterministic front/back pyramid profiles through every material layer.

The browser-level `example-regression.mjs` then verifies runtime loading, History restore, Section seam behavior, GLB morphology ownership/export, and renderer readiness.

## Current ownership

- `workstation-regression.mjs`: Welcome, boot gating, navigation, example-family loading, and core workstation shell.
- `history-regression.mjs`: History tree, Variants, bookmarks, historical Step restore/edit/replay, rollback, and History export.
- `persistence-regression.mjs`: autosave, migration, recovery checkpoints, staged Welcome handoff, refresh restore, and multi-tab ownership.
- `process-geometry-regression.mjs`: Etch/Rough, Implant, Electrical Region, Conformal Deposit/Extend, exported morphology, and scientific Section geometry checks.
- `interaction-regression.mjs`: Slice/ROI, Mask Draw, mask ROI/alignment, view exports, maximize/restore, and 3D inspection controls.
- `resilience-regression.mjs`: missing Three.js and unavailable WebGL degraded-mode behavior.
- `example-regression.mjs`: bundled literature/example structural contracts.
- `product-layout-regression.mjs`: responsive product/layout review across wide, medium, phone, and breakpoint-edge viewports.
- `renderer-product-regression.mjs`: wide-screen renderer acceptance for isotropic release, rough/LOD ownership, conformal interfaces, and implant visibility.
- `product-regression.mjs`: thin shared orchestrator used by the two product entry points.

## Visual regression policy

`product-regression.mjs` already produces review screenshots and checks layout geometry across multiple viewports. Those artifacts are useful for product review but are not equivalent to pixel-baseline assertions.

Before introducing screenshot baselines, keep deterministic rendering inputs (including the pinned Three.js source in CI), select a small set of stable views, and define explicit tolerances for raster/WebGL differences. Structural geometry invariants remain the primary gate for scientific correctness.

## Product regression split

The former 1600+ line product regression has now been decomposed into:

- `test-helpers/product.mjs`: browser/context setup, function-panel navigation, captures, and generic layout probes.
- `test-helpers/product-layout.mjs`: responsive shell, Slice/Section, compact-process, popover, and ROI checks.
- `test-helpers/product-scientific.mjs`: project load/export plus Section material/seam probes.
- `product-layout-cases.mjs`: responsive viewport, sample-layout, benchmark-view, ROI, and breakpoint orchestration.
- `renderer-product-cases.mjs`: renderer-heavy isotropic, rough/LOD, conformal-interface, and Implant acceptance.
- `product-regression.mjs`: thin orchestrator that selects `layout`, `renderer`, or `all`.

The browser workflow keeps these product scopes as separate steps while sharing one job, avoiding duplicate Chromium installation and unnecessary GitHub Actions minutes. npm and Playwright browser assets are cached to reduce setup time.

By default, layout review writes to `test-results/product-review/`, and renderer review writes to `test-results/product-review/renderer/`. Each directory contains its own `index.html` gallery and `report.json`; the renderer scope preserves the layout artifacts.

## Visual baseline staging

A dependency-free visual comparator is available in `test-helpers/visual.mjs`. It decodes PNGs in Chromium, compares per-channel differences, enforces a maximum changed-pixel ratio, and writes actual/expected/diff artifacts on failure.

The first opt-in cases are deliberately 2D/UI-heavy:

- wide Project tool panel;
- wide Main panel;
- phone Process tool panel;
- phone Main panel;
- Photodetector literature example Section panel.

Commands:

- `npm run update:ui:visual` generates/replaces the baseline PNGs under `tests/visual-baselines/`.
- `npm run test:ui:visual` compares against the selected baseline directory. The default `tests/visual-baselines/` has no approved cross-platform set yet.

For unapproved local review captures, set `WAFERCAD_VISUAL_BASELINE_DIR` to an ignored artifact directory such as `test-results/visual-review-windows` before running `npm run update:ui:visual`. These captures are candidates for human review, not approved Linux baselines.

The five Windows captures accepted on 2026-10-05 are committed separately under `tests/visual-baselines/windows-chromium/`. With the local server running, select them explicitly:

```powershell
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
$env:WAFERCAD_VISUAL_BASELINE_DIR = 'tests/visual-baselines/windows-chromium'
npm run test:ui:visual
```

See [local validation](VALIDATION_2026-10-05.md) for the tested revision, environment, runtime results and human acceptance. Windows references must not be used as evidence of Linux raster stability. Generate a separate Linux set and review it before enabling a Linux pixel gate.

Visual baselines are intentionally **not** part of `test:ui:all` or the GitHub Actions gate yet. Generate them in a controlled Chromium/Linux environment, review the PNGs, commit only approved baselines, then enable the gate in a separate change. WebGL screenshots remain review artifacts until cross-run raster stability is characterized.

The later [rendering stabilization](STABILIZATION_2026-10-05.md) intentionally changes the Photodetector Section profile/gradient. Its original Windows reference is retained pending human acceptance; the other four references pass unchanged. Product renderer tests independently measure Si/ALD/Implant registration, local depth gradients and the thin sidewall floor in a Detail inset, so an old-reference pixel mismatch must not be hidden by weakening those structural checks.
