# UI v2 Issues and Decision Boundaries — M0

Baseline `fbbb2f9f3a585574e20ed706c34653164f13440c`. M0 changes neither product source, scientific core, Workers, persistence nor approved visual baselines. Items below were registered for review; they did not authorize any core changes.

| ID | Finding | Proposed treatment / decision point | Status at M0 |
| --- | --- | --- | --- |
| I01 | The plan called `wafercad.workstation-view-mode.v1` / `wafercad.workstation-split-views.v1` localStorage keys. Source actually used **sessionStorage**, surviving refresh but not guaranteeing persistence across ordinary sessions. | Preserve existing keys and sessionStorage semantics by default. Switching to localStorage requires explicit approval, migration and cross-tab tests before M2. | Semantics awaiting confirmation; no M0 write. |
| I02 | `app.js` immediately assembles Workstation during construction. Its startup self-check hardcodes legacy class/rail/stage; `workstation-ui-v2` historically belongs to legacy. | v2 needs a separate factory and `data-ui`-specific startup guard, creating the shell before controller ID lookups. Never globally replace legacy assembly. | Located; M2 scope. |
| I03 | `startup-controller` also hardcodes `app.html` in `history.replaceState`. | In M3 Welcome, use an injectable entry or separate v2 adapter to preserve the new URL; modifying `welcome.js` alone is insufficient. | Permitted UI controller area; unchanged. |
| I04 | History Edit Step navigates through a legacy rail selector in `app.js`; Recipe writes `innerHTML` inside bind and guards with `dataset.ready`. | Explicit navigation callbacks and component creation, preserving History/Recipe transaction APIs. Let M1.5 compare Recipe as a top-level workspace versus Process mode. | Awaiting M1.5/M3. |
| I05 | Section Z Break moves its original dialog to the body top layer; `viewPopover.closest(view-panel)` then fails, and the dialog is reattached on close. | Unify popup ownership/focus lifecycle in v2, keeping showModal/close and Section collapse entry; do not change physical Z. | Awaiting M2/M3. |
| I06 | PR #161 CI reported a 1.7857 px Main/3D ROI vertical offset. Canvas layout changes affect all DOMRect-based coordinate paths. | Preserve strict pointer-alignment assertions in M3 and diagnose before any change. If read-only `plan-renderers`/`three-view` require edits, report first; do not make incidental scientific changes. | Failure proven; root cause not independently reproduced. |
| I07 | The read-only scope `workspace-persistence*.js` includes `controllers/workspace-persistence-controller.js`. | Treat recovery, writer lease and safe reload as read-only transaction services; connect through adapters/DOM contract. Ask before changing binding in that file. | No core modification approved. |
| I08 | AST analysis can record literal class names, but variable/helper/template interpolation and dynamic `input.id` prevent a complete runtime inventory. | Record unresolved expressions and verify runtime samples for each migrated domain. Static coverage of 259 IDs is insufficient. | See `contract.json` unresolvedOperations. |
| I09 | Legacy single-view set contains Main/Mask/3D only; Section is a dock. Four independent views were present only in Welcome preview. | Prototypes must demonstrate Section combinations, Maximize, Z Break/ROI, while preserving legacy behavior. Any new primary Section mode needs M1.5 review. | Awaiting prototype selection. |
| I10 | Legacy Node tests inspect HTML/CSS/Workstation source, and browser helpers rely on old rail/flyout/ancestor relationships. | Place new scripts under `scripts/v2`, guard their entry, and preserve legacy routes/assertions. Share science/History/recovery checks via adapters without weakening them. | M4 design constraint. |

Product choices needing user approval were concentrated in M1/M1.5: light design system, comparison of two or three layouts, and Recipe placement. M0 did not make these choices. Its only implementation addition was the audit script, not product UI.

## M1.5 / M2 decision update (2026-10-09)

The table above preserves the original M0 audit. See [M2 checkpoint](M2_CHECKPOINT.md) for later results:

