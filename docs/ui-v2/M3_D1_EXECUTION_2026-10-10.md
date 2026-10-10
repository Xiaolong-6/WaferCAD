# M3 D1 implementation checkpoint — experimental real-view bootstrap

Date: 2026-10-10. Branch: `codex/ui-v2-m3-main-audit-20261010`. Pre-domain rollback point: `0fa32a75df234ca451dff085f16a7f961744a2bb`.

> **D1 IN PROGRESS — NOT ACCEPTED.** The initial implementation at `39d5c22` was followed by the executable inspection below. The isolated real-view gate now passes for Base, Photodetector and M3D, but full geometry, shared-toolbar/portal and approved-platform visual acceptance remain open. No D2 work was started. The public `app-v2.html` remains the original M2 mock preview.

## Scope of implementation

- `site/app-v2-real.html`: isolated, opt-in D1 experiment with `html[data-ui=v2]`. Loads pinned Three importmap, existing product styles and v2 shell assets, then `real-view-bridge.js`. Does **not** change default `index.html`, existing mock entry, legacy `app.html`, visual baselines or deployment.
- `site/ui-v2/real-view-bridge.js`: fetches `app.html` as an inert DOM contract source and appends the legacy DOM to a hidden staging owner **without executing its bootstrap scripts**. Moves the **original** Main, Mask, 3D and Section panels, controls and canvas/stage nodes into one v2 workstation shell; records identity and verifies the four native stage nodes before/after the single real app module import. Domain adapters deliberately remain explicitly unconnected. Navigation, Single/Overview/Split, Section dock, responsive More owned by existing view toolbar, Split exchange and Max/Restore are wired to stable native buttons/canvases. Uses only existing `app.js` science and worker services: it does not reconstruct their algorithms or silently simulate success.
- `site/app.js`: v2-only conditional at the **permitted workstation startup/self-check seam** selects the pre-created v2 workstation bridge instead of initializing legacy Workstation. V2 only routes History→Process nav to the v2 bridge and avoids a second legacy maximize handler. Legacy path continues to invoke the original workstation, existing handlers and original self-check; no science/model/worker/IO/schema implementation is changed.
- `site/ui-v2/real-view-bridge.css`: experimental-only native view presentation sizing; no changes to M1.5 approved prototype or existing CSS.
- `scripts/v2/check-d1-real-views.mjs`: executable browser regression (owns its localhost server) that checks v2 route, no mock presenter, real source canvas IDs, four stages and original button identities, mode persistence, Split, Max/Restore, boot/console errors and screenshots at 1440/1024/768/390. It records local ignored evidence under `test-results/ui-v2-d1-real/`.

## Initial connected-only inspection at `39d5c22` (historical)

- GitHub connected source comparison: working branch started at **exact** `0fa32a7`; all D1 edits are on the requested existing branch, no force push.
- Confirmed all **17** referenced source/style/vendor resources for `app-v2-real.html` exist on the same branch.
- New classic bridge `real-view-bridge.js` parsed successfully with the local V8 syntax parser available in the connected tooling. This is **syntax**, not functional runtime evidence.
- Source-level review: the v2 switch in `app.js` is conditional on `html[data-ui=v2]`; legacy control flow remains in the `else` branch. Historical preflight at `0fa32a7` (585 Node, 60 shell, 8 contract, legacy suites) is _prior evidence_, **not** a new test pass for this D1 commit.
- Connected commit status check had **no CI statuses and no pull-request workflow runs** for the D1 head at inspection time. No manual or costly CI tasks dispatched.

## Initial missing acceptance (historical; runtime updates below supersede items 1/6)

