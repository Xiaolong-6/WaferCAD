# Automated test architecture

WaferCAD browser tests are split by intent. New coverage should go into the narrowest suite that owns the behavior instead of extending one long stateful scenario.

### Native-v2 source-retirement release ownership

The executable Legacy editor is frozen at the `legacy-frozen` tag.
Existing `test:ui:interaction`, `test:ui:examples`, `test:ui:process`,
`test:ui:io`, `test:ui:array`, `test:ui:product:layout` and Renderer
package commands now run actual native-v2 scientific owners through
`scripts/v2/check-source-sunset-release-owners.mjs`. Each owner runs its
mapped scientific Node tests plus real production Chromium checks and fails
immediately on either class of error. Release jobs are split into isolated
workstation/interaction/examples/product/renderer and Process/I/O/Array owners,
to preserve hard correctness gates without a combined 15-minute watchdog.

The old DOM-specific assertions remain auditable at the frozen tag; native
science coverage and unresolved historical case-by-case differences are
documented in [Legacy source sunset](operations/LEGACY_SOURCE_SUNSET.md) and Issue #289.
Do not interpret a native replacement as identical old-UI gesture behavior,
and do not skip physics, Recovery, worker rollback or morphology contracts.

## Current scientific and UI contracts

[Workstation](ui-v2/WORKSTATION_CONTRACT.md),
[Renderer/Section](renderer/RENDERER_CONTRACT.md) and
[Continuous release](science/CONTINUOUS_RELEASE_CONTRACT.md)
describe feature invariants. This document owns which tests
validate them; [CI routing](CI.md) alone owns when they run.
An offline native 3D visualization cannot replace normal-Origin
Worker, History or Recovery checks.

## Repository ownership and layout

- `site/tests/*.test.mjs`: flat Node/science ownership and the retained `npm test` discovery glob. Documentation/Wiki/Process Guide checks now live under `site/tests/documentation/*.test.mjs` and are **all imported by** `site/tests/documentation-suite.test.mjs` through the original glob. Five native History tests live under `site/tests/history/`, and four Workspace/Project Recovery tests under `site/tests/recovery/`. Their root suite entrypoints preserve automatic discovery; specialized CI/owner references use canonical nested paths. Adding a documentation test is automatically discovered; other domains must have an explicit verified runner before any relocation. Silent coverage loss is forbidden.
- `scripts/*-regression.mjs`, `scripts/v2/` and `scripts/test-helpers/`: real-browser acceptance entry points and reusable helpers. `package.json` scripts and `.github/workflows/` specify their invocation; move only with a reference inventory and verified execution.
- `tests/fixtures/`: byte-exact or calibrated input/expected data, including compressed Legacy and native Fig3 projects. Protect scientific provenance, hashes and reversible decode procedures.
- `tests/visual-baselines/`: approved platform-specific reference pixels; do not delete/regenerate to hide regressions. Keep routine CI screenshots in artifacts.
- `site/examples/`: released Welcome projects, previews and thumbnails. `examples/projects/`: authoring candidates, reconstruction source inputs, project provenance and non-published research fixtures. A byte-identical source/release copy is not deletable until its scripts, workflow paths and reconstruction ownership are proven independent.

**Structure migration gate:** inventory import paths, npm/globs, workflow `paths` filters and documentation links; move one owner at a time; run owning Node/CI selectors and scientifically relevant fixtures. No broad restructure for cosmetic directory symmetry. Do not store transient CI reports under tracked fixture directories.

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

The resilience owner `scripts/resilience-regression.mjs` now starts the production
**v2** Workstation. It independently simulates a missing Three.js CDN and a
WebGL context allocation failure, requires a visible 3D unavailability
diagnostic, then proves that Main, Mask, Section and a real Process Worker
operation still function. It does not route through the Legacy test adapter,
and replaces the equivalent old-UI degraded renderer scenarios.