- **I01 resolved and implemented:** Retained both source-defined sessionStorage keys, not localStorage; v2 tested defaults, Split deduplication/swap, reload and storage-denial handling.
- **I04 placement chosen:** Layout A with Recipe/Code inside Process. Real transaction adapter and cross-domain navigation still remained M3.
- **I06 checked early in M2:** At 1440/1024 px, mock-shell Main/3D ROI top/bottom drift was 0 px (0.25 px tolerance). Real 3D renderer/pointer ROI acceptance remained M3; no claim that the old CI root cause was closed.
- **I09:** Retained Section dock; narrow-screen Section access does not add legacy persisted view-mode values.
- **I08:** Five unresolved dynamic expressions still needed M3 investigation.

## M2 gap self-review

Section Legend acquired read-only material/annotation display and responsive placement; real editing remained M3. Further gaps are listed as G01–G08 in [M2 self-review](M2_GAP_AUDIT.md). At the earlier point described by the original note, History was still flat, Manual lacked Extend/consistent Etch categories, and Tilt lacked negative values. These unfinished UI elements could not be counted as covered. A passing M2 browser check did not replace full-workspace acceptance. The user permitted a local commit and review stop, not M3.

## New D1 acceptance item (2026-10-10)

| ID | Finding and risk | Requirement | Status |
| --- | --- | --- | --- |
| I16 | D1 committed a separate real-view assembly experiment at `app-v2-real.html`: existing DOM/canvas/controllers reused, with one `app.js` bootstrap under the v2 marker. A working workspace ran Chromium, software WebGL, Main pointer ROI, four-width screenshots and legacy regression, repairing visible layout, Single refresh, Section readout and keyboard focus. Full geometry, shared toolbar/portal and approved-platform visuals had not passed; native view-head was not yet the final shared chrome, and `app-v2.html` stayed mock. | Execute `scripts/v2/check-d1-real-views.mjs` plus original regressions; verify regenerated inventory, four-width images, real pointer/ROI ≤0.25 px, keyboard/focus popovers, complete 3D frames; fix and rerun before considering mock-entry replacement. See [D1 execution](M3_D1_EXECUTION_2026-10-10.md). | **P1 / Partial runtime gate only; D1 not accepted, D2 must not start.** |

## Pre-M3 latest-main audit differences (2026-10-10)

The [M3 latest-main audit](M3_MAIN_AUDIT_2026-10-10.md) includes per-domain tables for static controls, dynamic generation, state, events/navigation and real transaction callbacks. The initial round was documentation-only; later executable pre-wiring audits, generated inventories and test-script repairs ran, without product domain wiring. I11–I15 extend the historical I01–I10 ledger and do not grant permission to modify core services.

