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

For **frame-accurate transparency measurements**, wait for `rendererFrameSerial` to advance after the opacity change, then sample diagnostics. `renderState=ready` alone may precede the next WebGL frame. `rendererFrameMs` is CPU-observed submission time, while `rendererDrawCalls`/`rendererDrawTriangles` and retained geometry/material counters expose the active and cached scene costs. A browser screenshot/compositor checkpoint is needed when comparing user-visible cold and warm latency. The 625-site transparency benchmark **continues to measure** cold/warm complete-frame latency, but the <15 s cold budget and relative swap times are **temporarily non-blocking** under the recorded renderer acceptance policy. Failures of transparency geometry, buried Electrical/Implant visibility, scene ownership, retained resource stability, interaction, or genuine frame hangs still fail CI. Timing overruns are emitted as `ARRAY_RENDERER_PERF_WARNING` and stored in the renderer report. See [the transparency performance roadmap](RENDERER_TRANSPARENCY_ROADMAP.md) for the evidence, phases and conditions for restoring the hard timing gate.

For renderer performance diagnosis, `npm run benchmark:renderer` opens the bundled 625-site full-wafer project and records stage timings exposed by the 3D renderer (ownership/topology, smooth caps, sidewalls, annotations/scene assembly, presentation updates, and rough preview/final readiness). It also asserts the persistent-scene contract: opacity changes must retain the same scene generation and surface-plan build count, report a presentation update, perform zero physical assembly work, and keep scene object/geometry/material counts stable. The benchmark writes diagnostic output under ignored `test-results/renderer-pipeline/`. It is **not** a CI performance threshold: hardware/browser timing varies, so use it to compare the same environment before/after a renderer change. Changes to the benchmark script route to the renderer browser owner so its surrounding product contracts are still exercised.

On the experimental transparency V3 branch, `node scripts/renderer-quality-index-ab.mjs --gpu-profile` performs a separate **normal / raster-discard / raster-discard / normal** diagnostic with Quality indexing off in all four isolated contexts. The browser-only helper instruments actual WebGL2 draw calls by presentation owner, checks their totals against Three's frame counters, and adds an explicit `gl.finish()` barrier in both arms. It reports command submission, completion wait, renderer identity, and `EXT_disjoint_timer_query_webgl2` results only when available and non-disjoint. Unsupported, busy, lost, disjoint or timed-out queries retain `gpuMs: null`.

Raster discard submits every original primitive but deliberately produces an incomplete image. Its screenshots are labeled diagnostic-only and must never serve as visual acceptance, a baseline, a product optimization, or permission to omit material/annotation faces. The two normal-arm canvases must match exactly. Remaining discard cost includes driver/command and geometry processing; it is **not** a pure vertex-stage timer. Explicit completion changes scheduling, so compare only measurements using the same probe. Output is under ignored `test-results/renderer-gpu-profile/`; this extra diagnostic is run locally, not added to automatic heavy CI. The application never imports the helper. `webgl-frame-probe.test.mjs` owns counter, query-validity and GL-state restoration regressions.

### Documentation checks

`npm run docs:check` validates generated Process output and the repository-wide documentation link/navigation contract. `node --test site/tests/documentation.test.mjs site/tests/wiki-manual.test.mjs site/tests/process-guide.test.mjs` owns link negative cases, actual tutorial parsing, Welcome catalog alignment and generated operation diagrams. See [Documentation architecture](DOCUMENTATION.md) for authority and publishing boundaries.

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

GitHub Actions caches both npm downloads and the Playwright Chromium browser directory. Pull requests share one targeted Chromium job for the normal suites so setup cost is paid once. The much longer Process Geometry regression is a separate conditional job: it runs only for relevant process/model geometry changes and full-regression events, where parallel execution improves wall time enough to justify the duplicated setup.

### CI cost controls

- Quality skips documentation-only pull requests and owns the PR-level ESLint + documentation checks + complete Node test gate.
- Browser regression is path-filtered to application, examples, browser-test, dependency, and workflow changes; `site/tests/**` changes alone do not trigger it.
- Every browser PR runs UI smoke. Workstation and resilience are ownership-selected rather than unconditional; `scripts/ci-test-plan.mjs` then selects History, Persistence, Interaction, Examples, Product Layout, Renderer, and Process Geometry from changed paths.
- Browser PR jobs do not repeat `npm test`; non-PR runs execute the Node gate because a separate Quality run may not exist for direct pushes.
- Process Geometry no longer runs on unrelated pull requests. When selected, it runs in a separate job in parallel with the targeted browser suites.
- Pushes to `main` diff the previous and current main revisions and reuse the same change-impact planner as pull requests, so only the owning suites are repeated after merge.
- The weekly Browser regression schedule (Monday 02:17 UTC) and manual `workflow_dispatch` runs execute the full browser inventory, including Process Geometry.
- Workflow/planner-only changes stay on UI smoke; planner routing is covered by Node tests.
- Pull-request and targeted-main product checks suppress human-review screenshot galleries. Weekly/manual full runs retain galleries plus renderer stress and full Process Geometry permutations.
- Dependency-lockfile or shared browser-test-helper changes conservatively request the full browser suite.
- KLayout compatibility keeps its dedicated parser/UI workflow and caches Chromium for the browser import sweep.

Designated full replay/fixture jobs and the 625-site renderer defer Draft PR execution until ready for review; other applicable fast/targeted jobs remain selected. The dedicated example/native replay workflows are PR/manual and are not automatically implied by a main push.

See [CI routing](CI.md) for the path-to-suite policy and full-regression events.

## Node test ownership

The former `site/selftest.mjs` monolith has been removed. `npm test` now runs only `node --test site/tests/*.test.mjs`.

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

See [local validation](VALIDATION_2026-10-05.md) for the tested revision, environment, runtime results and human acceptance. Windows references must not be used as evidence of Linux raster stability. Generate a separate Linux set and review it before enabling a Linux pixel gate.

Visual baselines are intentionally **not** part of `test:ui:all` or the GitHub Actions gate yet. Generate them in a controlled Chromium/Linux environment, review the PNGs, commit only approved baselines, then enable the gate in a separate change. WebGL screenshots remain review artifacts until cross-run raster stability is characterized.

The later [rendering stabilization](STABILIZATION_2026-10-05.md) intentionally changed the Photodetector Section profile/gradient. The updated Photodetector Windows reference was subsequently reviewed and accepted, so all five committed Windows Chromium references represent the accepted 2026-10-05 Windows set. Product renderer tests independently measure Si/ALD/Implant registration, local depth gradients and the thin sidewall floor in a Detail inset; accepted Windows pixels still do not establish Linux raster stability.