The focused real-worker fault acceptance in `scripts/process-transaction-ui-regression.mjs` checks rejection and Abort against actual Model/History exports; it is invoked from Recipe safety CI. Node controller fault injection additionally checks worker cancellation/late results and failed History rollback without pretending to be real IndexedDB or browser reload.

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

### Published Legacy URL policy

The executable Legacy editor and its former `app-legacy.html`, `app.js`, and
`workstation.css` sources are absent from the current `site/` checkout.
Their exact historical source and DOM tests are retained at `legacy-frozen`.
The staged Pages artifact generates `app-legacy.html` as a same-origin
redirect to the v2 `app.html`, preserving query and fragment.
`site/tests/pages-artifact.test.mjs` and
`scripts/smoke-pages-artifact.mjs` enforce that public boundary and
verify that production Workers still boot. Old-project-format and Recovery
compatibility remain mandatory on the current application.

### M3D Welcome and 3D Border v2 ownership

`scripts/m3d-welcome-regression.mjs` runs against the production v2
Workstation, verifies the Welcome thumbnail and full project handoff,
36 real History Steps, 27 stage bookmarks, an initialized 3D view and
reversible Border selection without model mutation. The targeted
`m3d-example-integration.yml` gate runs on relevant `main` PR changes.
Historical Legacy M3D tests can be reproduced at `legacy-frozen`; the
current branch uses native-v2 owners for corresponding scientific
process/geometry/export contracts. Do not treat a changed UI harness as
permission to skip those invariants.

### MAGIC-1000 Section/3D preview

`scripts/magic1000-visual-acceptance.mjs` now opens the production v2
read-only Example preview and verifies Section raster content and initialized
3D without workspace writer ownership. The default run saves WebP evidence
and a JSON report to `test-results/magic1000/`, leaving committed thumbnails
unchanged. Regenerate the repository thumbnail only with the explicit
`--write-thumbnail` flag and visual review. The formerly obsolete
`magic1000-candidate.yml` is a read-only, **manual-dispatch-only** browser diagnostic
rather than a branch-specific or automatically triggered PR gate. It never pushes thumbnails.
Scientific geometry and Recipe replay remain governed by separate tests.

### KLayout v2 Mask-to-Process bridge

`scripts/v2/check-klayout-mask-process.mjs` imports the pinned GDS hierarchy
and OASIS rectangles sample in the real production v2 Workstation. It
checks nonempty rendered Mask, selected imported layers, unchanged Base model
before fabrication, then runs a masked Deposit through the real Process
Worker, verifies the new physical layer and History Step, and retains the
layout geometry. This browser gate is included in
`.github/workflows/klayout-compat.yml` and saves evidence in
`test-results/klayout-v2/`.

The external KLayout parser/export corpus remains an independent scientific
owner, while historical Legacy-specific UI tests are reproducible at
`legacy-frozen`. This v2 bridge does not replace the full KLayout corpus
or justify deleting its compatibility checks.

### Legacy project format compatibility