| ID | Finding and impact | Boundary / acceptance condition | Historical status |
| --- | --- | --- | --- |
| I11 | `main` `site/app.html` had **267/267** unique static IDs (including three Lift-off and five Diagnostics IDs); M0-generated `CONTRACT.md`/`contract.json` still had **259**. Old 205 dynamic classes / 843 operations / five unresolved could not be presented as current. | In executable checkout, run `node scripts/ui-contract-extract.mjs --write` and `--check`; examine new references/dynamic expressions and do not handwrite fabricated AST totals. | **Inventory drift closed:** AST write/check and Chromium passed; 267 IDs, 209 classes, 1,082 operations, 60 dynamic IDs, 14 unresolved (seven legacy); real per-domain wiring still awaited acceptance. |
| I12 | `site/app-v2.html` still ran mock, `site/ui-v2/app.html` was an unconnected production shell, and `site/app.html` was the real product. An independently verified v2 production bootstrap was absent; double-binding or mock data was possible. | Prefer stable `site/app-v2.html` as future production route and retain separate mock/gallery. Define shell-first/single-owner/mount→bind→restore contract; D1 needs runtime verification. No unilateral default entry change. | **P1 / D1 prerequisite**, pending D1 approval. |
| I13 | Source branch `codex/ui-v2-m2-handoff-2026-10-09` at `e706f38` was **99 commits ahead** of remote `main` at `dc2cb2d`; main lacked `site/app-v2.html` and `docs/ui-v2/`. Historical "merged into main" wording was inconsistent with then-current remote state. | Create M3 branch from the specified source branch, do not merge main; recompare remote before each domain and obtain separate integration authorization. | **P1 / Integration fact confirmed; main merge not approved.** |
| I14 | Main had incorporated the 4,725-site TiO₂ full-array Welcome project and Lift-off/Geometry Diagnostics. Giant-array restoration, partial/stale diagnostics, Recipe/History IDs, renderer-ready and full frame added cross-domain contracts. | Add real source-project cases to D3/D4/D5/D6/D8/D9. A compiled full-array grid is not proof of full Recipe Run All; Diagnostics skipped/partial must not be reported as error-free. Keep scientific core/worker/IO read-only. | **P1 / Mapping recorded; M3 runtime pending.** |
| I15 | Initial audit environment lacked an executable checkout, offering GitHub API source reads and reference comparisons only; `npm ci`, AST, Node/browser and visual acceptance could not run. Existing 60 shell checks were historical results, not new evidence. | Obtain an executable checkout before D1; record actual commands, exit codes, browser/OS and inventory deltas. | **Execution gap closed:** npm ci, eight contract tests, 60 shell, 585 Node, legacy browser, lint/docs ran; see I16 for D1. |

### M3 checkpoint discipline

- Historical active branch: `codex/ui-v2-m3-main-audit-20261010`, initial base `e706f38`. Static audit was followed by executable preflight; see the main report §7. D1 began later, with acceptance still open.
- D1 preflight decisions/runtime evidence require reporting and user approval; record a rollback baseline commit for each domain (without tags). Apply the same gate to D2–D9.
- BC-03–BC-08 are covered by their designated M3 domains; do not substitute new mock features or alter approved visual baselines.

### Executable recheck corrections

- I08's five unresolved expressions were the historical M0 count. Later AST found 14: seven legacy and seven v2/prototype. All were assigned to helper/guide owners, still requiring domain-specific runtime scenarios; this was not proof of dynamic migration completion.
- I12: both v2 routes were isolated in real tests; 37 named slot identities and their scientific-stage sentinel children remained stable. The production shell still contained zero canvases and 13 placeholder adapters; no single real bootstrap. See main report §7 for shell-first→services/controllers→bind once→restore/first-frame design.
- I13: refreshed main/source hashes did not change; the audit input HEAD was 102 commits ahead of main (99 source + three audit commits), no merge.
- I15 script repair (historical): `check-m2-shell.mjs` read `document.body.dataset` immediately after CDP navigation before body existed, throwing TypeError. Optional chaining preserved the original ready predicate and all 60 original assertions passed. Only the acceptance script changed.
- Linux headless Chromium results did not replace approved Windows pixels, real hardware GPU or real D1 pointer/canvas/transaction evidence.

### D1 runtime recheck update

See [D1 execution](M3_D1_EXECUTION_2026-10-10.md), *Executable inspection*. AST advanced to 267 IDs / 214 classes / 1,109 operations / 60 dynamic IDs / 14 unresolved; older I11 figures remain as preflight history. I12 gained an isolated real bootstrap without approval to replace mock. I06 covered only Main rectangular pointer round-trip, not real Main↔3D edge alignment or closure of the former CI root cause. Scientific core, persistence and production entry were unchanged.

### D1 extended gate follow-up (`c960107` input)