1. **Real browser bootstrap and true WebGL canvas:** a runnable checked-out repository/browser was unavailable to this ChatGPT execution environment. `node scripts/v2/check-d1-real-views.mjs` was **not executed**, nor were `npm ci`, lint, docs:check, contract refresh, GPU fallback, real screenshot/pixel or ROI physical-coordinate measurements. We must not infer they passed from static parsing.
2. **M1.5 chrome parity:** the experimental real route currently _adopts original native view-head toolbars_ inside v2 layout. Final shared-toolbar component placement, overflow/icon alignment, popover focus/Esc/aria semantics and exact four-width approved prototype comparison remain to be audited/fixed in a real browser. No baseline has been created/updated.
3. **Pointer/DOMRect correctness:** real Main/Mask ROI and Section Detail/Slice interaction need the strict original 0.25px and µm geometry scenarios. Stage identity checks alone cannot prove pointer accuracy. 3D first complete frame and software-vs-hardware WebGL must be reported separately.
4. **Route convergence:** product `app-v2.html` deliberately remains mock. Move/retarget only after the isolated experimental route truly passes D1 acceptance. `startup-controller.js` and Welcome legacy URL cleanup remain D9 ownership; launching with a staged URL may currently rewrite the experimental path, so it is not approved as production routing.
5. **Hidden legacy contract:** controllers still require their 267 legacy IDs; importing existing DOM into hidden staging is a temporary bootstrap bridge, not complete removal/migration of all domain controls. Verify that dynamic dialogs/portal ownership and persistence does not act on hidden UI unexpectedly. Domain controls/transactions remain D2–D9.
6. **Generated contract delta:** changing scanned `site/...` source may modify generated DOM inventory; deterministic `node scripts/ui-contract-extract.mjs --check` must run before D1 acceptance and any generated drift must be resolved without obscuring the 14 previously traced unresolved operations.

## Commands for the executable D1 gate

Run on the **current D1 head** (not the historical preflight):

```bash
npm ci
node scripts/ui-contract-extract.mjs --check
node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs
npm run lint
npm run docs:check
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/v2/check-d1-real-views.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/v2/check-m2-shell.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" npm run test:ui:workstation
WAFERCAD_THREE_DIR="$PWD/node_modules/three" npm run test:ui:smoke
```

Inspect `test-results/ui-v2-d1-real/real-{1440,1024,768,390}.png` against approved M1.5 screens. Run additional real pointer/ROI/Section/3D frame/overflow/focus assertions; do not silently downgrade geometry or visual thresholds. On any failure, fix on this same branch and rerun. Do not open D2 before an explicit D1 checkpoint and user approval.

## Decision / roll-forward

**No D1 PASS claim** is warranted yet. The experimental entry remains isolated so the previously accepted M2 mock and legacy real product are not silently replaced. After runtime tests and screenshot review, either promote the single real v2 bootstrap into `app-v2.html` (keeping an explicit mock route) or revert the D1 experiment to the recorded rollback commit if its shell/DOM approach proves unsuitable. Explicit user approval is still required before D2 and before any visual-baseline change/merge to main.

## Executable inspection and fixes — 2026-10-10

Input: `39d5c229bf7ed00e9e20dd6dc01512ed25b85f74`. All fixes remain on the same M3 branch. D1 rollback remains `0fa32a7`. Linux, Node v24.19.0, pinned Playwright Chromium 140.0.7339.186 (v1193), locked dependencies installed with `npm ci`. Tests use local pinned Three 0.179.1 via `WAFERCAD_THREE_DIR`, not an unpinned network dependency.

### Defects reproduced and repaired