The executable old UI is already retired from this checkout, but the v2
Workstation must continue to read and recover historical project files. The targeted
[Legacy project compatibility workflow](../.github/workflows/legacy-project-compat.yml)
runs `node scripts/v2/check-legacy-project-recovery.mjs` when its owned
startup, persistence, or Legacy entry files change. This exercises the real
2026-10-06 `shared-assets-v1` project fixture (SHA-256 verified, with the
original 41 process Steps) through the **v2** staged Project worker, autosave,
reload, and a replacement-created Recovery point. It does not launch the old UI.
The large historical fixture makes this an independent path-gated browser
acceptance rather than an unconditional Node test. This check does not by itself prove historical UI-gesture parity.
Welcome's interactive preview is v2-only; remaining historical scientific
scenario differences are tracked in [Issue #289](https://github.com/Xiaolong-6/WaferCAD/issues/289)
without dropping current v2 invariants.

### Production desktop docking ownership

The production Workstation's desktop-only (821px and wider) view layout is owned by
`site/ui-v2/view-layout-model.js` and `view-layout-templates.js`.
`site/tests/view-layout.test.mjs` covers pure visibility, ordered slots,
maximize/restore, Snap and preference invariants. After starting the v2
browser server, `npm run test:ui:docking` checks real Chromium 1440/1024/821px
Grid geometry, all four-/three-view presets, titlebar Snap exchange,
split-resize handles, Panel/Canvas identity, scientific-model invariance,
and the unchanged 390px compact navigation. During resize, the browser test
holds the pointer down and checks that both column and row divider centers
follow the actual Grid pane edges; use quarter-point grips to avoid the
row/column crossing. It saves `divider-mid-drag-columns.png` and
`divider-mid-drag-rows.png` before pointer release, and confirms the final
ratio is committed afterward. It writes screenshot evidence to
`test-results/ui-v2-desktop-docking/`. The final
Main/Mask/Mobile targeted CI owner invokes it; Draft visual iterations should
prefer the direct command rather than the full browser matrix.
No temporary standalone workflow is required after the initial screenshot acceptance.

### UI v2 shared-workstation checks

The default-v2 route and Welcome handoff are owned by `scripts/v2/check-startup.mjs`.
`scripts/v2/check-welcome-preview-isolation.mjs` verifies that Welcome's
on-demand four-view preview renders the small final-stage project through v2,
never acquires the writer lease, and does not change the saved-workspace marker.
It has no `start` intent, autosave or Recovery side effects. Full examples
continue to open through the ordinary v2 Project route.
`scripts/v2/check-cross-ui-recovery.mjs` retains its historical CI entry
name while exercising the production v2 Workstation only: complete 47-Step and
seven-Variant Example handoff, exact saved-model reload, explicit Project Save,
competing v2 writer exclusion, protected unload, and Recovery after replacement.
The original executable Legacy↔v2 handoff scenario is archived with
`legacy-frozen`; its former `check-legacy-cross-ui-recovery.mjs` script and
`legacy-cross-ui-retirement.yml` workflow are no longer in the active checkout.
Current `check-cross-ui-recovery.mjs` exercises native-v2 storage ownership and
Recovery. Historical project decoding is separately checked by
`check-legacy-project-recovery.mjs` and its SHA-256-pinned fixture.
The Workstation footer shows the deployed commit from `build-info.json`
(or `commit local` in local development). Current scientific/controller
tests target the production v2 entry; exact Legacy DOM cases are reproducible
only at the frozen tag.

Small Metalens interaction owners import the complete
`tio2-metalens-four-unit-process.wafercad` through the staged Project path.
The catalog's full 6,400-instance Metalens remains covered by the M4 project owner.

Serve `site/` with `node scripts/v2/serve-v2.mjs` on port 4182. Main, Mask and integrated Section have separate owners: `check-main-view.mjs`, `check-mask-view.mjs` and `check-section-view.mjs` under `scripts/v2/`.

The [desktop review checkpoint](archive/ui-v2/DESKTOP_REVIEW_2026-10-11.md) records user-approved toolbar and gesture changes. `node scripts/v2/check-review-interactions.mjs` owns responsive inline rename, real-canvas focus/restoration without saved-color changes, repeated Random, aligned visibility and real Electrical depth/visibility. It runs four widths plus touch and loads JLFET for Electrical coverage; the Process/History Stage C workflow is owned by the integrated Stage C gate below.

Stage C now uses one genuine M2-derived four-view workstation with a shared model and the existing scientific controllers. The [Stage C / M4 CI gate](../.github/workflows/ui-v2-stage-c-m4.yml) runs these commands at 4182 (Node 24; Chromium 140 / Playwright 1.55.1):

```bash
node scripts/v2/check-sync.mjs
node scripts/v2/check-startup-shell.mjs
node scripts/v2/check-welcome-preview-isolation.mjs
node scripts/v2/check-startup.mjs
node scripts/v2/check-cross-ui-recovery.mjs
node scripts/v2/check-review-interactions.mjs
node scripts/v2/check-m4-projects.mjs
```

The Stage C `check-sync.mjs` file-import scenario uses the native
`#gdsInput` control. Its success gate checks the imported GDS filename,
non-empty flattened geometry, File mask source, and the active cell.
The flattened layout has `elements`, not a `cells` collection; the
file-input name is `gds-basic-instances.gds` (distinct from the
internal `basic_instances` cell name). This prevents a false timeout
after a successful GDS import. Product import, checkpoint, and model
invariance remain in scope; no visual baseline is changed.

The Main and Mask view gate uses a 0.01 px tolerance for pointer-based
pan deltas (which can contain browser subpixel rounding). In the 390 px
Mask layout, the Alignment action is reached through the responsive
`Mask more tools` menu. Neither adjustment relaxes geometry, export,
History, or scientific state assertions.

The shared synchronization owner checks independent Main/Mask/Section ROIs, real mask-limited Process geometry, front/back process targeting versus Main orientation, History Undo/Redo/restore, Layers preference, Project Open/Save/Recovery, Recipe precise deposition, Diagnostics read-only behavior, and 1440/1024/768/390 plus emulated-touch layout invariants. The M4 project owner additionally checks M3D, Photodetector, four-unit TiO2 Metalens and the true 6,400-tile / 49-template full array with real imports, unit round trips and exported project verification at the documented 0.1 nm persistence precision. Its `metalens-array` route loads the complete fixture, not the four-unit preview. Both owners report errors and upload browser screenshots without updating approved visual baselines. `check-sync` and its latest checkpoint are documented in [M4 acceptance](archive/ui-v2/M4_ACCEPTANCE_2026-10-11.md).

For revision-specific passing evidence use PR #177 at `b127ce8` and the [M4 CI run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38161661083). These are software-WebGL, programmatic and Chromium touch-emulation results. Physical RTX GPU, physical touchscreen, M2 visual acceptance, heavy full-array Recipe Run All, complete Variant editing and new screenshot baseline approval remain separate checks.

Phase B 3D separates small-example interaction coverage from a substantial real export that can be cancelled through the task panel:

```bash
WAFERCAD_THREE_DIR="$PWD/node_modules/three" WAFERCAD_V2_EXAMPLE=metalens \
  node scripts/v2/check-three-view.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" \
  node scripts/v2/check-three-export-abort.mjs
```

The first checker runs the full camera/gesture/export assertions at 1440 and 390 px, plus a separate 1024 px touch scenario. At 1024 and 768 px desktop/tablet breakpoints it reuses the already-loaded 1440 px page for responsive 3D layout, canvas visibility, material-pixel screenshots, and scientific-model invariance without repeating the full gesture/export suite. The resulting report labels each width as `full` or `layout-only` and records per-stage wall-clock profiles. Overall coverage still includes four widths, touch, Main ROI/Section linkage, unchanged model, PNG 3× and GLB metres. The second uses the complete 27-layer/550-region M3D model, real GLB work and task-panel Abort, requiring no download, unchanged model/ROI and a released task. Only its camera comparison allows the user-approved maximum numerical error of `1e-9`; existing `0.25 px` geometry assertions remain unchanged. A tiny clipped export may complete before an Abort click and cannot establish cancellation. `check-three-view.mjs` still defaults to complete M3D for full-model diagnostics when no example is supplied.

Final captures also require visible colored material pixels in the compositor PNG, canvas/host agreement and screenshot-time layout stability within 0.25 px. Four-width checks use full-page capture. Touch uses an actual viewport capture, requires the entire 3D canvas to fit, and preserves coarse-pointer emulation: Chromium 140 full-page `captureBeyondViewport` switches the emulated pointer to fine. Capture dimensions and pointer diagnostics are saved beside each PNG as `.visibility.json`; the portable report includes the same data and material-pixel count. This does not replace scientific model/geometry assertions or human visual acceptance.

[The Phase B CI workflow](../.github/workflows/ui-v2-three.yml) runs these two browser owners separately from the Main/Mask/Section job. It has no manual dispatch entry. Local reports are under `test-results/ui-v2-three-review-metalens/` and `test-results/ui-v2-three-export-abort/`. Passing these checks does not establish hardware GPU or physical touchscreen acceptance; see the [WIP checkpoint](archive/ui-v2/STAGE_B_LOCAL_CHECKPOINT_2026-10-11.md) for actual results and the [current review handoff](archive/ui-v2/STAGE_B_REVIEW_HANDOFF_2026-10-11.md) for the user-approved lightweight acceptance scope. The full-model interaction rerun was stopped at the user's request; its checker remains available and unchanged in scope.

For **frame-accurate transparency measurements**, wait for `rendererFrameSerial` to advance after the opacity change, then sample diagnostics. `renderState=ready` alone may precede the next WebGL frame. `rendererFrameMs` is CPU-observed submission time, while `rendererDrawCalls`/`rendererDrawTriangles` and retained geometry/material counters expose the active and cached scene costs. A browser screenshot/compositor checkpoint is needed when comparing user-visible cold and warm latency. The 625-site transparency benchmark **continues to measure** cold/warm complete-frame latency, but the <15 s cold budget and relative swap times are **temporarily non-blocking** under the recorded renderer acceptance policy. Failures of transparency geometry, buried Electrical/Implant visibility, scene ownership, retained resource stability, interaction, or genuine frame hangs still fail CI. Timing overruns are emitted as `ARRAY_RENDERER_PERF_WARNING` and stored in the renderer report. See [the transparency performance roadmap](renderer/RENDERER_TRANSPARENCY_ROADMAP.md) for the evidence, phases and conditions for restoring the hard timing gate.

For renderer performance diagnosis, `npm run benchmark:renderer` opens the bundled 625-site full-wafer project and records stage timings exposed by the 3D renderer (ownership/topology, smooth caps, sidewalls, annotations/scene assembly, presentation updates, and rough preview/final readiness). It also asserts the persistent-scene contract: opacity changes must retain the same scene generation and surface-plan build count, report a presentation update, perform zero physical assembly work, and keep scene object/geometry/material counts stable. The benchmark writes diagnostic output under ignored `test-results/renderer-pipeline/`. It is **not** a CI performance threshold: hardware/browser timing varies, so use it to compare the same environment before/after a renderer change. Changes to the benchmark script route to the renderer browser owner so its surrounding product contracts are still exercised.

### Documentation checks

`npm run docs:check` validates generated Process output and the repository-wide documentation link/navigation contract. `node --test site/tests/documentation-suite.test.mjs` owns link negative cases, actual tutorial parsing, Welcome catalog alignment and generated operation diagrams. See [Documentation architecture](DOCUMENTATION.md) for authority and publishing boundaries.

### Focused Recipe audit checks

`node scripts/process-geometry-regression.mjs --recipe-only` runs the Recipe UI/Base/History integration and exact sub-grid film replay/export in µm, nm and mm. `node scripts/persistence-regression.mjs --recipe-only` proves a snapshot-only Recipe autosaves its bookmark and survives reload. These cases also run in their normal owning suites.

`example-recipe-runall-acceptance.mjs` checks the actual Kernel lengths retained in every rebuilt Process Step, in addition to material inventory and annotation/site counts. M3D visual acceptance records all four Border ON/OFF × Opacity 100%/70% views and confirms three read-only historical stages plus HEAD do not create Recovery records. Welcome acceptance decodes its image before measuring it, uses pinned local Three, and explicitly sets the starting Border state because projects restore saved display settings.

### Deterministic browser dependencies

Playwright `1.55.1` and Three `0.179.1` are pinned devDependencies in `package-lock.json`. Install them with `npm ci`, then install Chromium with `npx playwright install chromium` (`--with-deps` on Linux). Serve `site/` locally and set `WAFERCAD_THREE_DIR` to the project's `node_modules/three` directory before running browser tests:

```powershell
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
npm run test:ui:all
```

On POSIX shells, use `WAFERCAD_THREE_DIR="$PWD/node_modules/three" npm run test:ui:all`.

The Browser regression workflow exposes the same local Three package through `WAFERCAD_THREE_DIR`. Normal browser contexts intercept the matching jsDelivr URLs and serve those modules from the local package, so CDN availability is not part of ordinary regression reliability. The dedicated CDN resilience case intentionally bypasses this route; the WebGL-unavailable case still uses pinned Three so it isolates WebGL failure.

The required local Chromium and scientific regression commands below remain
available regardless of how GitHub jobs are scheduled. Their selection in
the repository is governed by the [2026-10-22 CI policy](CI.md#authoritative-execution-strategy-effective-2026-10-22),
not by historical weekly or automatic Draft workflow routing.

### CI cost controls

- Run focused owner tests and capture real local Chromium evidence before
  proposing a change. The source-bound local `draft` receipt covers
  formatting, lint, generated documentation and focused Node checks;
  `full` is required before Ready/merge.
- Automatic Draft `Quality` is proof-only. Missing or stale receipts
  fail closed without remote reruns.
- Ready PRs use `ready-impact.yml` and its cumulative-diff selected
  scientific, History/Recovery/Worker or Browser/Renderer/Example owners.
- One full integration controller runs at **02:30 UTC daily**, for its
  exact SHA only. Former weekly Browser schedules are retired.
- The Main Pages release has its independent fail-closed exact-source
  checks. Do not weaken scientific or data-integrity tests to save minutes.
- The Wiki documentation-targeted workflow is explicit-dispatch only;
  local verification owns ordinary Draft documentation checks.

## Node test ownership

The former `site/selftest.mjs` monolith has been removed. `npm test` runs `node --test site/tests/*.test.mjs`, including the Documentation, History and Recovery suite aggregators that import every grouped owner. Other test owners remain flat pending separately validated migration.

The migrated self-test contracts are owned by focused files:

- `section-surface-rendering.test.mjs`: Section Z collapse, rough LOD/budgets, renderer sidewall ownership, and deterministic rough/pyramid profiles.
- `rough-process.test.mjs`: core model defaults plus rough etch, inherited rough interfaces, pyramid etch, and rough-following films.
- `isotropic-release.test.mjs`: canonical suspended-cavity topology, air-gap preservation, implant fragmentation, and directional-etch compatibility after release.
- `conformal-process.test.mjs`: direct vs conformal growth, mask-edge clipping, sidewall growth, buried-layer rejection, layer mutation, and core vector topology checks.
- `gds-smoke.test.mjs`: demo layout and physical-unit GDS parsing smoke.
- `project-annotation.test.mjs`: project schema validation plus Implant/Electrical Region model/view contracts.
- `project-geometry-storage.test.mjs`: exact v3 polygon template expansion, holes/order/winding, lossless sub-grid workspace values, malformed references/overflow, expansion limits, real Process output and complete native Fig3 History round-trips.
- `model-array.test.mjs`, `mask-instance-index.test.mjs`, `process-boundary-index.test.mjs`: canonical arrays, strict tile ownership, bounded neighborhood/COW equivalence, lossless v4 IO, exact mask/edge indexes and cancellable idle preparation.
- `project-file.test.mjs`: storage compatibility and strict file/schema limits, including rectangular containment and aggregate component-overlap rejection.

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
- `process-geometry-regression.mjs`: Etch/Rough, Implant, Electrical Region, Conformal Deposit/Extend, exported morphology, and scientific Section geometry checks. The `test:ui:process` command then runs `project-io-runtime-regression.mjs`: 400 real UI mask islands, native 10 nm Conformal walls, worker export/open with exact physical model and recorded History, and continued Etch at every island. Run `npm run test:ui:io` for that focused path alone. `test:ui:process` also runs `array-runtime-regression.mjs`: 625 native sites, full-wafer SVG/physical GLB instancing, real Conformal, exact IO/History, original metal/contact probes and continued selective Etch. Use `npm run test:ui:array` for that focused acceptance.
- `interaction-regression.mjs`: Slice/ROI, Mask Draw, mask ROI/alignment, view exports, maximize/restore, and 3D inspection controls.
- `resilience-regression.mjs`: missing Three.js and unavailable WebGL degraded-mode behavior.
- `example-regression.mjs`: bundled literature/example structural contracts.
- `product-layout-regression.mjs`: responsive product/layout review across wide, medium, phone, and breakpoint-edge viewports.
- `renderer-product-regression.mjs`: wide-screen renderer acceptance for isotropic release, GPU-hybrid rough/LOD ownership, conformal interfaces, and implant visibility. Its package entry point also runs `array-renderer-regression.mjs` for full-wafer Fast/Quality topology consistency, persistent opacity/border updates, transparent annotations, repeated-toggle resource stability, and pointer rotation.
- In pull-request Browser Regression CI, the dedicated 625-site renderer job additionally runs `array-renderer-regression.mjs --fast-transparent-lod` (full 20-toggle stress and Fast/Quality far-field triangle comparison). A separate `array-renderer-edge-on-regression.mjs` job uses a fresh browser to verify completed exact transparent Electrical sidewalls after orbit and the subsequent fitted far-tier recovery. Keep these checks separate because the exact software-WebGL compositor can starve unrelated UI inputs after long repeated-toggle tests.
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

The browser workflow keeps the ordinary layout and renderer product scopes as separate steps inside the normal targeted Chromium job. They are selected only when the changed paths can affect their ownership area, while sharing the same browser installation when both are required.

The full **625-site array renderer regression** runs in a **separate parallel CI job** (`renderer-array`, 30-minute watchdog) when renderer ownership changes. This preserves all 20 opacity/border toggle checks and enforces retained-scene stability, buried layer visibility, variant reuse, rotation and completion. Previously this large software-WebGL test ran at the end of an already busy 15-minute Chromium job and GitHub Actions cancelled it during the final toggles, even though preceding UI/product checks passed. The ordinary Chromium job retains its 15-minute watchdog and runs `renderer-product-regression.mjs`; `npm run test:ui:product:renderer` still runs both renderer scripts for local comprehensive verification. The 15-second transparent-first-frame **performance budget stays advisory**; a true timeout, wrong geometry or resource regression still blocks.

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

See [local validation](archive/VALIDATION_2026-10-05.md) for the tested revision, environment, runtime results and human acceptance. Windows references must not be used as evidence of Linux raster stability. Generate a separate Linux set and review it before enabling a Linux pixel gate.

Visual baselines are intentionally **not** part of `test:ui:all` or the GitHub Actions gate yet. Generate them in a controlled Chromium/Linux environment, review the PNGs, commit only approved baselines, then enable the gate in a separate change. WebGL screenshots remain review artifacts until cross-run raster stability is characterized.

The later [rendering stabilization](archive/STABILIZATION_2026-10-05.md) intentionally changed the Photodetector Section profile/gradient. The updated Photodetector Windows reference was subsequently reviewed and accepted, so all five committed Windows Chromium references represent the accepted 2026-10-05 Windows set. Product renderer tests independently measure Si/ALD/Implant registration, local depth gradients and the thin sidewall floor in a Detail inset; accepted Windows pixels still do not establish Linux raster stability.