The new gate was executed and a real 390 px Mask ROI defect repaired: opening it closed its own More ancestor. Original DOM identity and geometry algorithms were kept. Native Fit/Main Pan/Main+Mask Zoom/More/Max toolbar icons gained consistent size/order; real Zoom behavior passed. Generic 3D/Section actions and full M1.5 parity remained open. Section Detail tolerance ≤0.25 px, Z Break native modal/inline Escape/Close/backdrop behavior and reattachment were checked; these did not cover independent physical Z, rotated Mask or every portal scenario. AST: 267 IDs / 215 classes / 1,114 operations / 60 dynamic IDs / 14 unresolved. I16 remained open and D2 unstarted. Exact commands/environment are in the [D1 report](M3_D1_EXECUTION_2026-10-10.md).

### D1 after `096def1` — code pushed; real-browser gate pending

- Added opt-in real Three camera Pan/Zoom via existing `threeView` getters/setters and v2-only UI owner, without duplicating renderer/worker/process/model. Default OrbitControls remained available. New `check-d1-three-gestures.mjs` needed to confirm real camera behavior across four widths on Base/Photodetector/M3D. Static V8 math invariants were checked; **new-HEAD browser/Node tests had not run**.
- Added a Base Section 1:1 X:Z calibration assertion to `check-d1-extended.mjs` using native toggle, original Slice inputs, canvas DOMRect and unchanged 0.25 px tolerance. The expanded gate was **unverified**, including 390 px; scientific compositor untouched.
- I16 blockers remained: no verified real Section Pan/Zoom viewport API; native controller popovers/dialogs lacked a unified v2 portal lifecycle; transformed/rotated Mask, independent Section physical Z and Main↔3D registration, full four-width M1.5 visuals, Windows/hardware GPU evidence and route convergence were open.
- D1 **NOT ACCEPTED**. Historical 585/8/60 and six-fixture browser passes predated these changes. Rerun relevant gates and deterministic AST before any pass claim; no D2, main merge or visual baseline change.

### D1 camera / physical Section runtime inspection (`b44b5d4` input)

The pending status above was superseded by actual reruns. Camera tests exposed a race between `appReady` and a WebGL frame; checks were changed to wait for a complete frame and real camera. Three Pan/Zoom, regression Orbit and capture release after actual drag passed. The new Base physical 1:1 check discovered a **0.42866 px >0.25 px** vertical centering error for a thin Section. A narrowly scoped fix in display helper `section-z-collapse.js` corrected the subpixel height floor of uncollapsed Physical; tolerance/formula stayed unchanged, and four-width reruns measured **0 px**. Auto/collapsed layouts stayed unchanged; owner-suite physical regression added; prohibited `plan-renderers.js`, `three-view.js` and visual baselines were not modified. AST: 267 IDs / 215 classes / 1,116 operations / 60 dynamic IDs / 14 unresolved; Node 586/586, focused 12/12. See latest D1 report for remaining I16 evidence. Section viewport, unified portal, full M1.5/physical/hardware GPU and entry approval were still incomplete; D2 had not started.

### D1 after `8408352`: Section/Pan/Zoom and overlay lifecycle implementation; gate pending

- Wired real Section Fit/Pan/Zoom into the existing compositor using a new display-only `section-view-viewport.js` transform. Source model and Slice geometry stayed in µm; X and Z shared one scale. A pure viewport unit suite and four-width browser action assertions were added, retaining 0.25 px Section tolerance.
- v2 Overlay Manager coordinated native view-detail menus and dialogs without cloning/reparenting scientific controls. Viewport navigation closed hidden owners; no broad legacy `view-popover-controller` rewrite.
- **New-code validation was pending:** Node suite, three Base/Photodetector/M3D browser gates, lint/Prettier/docs/generated AST, embedded ROI/modal/inline lifecycle, screenshot review and hardware GPU. The earlier `8408352` 586/586 and 36 width cases were historical, not evidence for the new HEAD.
- I16 **remained open:** exact full M1.5 visual/functional parity, advanced Section physical profiles, transformed Mask and Main↔3D registration, all native portal/keyboard cases, Windows/hardware GPU, and explicit route convergence. D2/main/baselines were unchanged.
