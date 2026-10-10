# UI v2 M3 — latest main pre-wiring audit (2026-10-10)

**Status: static audit and domain inventory prepared; D1 NOT authorized or started.** This is a source/API inspection through the connected GitHub repository, **not** a local test or browser acceptance. No product, geometry, controller, renderer, worker, storage or visual-baseline files were changed by this checkpoint.

## 1. Revision and integration reality

| Item | Verified value | Meaning |
| --- | --- | --- |
| Remote repository | `Xiaolong-6/WaferCAD` | Source of truth for this audit |
| Requested source branch | `codex/ui-v2-m2-handoff-2026-10-09` | Existing tip `e706f38b371edfc74679390b320815e73db8db33` (not the historical `57e92d1`) |
| New audit branch | `codex/ui-v2-m3-main-audit-20261010` | Created from the exact requested branch tip |
| Current `main` | `dc2cb2dbd9a7dca36b38070dd168063541767a5e` | M2 branch contains it and is 99 commits ahead; it is not behind `main` |
| Main/branch application DOM | `site/app.html` blob `fa99b762371f34817ff9e7c4523aed160920dfab` | Identical in `main` and audit branch |
| Main's v2 assets | `site/app-v2.html` and `docs/ui-v2/` absent in `main` | The statement “M2 was merged into main” is **not true of the currently retrieved remote HEAD**; do not merge the 99 commits without separate authorization |

GitHub `main...source` comparison reported 99 commits and M2/v2 file additions; no upstream product commit is missing from this feature branch at the moment of inspection. Recheck both refs before D1 because active work may advance. Preserve `main` and legacy `app.html` untouched.

### Canonical-main contract delta

- `site/app.html`: **267 static `id=` declarations / 267 unique IDs / zero duplicate IDs**, counted directly against the current `main` and matched to the requested source branch. The M0-generated `CONTRACT.md` / `contract.json` describe **259** static IDs, **205** dynamic classes, **843** dynamic operations, **56** dynamic ID declarations and **5** unresolved operations at older `fbbb2f9`. Those dynamic totals **have not been recalculated** against current main.
- Eight new static IDs are present: Lift-off `liftoffTargetRow`, `liftoffTargetLayer`, `liftoffTargetHint`; Diagnostics `geometryDiagnosticsPanel`, `geometryDiagnosticsTitle`, `diagnosticsAnalyzeBtn`, `diagnosticsStatus`, `diagnosticsResults`. `site/controllers/process-panel-controller.js` owns sacrificial target selection and Apply validity; `process-recipe-controller.js` owns its editor mapping; `process-diagnostics-controller.js` owns analysis Worker/read-only status and dynamically rendered reports. None is represented by a functional v2 production adapter yet.
- Recent main contains the full-array TiO2 metalens Welcome source: `site/bundled-examples.js` points to `examples/tio2-metalens-full-array.wafercad`. See `docs/TIO2_METALENS_PERFORMANCE_2026-10-10.md`: 4725 device sites, 6400 tiles, 60232 Mask polygons, nine Recipe steps, 10 restorable History nodes, 6 bookmarks. This scale should enter D3/D5/D6/D8 and M4 acceptance. Its compiled-grid renderer check is **not** equivalent to full-array Recipe Run All or universal wafer-scale FPS.
- Existing main controllers and `app.html` are identical between `main` and the source branch; the delta of concern is **post-M0 product additions**, stale generated inventory, and the fact that the M2 feature branch is not on main. A full AST regeneration is pending an executable checkout.

## 2. Shell / owner / lifecycle audit

Three entry paths are currently distinct:

1. `site/app.html` + `site/app.js`: legacy **real** product. `app.js` constructs controllers, `createWorkstationUiController` initializes synchronously, `bindUi` attaches once, renders/restores, then performs legacy-specific self-checks. It assumes legacy parent DOM / ID order.
2. `site/app-v2.html` + `site/ui-v2/mock-workspace.js`: real M2 presentation behavior with **mock** actions/fixtures, not real Process, Mask, History or Recovery.
3. `site/ui-v2/app.html` + `production-workspace.js`: M2.5 production-safe **empty shell**, with unconnected domain adapters and no real product bootstrap.