| Defect                                                                       | Evidence / fix                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real canvas rendered outside the visible v2 grid                             | Legacy ID-specific `grid-area` declarations created implicit tracks in the new grid; initial screenshot showed blank scientific workspace despite appReady and GPU frames. Experimental-only, higher-specificity CSS resets native panels to automatic placement and spans docked Section across Split. Visible canvas bounds are now asserted at all four widths. |
| Single did not survive refresh                                               | Legacy storage enum uses `main/mask/three`, not `single`. Bridge now stores the selected view for Single, keeping the existing sessionStorage keys and enum. Actual page reload is tested.                                                                                                                                                                         |
| Broken Section readout slot                                                  | `sectionCoords` does not exist; original ID is `sectionRange`. Corrected binding. All 37 registry slots must resolve; four overlay slots are explicitly empty, hidden bridge owners, **not** proof of portal migration.                                                                                                                                            |
| Missing v2 navigation icon sprite and inconsistent native button sizing      | Install existing sprite and apply shared button/font tokens to original controls, preserving node identity. Full toolbar order/icon convergence remains open.                                                                                                                                                                                                      |
| More keyboard/focus and aria state                                           | ArrowDown opens and focuses a visible original control; Escape closes the relevant More owner and restores summary focus; aria-expanded follows actual native details state. Browser gate covers these behaviors.                                                                                                                                                  |
| Gate accepted readiness before usable rendering / missed responsive controls | Wait for first complete frame before capturing WebGL identity; wait for native responsive ResizeObserver before Max/ROI interaction; open More when necessary, then reacquire pointer DOMRect after closing menus. Verify actual drag hit target and physical-to-pixel round-trip.                                                                                 |
| Local deploy asset absent                                                    | Gate server supplies explicit `build-info.json` fixture; product source and deploy behavior unchanged.                                                                                                                                                                                                                                                             |

### Executed validation

- Enhanced D1 gate: Base and real Photodetector/M3D final-only projects, **1440/1024/768/390**. No JS/console errors or horizontal overflow. Original stages, native action buttons and the same WebGL canvas retained after navigation/ROI/mode changes; 37 slots resolve, no duplicate IDs. Single/Overview/Split, Split exchange, Max/Restore, keyboard More/focus and actual reload checks pass.
- Main Rect ROI is driven by real pointer drag into `mainCanvas`; input remains µm and physical dimensions round-trip through the renderer's actual scale with ≤0.25px tolerance. Maximum errors: Base **0.00004904px**, Photodetector **0.00005189px**, M3D **0.00046667px**. This is a Main rectangular ROI check, **not** Mask ROI / Slice / Section Detail or independent Main↔3D boundary alignment acceptance.
- 3D: actual WebGL2 canvas and `renderPhase=complete`, nonzero draw calls/triangles captured at every width. Renderer is ANGLE Vulkan **SwiftShader software WebGL**. This proves software rendering, **not** hardware GPU or performance acceptance. Section canvas is visibly sized at each width; Section physical correctness is still unverified.
- Original M2 mock shell: **60 checks pass**, errors empty; existing 1440/1024 mock ROI assertions remain unchanged. Run used the pinned headless shell with `--no-sandbox` in this root container.
- Legacy browser suites: `test:ui:smoke`, `test:ui:workstation`, `test:ui:viewux-v3` pass at unchanged legacy entry; assertions/baselines were not relaxed.
- Node: initial input `39d5c22` passed **585/585**. Final-source repeat also passed **585/585** (165149ms). Eight focused v2 state/contract tests, lint and docs checks pass; generated inventory refreshed via AST write/check (267 IDs, 214 classes, 1109 operations, 60 dynamic IDs, 14 unresolved). No unresolved operation is declared migrated from this count.

The gate clears its output directory on every run, saves evidence JSON and Main/3D/Section screenshots per width, and captures the **unchanged** M1.5 a-full iframe as `m15-reference-{width}.png` for manual comparison. Optional real fixture injection uses the original project file input and confirmation dialog; it does not connect or accept D3 Project UI, full History/Recipe replay or the 4,725-site array.

```bash
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/v2/check-d1-real-views.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" WAFERCAD_D1_FIXTURE=photodetector node scripts/v2/check-d1-real-views.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" WAFERCAD_D1_FIXTURE=m3d node scripts/v2/check-d1-real-views.mjs
```

### M1.5 comparison and remaining D1 gates

Reference captures use the approved a-full source unchanged; manually inspected desktop and narrow scientific chrome. Content is deliberately different (real renderer versus presentation-only prototype); no arbitrary pixel-equality claim or approved baseline replacement.