Existing building blocks: `shell-registry.js` owns declarative slot names; `workstation-v2.js` creates stable `panel.project/base/mask/process/history` (Base under Project) and `panel.process.{step,recipe,code,diagnostics}`; `view-panel.js` owns `view.{main,mask,three,section}.{header,actions,stage,readout,overlays}`; `domain-adapters.js` exposes `register/prepare/show/hide/destroy`; `overlay-manager.js` is intended portal owner. Confirm four scientific hosts by **runtime node identity**, not by DOM inventory alone.

**Required ownership model for M3:** create shell hosts *before* the first legacy controller DOM lookup; only one production adapter owns the lifecycle of each content subtree and binds its event callbacks; presentation shell owns navigation/layout only; model, process transaction, Recipe replay, History/Variants, persistence and scientific canvas instances retain their existing owners. Stable panel host and four scientific stage identities must survive mode switches and re-render. Moving a real canvas is allowed if identity/listeners/renderer are preserved; recreating it is not. `workstation-v2.js` uses `root.replaceChildren(workbench)` only on initial mount, while it later replaces navigation / viewbar content; `view-panel.js` replaces action/title nodes; `mock-workspace.js` re-renders mock content. These are **not proof** of stable real scientific child nodes or one-time production binding.

**D1 architectural precondition:** resolve the canonical public `app-v2.html` bootstrap using the production shell/adapters. Do not run both mock and production presenters or mount the legacy workstation in parallel. Preserve both `wafercad.workstation-view-mode.v1` and `wafercad.workstation-split-views.v1` in **sessionStorage**, `html[data-ui=v2]`, and original `app.html`. A route-aware `startup-controller.js` / Welcome transition is reserved to D9; do not implement routing by global string replacement.

## 3. Per-domain real wiring inventory

Legend: **Static** = present legacy controls / proposed v2 named host; **Dynamic** = runtime-created nodes; **State** = authoritative state; **Events/nav** = binding and navigation assumptions; **Transaction callback** = real production effect (never simulated success). Source anchors below identify current product controller files, while `IMPLICIT_DEPS.md` D01–D40 and `contract.json` describe the historical M0 baseline.