| Area                               | Result                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsive visibility / bounds     | Real Main, 3D and Section visible at all four widths; no horizontal overflow.                                                                                                                           |
| Main native toolbar                | **Not visually converged**: prototype Fit/Pan/Zoom/ROI icons and order differ from real Slice/3D ROI/Pan/Fit; More/Max still native text controls. Shared sizing alone is insufficient.                 |
| Section toolbar / legend / Z Break | Original native controls retained. Common-toolbar structure, Z Break top-layer ownership, focus lifecycle and physical Detail/Slice scenarios still require D1 verification; Legend edits belong to D7. |
| Overlay slots                      | Stable empty owners exist, but existing native overlays were not relocated into a unified v2 portal. Presence is not lifecycle acceptance.                                                              |
| Approved platform screenshots      | Linux review artifacts do not establish Windows approved pixel parity.                                                                                                                                  |
| Production route                   | Still isolated `app-v2-real.html`; original `app-v2.html` remains mock. No route promotion, D2, main merge or approved baseline change.                                                                 |

**Decision: runtime wiring gate passes for the listed scenarios; full D1 remains open.** Next D1 work must converge the native-toolbar presentation without replacing native controls/listeners, verify the remaining real geometry and overlay scenarios, and resolve the route checkpoint. Do not start D2 based on this partial runtime gate.

Final repeat evidence: the same modified bridge passed the M3D fixture (four widths, zero errors, completed software WebGL frames, 11–21 draw calls / 290–5381 triangles after ROI). Base gate also captured all four unchanged M1.5 references. Fixture counts are evidence of completed clipped scenes, not a benchmark or full Recipe replay. Final lint, docs check, eight focused tests and deterministic AST check completed successfully.

## Follow-up source changes — 2026-10-10 (after `2c77457`, pending browser run)

A subsequent D1-only source audit confirmed two still-open acceptance classes in the real controllers: `mask-roi-controller.js` captures real canvas-local pointer events and maintains a mask-local ROI independent of the 3D ROI; `section-detail-roi-controller.js` maintains fractional Section canvas coordinates and positions a persistent inset; `section-collapse-controller.js` may reparent its **original** `<dialog>` to `document.body` on narrow/short docks. Original node identity alone does not prove any of these end-user behaviors.

Changes committed **on this same feature branch only**:

- `site/ui-v2/real-view-bridge.js`: v2-scoped Escape focus restoration for the **original** Z Break trigger after the existing controller has closed either its modal or inline native dialog. The handler intentionally does not claim pointer-dismiss focus or replace/recreate the dialog.
- `scripts/v2/check-d1-extended.mjs`: separately runnable, strict Playwright browser gate at 1440/1024/768/390 with Base and optional Photodetector/M3D fixtures. It performs actual Mask ROI pointer drawing and editable µm checks, an independent physical-to-screen Mask square tolerance for the untransformed Base, actual Section Detail drag and ≤0.25px overlay round-trip, original native Z Break dialog open/Escape/focus/owner return, stage and action-owner identity and duplicate-ID checks, screenshots and console errors. It saves **ignored local** `test-results/ui-v2-d1-extended[-fixture]` evidence. This script deliberately **does not** claim transformed Mask ROI precision for complex imported layouts, independent Section Z physical bounds, or Windows/M1.5 visual approval.
- These follow-up source modifications were checked with the available connected GitHub file read and a JavaScript async syntax parse (imports removed only for parsing). **The new browser gate, standard Node/lint and legacy visual suites were not executed by this session**, because the usable repository/browser environment is still absent here; earlier passing measurements at `2c77457` continue to belong to that earlier commit. No new PASS claim.

Execute and inspect before accepting D1:

```bash
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/v2/check-d1-extended.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" WAFERCAD_D1_FIXTURE=photodetector node scripts/v2/check-d1-extended.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" WAFERCAD_D1_FIXTURE=m3d node scripts/v2/check-d1-extended.mjs
```

If any assertion fails, **do not relax the 0.25px threshold**; fix the actual DOMRect/controller behavior on this same branch and rerun old+new gates. Shared v2 toolbar icon/order/action parity (and any missing real Zoom/Pan actions) must be resolved via functional native controls, not cosmetic placeholders; overlay portal lifecycle, Section physical-Z geometry, M1.5 four-width visual review, hardware/SwiftShader distinction and route promotion remain explicit D1 blockers. D2, main merge and approved baseline changes remain prohibited.

## Executable follow-up at `c960107` — 2026-10-10

This section supersedes the preceding **pending browser run** status. Input HEAD was `c960107113dce4c42d1ba05552dba4b12202007d`; implementation and evidence below are included together in its successor commit on the same branch. Linux / Node v24.19.0 / Chromium 140.0.7339.186 (Playwright v1193) / Three 0.179.1. Reinstalled locked dependencies with `npm ci` and the pinned Chromium. No main merge, D2, production-route promotion, approved baseline replacement or manual CI dispatch.

### Findings and actual fixes

1. **390px Mask ROI was genuinely unusable inside More.** The original Mask ROI toggle handler closed every other `details`, including its own responsive ancestor More. The extended gate failed to find the now-hidden Rect command. `mask-roi-controller.js` now preserves containing ancestors while closing unrelated editors, matching the existing shared popover policy. This is a UI ownership change only; all coordinate, physical ROI, mask transform and pointer math are unchanged. Existing legacy browser assertions were retained and rerun.
2. **Nested menu close needs a real settled DOMRect.** The gate waits for all Mask details to close and two animation frames before obtaining drag bounds. It does not forcibly close menus, bypass actual pointer input or relax 0.25px. Failure captures now include screenshot, active element, menu states and a bounded click/toggle trace; failed artifact directories are cleared on the next run.
3. **Shared native-toolbar presentation progressed.** A single bridge policy reorders genuine native Fit first, keeps existing Main Pan, exposes original Main/Mask +/- controls in a header Zoom editor, applies the approved existing SVG icons, consistent button/select font/size and trailing More/Max. Original nodes and controller bindings are retained; moved Zoom controls are proven to change actual Main scale by 1.25. Max/Restore retains its icon across state changes. This does **not** implement fake 3D/Section Pan/Zoom actions.
4. **The submitted Z Break Escape patch passes actual modal and inline scenarios.** Beyond the original gate, tested explicit Close and outside/backdrop dismissal, original owner return, repeated open/close and trigger focus after Escape/Close. Maximized desktop Section explicitly exercises the inline dialog path. No replacement dialog or alternate scientific editor was introduced.
5. **Lint found an unused `sectionDrag` in the submitted new script.** It is now retained in per-width evidence to make the actual pointer scenario reproducible; final lint is rerun.

### Validation recorded for this follow-up

- Enhanced core and extended gates at **1440/1024/768/390**, using Base plus actual Photodetector and M3D final-only project imports through the original input/confirmation flow. The core gate checks complete 3D frames, canvas/action identities, visible bounds, real Main ROI, original Zoom action, Split, Max/Restore, keyboard More, refresh state and unchanged M1.5 reference captures. The extended gate checks real Mask ROI and µm editing, Section Detail overlay coordinates/inset, seven native owners, modal/inline Z Break and zero duplicate IDs/errors/overflow.
- Base Mask square physical-to-screen error is at most **0.000009798px**. Photodetector/M3D Mask checks establish actual pointer creation, µm editing and retained owners, **not independent transform/rotation precision**.
- Section Detail overlay round-trip remains below **0.25px** (Base/Photodetector maximum **0.015px**). These are actual Section canvas fractional coordinates and inset visibility/magnification, **not independent physical-Z validation**.
- Current 3D core runs identify **ANGLE SwiftShader software WebGL**. No hardware GPU/performance claim.
- `npm run test:ui:smoke` and `npm run test:ui:workstation` (including View UX v3) pass at unchanged legacy entry. The shared native Mask ROI fix did not require any legacy assertion/baseline change.
- Eight focused v2 state/contract tests pass. AST write/check deterministic: **267 IDs / 215 classes / 1114 operations / 60 dynamic IDs / 14 unresolved**. Counts reflect source changes, not proof of dynamic ownership migration.
- **Final results:** all six core/extended fixture runs pass at all four widths; each has zero page/console errors. Section overlay maximum across all three fixtures is **0.015px**. Node **585/585** (152655ms), focused contracts **8/8**, legacy smoke/workstation/View UX v3, lint, docs (117 Markdown / 444 internal links), changed-file Prettier and deterministic AST check pass. No tolerance/assertion or approved reference was relaxed.