| Domain | Static controls and destination | Dynamic DOM / conditional state | Real state, events, navigation and callback ownership |
| --- | --- | --- | --- |
| **D1 Views/chrome** | Four legacy panels/canvas, per-view Fit/Pan/Zoom/More/Max/Export → `view.*.actions/stage` | Overflow moves **original buttons** using placeholders; `details[open]`, `aria-expanded`, panel mode, split slots and maximize classes | `view-toolbar-controller`, `view-popover-controller`, `view-maximize-controller`, `workspace-actions-controller`, `main-canvas-controller`; resize/focus/document pointer, sessionStorage view state; resize renderer and restore active tool, **no duplicate bindings**; preserve ROI pointer coordinates |
| **D2 Mask** | `gdsInput`, `sampleMaskSelect`, mask transform, `maskCanvas`, `maskRoiEditor`, Draw controls, export selection → `panel.mask` + `view.mask.stage` | `mask-browser-controller` rebuilds recursive Cell / layer rows; `draw-mask-controller` builds selected-shape field rows and polygon points; export builds Cell/Layer options | `mask-import-controller`, `mask-browser-controller`, `draw-mask-controller`, `mask-roi-controller`, `export-controller`; source File/Draw, stable Cell/Layer IDs, transform, geometry/units, independent Mask ROI; pointer capture/caret propagation; real parse/save worker and SVG/GDS/OAS export |
| **D3 Project/Export** | Project name/new/open/save/export, Recovery/select, writer lease/takeover, Base → `panel.project/base` + `status.save` | Confirmation/dialog, Recovery options, save-state/status, project file selectors | `project-state-controller`, `workspace-persistence-controller` (**read-only**), `workspace-session-controller`, `base-controls-controller`, `confirmation-dialog-controller`; dirty/saved/lease/recovery states; Project/Welcome navigation; real transactional import/export, rollback and stored checkpoint. No spontaneous Recovery creation on history-only preview |
| **D4 Process + Diagnostics** | `operationType`, `operationArea`, `liftoffTargetLayer`, `applyOperationBtn`, diagnostics IDs → `panel.process.step/diagnostics` | Operation/profile-specific fields and guide, target lists, busy/progress/abort dialog, diagnostics generated metrics/findings and stale status | `process-panel-controller`, `workspace-actions-controller`, `process-task-controller`, `process-diagnostics-controller`; operation form validation, sacrificial layer, materials; exactly one Apply → one committed Step, reject/Abort leaves model/History unchanged; real worker results, diagnostic analysis read-only |
| **D5 Recipe** | Recipe/Code tabs and steps, Run All/Continue/Rebuild/Stop, edit/schema/mask context → `panel.process.recipe/code` | `process-recipe-controller.initMarkup` writes HTML guarded by `dataset.ready`, `renderEditor` and `renderSteps` replace children; `.recipe-step-row` DOM order used during running | Stable Step IDs, persisted Recipe, unapplied validation drafts and undo/redo, parser and code round-trip; real `process-recipe-controller` replay/snapshot/run prefix; explicit Continue/Rebuild confirmation and rollback; coordinate Process/History without rebinding |
| **D6 History** | Snapshot/Variant/bookmark tree and row More/Edit → `panel.history` | `project-controller.renderSnapshots` rebuilds nested Variant→origin Step→child Variant, bookmark and rename editor, `dataset.stepId/variantId`, `is-restorable` | `project-controller`, `history-mutation-controller`, `workspace-snapshots.js` (**read-only**); stable node lineage; restore/edit/replay/branch transactions; Edit currently navigates by legacy `.workstation-rail-button[data-tool=process]` click in `app.js` — replace with explicit v2 navigation callback; menu events stop parent row restore |
| **D7 Section + Legend** | Section A/B coordinates, scale, Z break (physical µm, Snap), detail ROI, legend → `view.section.stage/overlays` with legend owned by Section | Native collapse dialog may reparent to `body`; draggable handles / inset; layer legend rebuilds material/annotation rows, names, visibility/profile/color | `section-controls-controller`, `section-collapse-controller`, `section-detail-roi-controller`, `layer-legend-controller`; Section edit/snap/linked scale, independent Detail ROI, physical Z, model-owned material colors; DOMRect and pointer-capture exactness; edits mark appropriate view/project dirty |
| **D8 3D** | Fast/Quality, Border, opacity, Fit, GLB/PNG controls → `view.three.actions/stage` | Renderer canvas/scene and export progress/fallback presentation | `workspace-actions-controller`, `three-view.js` (**read-only**), `export-controller`; retain single WebGL instance, scene/geometry ownership, fallback without WebGL, real GLB/PNG; validate full-array mode and frame-specific transparency |
| **D9 Welcome/status** | Welcome cards/tabs/3D explore, GDS/project/example open, topbar status → entry + `status.*` | `welcome.js` cards/previews/thumbnails; staged open, project status/Recovery prompts | `welcome.js`, `startup-controller.js`, `workspace-persistence-controller` (**read-only**); `app.html?start=...` is hardcoded in old routing; new v2 path must preserve staged start, URL cleanup, single-use startup files, responsive preview and saved/lease status |

**Dynamic inventory that must be verified in running v2, not assumed from id count:** Mask Cell recursive tree / Layer rows / shape edit fields; Recipe init/editor/step/error badges; History Variant tree/menus/bookmarks; Section Legend and dialogs; Welcome cards/previews; Confirmation and Process task dialog. Each requires proper owner-controlled subtree update, identity, focus, state, and no double action.

## 4. Risk-to-test handoff, in domain order