### Still-open D1 gates and concrete next step

| Gate                                                                                   | Status after this follow-up                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Main pointer ROI / Mask Base square / Section Detail fractional overlay                | Runtime passes for listed scenarios; unchanged 0.25px limit.                                                                                                                                                                               |
| Z Break Escape, Close, outside dismissal, modal and inline owner/focus                 | Runtime checked with original editor; original controller still owns its presentation.                                                                                                                                                     |
| Toolbar common appearance and original Zoom binding                                    | Real improvement verified. Full M1.5 functional parity remains open: Mask Pan and 3D/Section Fit/Pan/Zoom need explicit real behavior where unavailable; Slice/ROI/quality select and responsive priority still differ from the prototype. |
| Unified overlay portal                                                                 | Native popover/dialog owners are retained. Empty named overlay slots remain scaffolding; this is not unified portal lifecycle acceptance or proof of every nested editor.                                                                  |
| Section physical-Z / transformed Mask / Slice / independent Main↔3D boundary alignment | Not established by fractional overlay and positive µm inputs; still requires dedicated scientific scenarios.                                                                                                                               |
| Windows-approved pixels and hardware GPU                                               | Not verified by Linux software-WebGL review.                                                                                                                                                                                               |
| Route checkpoint                                                                       | Experimental real entry retained; mock/public and legacy routes unchanged.                                                                                                                                                                 |

**Full D1 remains NOT ACCEPTED.** Continue on this branch with a genuine shared view-action adapter and remaining geometry/portal scenarios. Existing 3D camera API and Section controller capabilities must be evaluated before inventing common actions; widening scientific/read-only renderer scope requires a concrete proposal. Do not start D2 or replace the production route based on this narrower pass.

The current core M3D run also passes after the toolbar changes and native Zoom assertion. This replaces reliance on the older `2c77457` measurements for the scenarios rerun here; the remaining full-D1 gates above stay open. Local reproduction uses the six core/extended commands with `WAFERCAD_THREE_DIR` and the two optional fixture names documented earlier. Screenshots/evidence are ignored, reproducible review artifacts under `test-results/ui-v2-d1-real[-fixture]` and `test-results/ui-v2-d1-extended[-fixture]`; shared source/report/runner changes are committed together.

## D1 real 3D camera adapter and independent Section check — 2026-10-10 (after `096def1`)

**Checkpoint status: implementation pushed; acceptance is still OPEN.** All existing six successful core/extended Base/Photodetector/M3D runs described above belong to **`096def1` and its predecessors**, not to this follow-up's modified product source. No runnable local checkout or actual Chromium/Node suite was available in this execution; do not forward-port the prior PASS markers.

### Source changes

1. `site/app.js` now exposes an experimental v2-only `getThreeCamera`/`setThreeCamera` presentation seam through `WaferCadV2RealBridge`. These call the **existing** `threeView.getViewState` and `threeView.setViewState`, then the **existing** view-only persistence scheduler. Legacy pages, product model, process/worker, geometry, renderer, IO and two storage keys retain their previous implementation.
2. `site/ui-v2/real-three-controls.js` owns two genuine 3D toolbar modes. **Pan** converts a left-drag CSS-pixel displacement to a target-plane camera translation derived from current perspective FOV, target distance and view height; applies the identical translation to camera position and target. **Zoom** uses a bounded exponential distance change along the original camera-to-target vector. Both route the result to the same existing 3D camera owner; neither changes stored scientific geometry or creates a second renderer. Default OrbitControls still handles normal orbit/wheel input when these modes are not selected. Pan/Zoom only intercept an opted-in left pointer gesture on the actual WebGL canvas.
3. `site/ui-v2/real-view-bridge.js`, `site/app-v2-real.html` and experimental-only `real-view-bridge.css` mount the real controls before the original production `app.js` bindings, preserve node identity, expose selected modes via `aria-pressed`/cursor, and clean up capture listeners on destruction/view hide.
4. `site/controllers/view-toolbar-controller.js` uses an explicit **v2-only** 700px threshold to relocate the **original** 3D quality select into its existing More owner when the additional controls need room. The legacy policy is unchanged.
5. `scripts/v2/real-three-controls.test.mjs` and `scripts/v2/check-d1-three-gestures.mjs` are new Node/pinned-Chromium gates covering camera invariants, real 3D pointer hit, camera target displacement, preserved relative orientation under Pan, changed actual distance under Zoom, restored Orbit mode, canvas identity, error reporting and 1440/1024/768/390 viewports. Existing M2 mock tests were not weakened.
6. `scripts/v2/check-d1-extended.mjs` now checks Base physical Section X:Z with **native** `sectionScaleModeBtn` set to physical and native Z Break disabled. Expected screen scales and plot origin use real A/B endpoint inputs, DOMRect, compositor's documented margins and the rendered Z bounds; Base thickness is cross-checked against a separate input. It maintains the unchanged **0.25px** pixel tolerance. It is not an independent validation of every nonlinear, rough, or collapsed Z profile, and the canvas is not CSS-scaled.

### Static evidence and remaining acceptance

- Confirmed the new 3D Pan mapping keeps `position - target` unchanged to numeric precision; Zoom preserves target and FOV while changing distance (source-level execution of the standalone math functions). New classic bridge module has valid JavaScript syntax.
- **NOT RUN on current HEAD:** Node 585, contract/AST refresh, lint/docs/Prettier, legacy browser, six earlier core/extended fixture gates, new camera Node tests, new camera real browser gate, M1.5 visual comparison, native/full portal lifecycle, physical Section full geometry/rotated Mask fixtures or actual GPU hardware. A new `site/ui-v2/` module may change AST-derived dynamic operation counts; regenerate/check the contracts rather than copying historical numbers.
- No assertion/baseline loosened, no D2 work, no default-route change, no mock→real promotion, no main merge, no force push. Rollback baseline remains `0fa32a7`.

To actually accept the new work, run on the new HEAD:

```bash
npm ci
node scripts/ui-contract-extract.mjs --write
node scripts/ui-contract-extract.mjs --check
node --test scripts/v2/real-three-controls.test.mjs
npm test
npm run lint
npm run docs:check
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/v2/check-d1-three-gestures.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" WAFERCAD_D1_FIXTURE=photodetector node scripts/v2/check-d1-three-gestures.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" WAFERCAD_D1_FIXTURE=m3d node scripts/v2/check-d1-three-gestures.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/v2/check-d1-extended.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" npm run test:ui:workstation
WAFERCAD_THREE_DIR="$PWD/node_modules/three" npm run test:ui:smoke
```

Remaining D1 blockers include **Section true Pan/Zoom** (the current Section compositor owns physical X/Z rasterization and needs a narrowly specified viewport API; a CSS transform would invalidate hit testing), the unified native overlay portal lifecycle (existing controller-owned nodes/dialog top-layer cannot be blindly moved without breaking `closest('.view-panel')`, focus and event contracts), full independent Section/Slice/rotated Mask/Main↔3D physical geometry, four-width M1.5 real-view visual parity, platform-specific approved screenshots, hardware GPU evidence, and explicit route handoff. Implement/validate those before declaring D1 passed.