| Gate | Essential focused proof before approval |
| --- | --- |
| D1 | Single/Overview/Split and Section dock; 1440/1024/768/390; overflow 768/320, Escape/outside/focus/`aria-expanded`; original button identity; resize & real pointer DOMRect/ROI 0.25px gate; console zero |
| D2 | GDS/OAS import including nested Cell/Layer; original Cell identity; all Draw tool gestures + selected numeric shape edit; independent Mask ROI; actual SVG/GDS/OAS re-import |
| D3 | Save/export/open, refresh Recovery, two-tab lease/takeover, broken file rollback, Base Keep/Clear/Cancel; full-array Welcome example opens without duplicating History |
| D4 | Lift-off sacrificial target and disabled empty state; Etch CMP absolute Z/All exposed, Implant/Electrical units; one Apply=one Step; abort/error rollback; diagnostics stale/array caveat |
| D5 | Run All, Run to Step, Code parse, snapshot autosave, targeted invalid Step repair, Continue/Rebuild, sub-grid thickness in µm/nm/mm, full-array source vs compiled grid caveat |
| D6 | Restore then Edit then Variant branch then return HEAD; stable cursor/origin; rename/bookmark; no restoration via More menu bubble; 4725-site History responsiveness |
| D7 | Z Break snap/unit/linked scales, Section A/B and detail ROI pointer geometry, material/annotation legend edits, Section collapsed and narrow screens |
| D8 | Fast/Quality, Border/opacity correct next frame, GLB/PNG physically correct, WebGL fallback, persistent scene/array renderer perf diagnostics |
| D9 | Seven+ cards from current catalog including TiO2, all four preview tabs, Explore 3D, staged project/GDS and example start, v2 URL retained, status reflects real save/lease |

Each domain requires real scenarios + M1.5 visual comparison at four widths, no page/console errors, preserved legacy test results, `check-m2-shell.mjs` and contract/ESLint/docs checks. This inventory does **not** mark any domain accepted. The older draft cites 58 shell checks; later validated source documentation records **60** at product `9a43d0d`. Never silently downgrade these assertions.

## 5. In-scope and blocked changes

- **Allowed now:** documents-only M3 source delta audit; no production connections, no visual baseline creation, no merge into main.
- **Before D1 coding:** user approves this checkpoint. Record fresh remote `main` and branch hashes and the D1 rollback commit. Restore runnable checkout; run `npm ci`, `node scripts/ui-contract-extract.mjs --write` plus `--check` on an authorized change branch; inspect generated diff and make sure the authoritative main additions and 5 unresolved dynamic expressions are covered. Execute `node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs`, `node scripts/v2/check-m2-shell.mjs`, `npm run lint`, `npm run docs:check`, legacy owning suites and new D1 real browser cases. Record environment, exact output and screenshots without creating approved baselines.
- **Read-only:** `site/model*.js`, `process-*.js`, `project-*.js`, `workspace-snapshots.js`, `workspace-persistence*.js` (including controller), `three-view.js`, `plan-renderers.js`, `gds.js`, `oasis.js`, workers and vendor. Any needed changes must first enter `ISSUES.md` with approval.
- **Current environment limitation:** connected GitHub API can read source, compare refs and commit documents, but the isolated local coding workspace was unavailable. **No `npm ci`, AST regeneration, shell browser tests, visual captures, lint or docs:check were run for this new audit commit.** Previously documented test results are historical evidence only.

## 6. Decision checkpoint

1. Keep `codex/ui-v2-m3-main-audit-20261010` on top of `e706f38` until D1 authorization. Do not fast-forward `main` merely to make documentation claims true.
2. Before wiring, resolve the public v2 bootstrap topology: prefer `site/app-v2.html` as the eventual stable public route with real production adapter, while `site/ui-v2/app.html` remains an explicit isolated shell fixture. Retain a separate mock/gallery route through D1; this is a **proposal**, not a code change.
3. Once the source audit and its explicit runtime/tooling limitations are accepted, request a separate **D1 authorization**; proceed one domain at a time.

Cross-reference: [M0 implicit dependencies](IMPLICIT_DEPS.md), [original contract](CONTRACT.md), [placement audit](PLACEMENT_MAP.md), [legacy browser comparison](LEGACY_BROWSER_COMPARISON_2026-10-10.md), [M3 issue delta](ISSUES.md).
