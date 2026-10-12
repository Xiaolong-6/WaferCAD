# UI v2 Stage C local WIP handoff — 2026-10-11

## Status and revision

This is a pushed **WIP checkpoint**, not completed Stage C or product acceptance. Development stopped at the user's request; the user then explicitly requested committing and pushing the handoff. Continue on `codex/ui-v2-main-wip` only. Keep PR #177 Draft; do not merge or run expensive manual Actions.

The product parent revision is `2dd2f345cc9997dc14bae2b73b4fe12cf61cdcb2`. The commit containing this document is the handoff revision (`git log -1 --format=%H -- docs/ui-v2/LOCAL_STAGE_C_WIP_HANDOFF_2026-10-11.md`). Fetch confirmed the remote branch matched that parent before publishing. The new sync report records the parent HEAD, but tested the working-tree changes included in this checkpoint; it is not evidence for the unchanged parent alone.

PR: `https://github.com/Xiaolong-6/WaferCAD/pull/177`.

Local integrated page: `http://127.0.0.1:4182/app-v2-workstation.html?example=metalens`.

Automatic review preview: `https://xiaolong-6.github.io/WaferCAD/preview/app-v2-workstation.html?example=metalens`. It remains the preceding deployment until this push's automatic preview finishes. No deployment success is claimed here.

## Latest user decisions

- Preserve the M2 forms and layout when wiring real functionality. Do not replace them with legacy form layouts. Next session should first compare the local page with the M2 reference and resume the user's step-by-step visual review.
- M2 Manual order: Manual / Recipe / Code / Diagnostics tabs; Operation; Material / target; Thickness / depth with minus/plus; Layer name; Coverage; Active face; Area; Also add to Recipe; Input unit; wide Apply plus form Undo/Redo; operation guide; region/layer count and View results footer.
- **Material semantics are pending separate review.** The user's answer was “先保留此字段，单独 review 材料语义”. Keep the Material / target field; do not invent a material-to-layer-name mapping or extend the schema. The Deposit/annotation material preview is currently disabled. Existing actual target selectors for operations such as Grow/Etch retain their controller behavior. A separate material comparison review HTML has not yet been prepared.
- Project owns Recovery Save/Restore and XYZ display/input units (nm / µm / mm). Stored geometry remains physical µm.
- Main title owns the Front/Back view button. It stays visually neutral and changes its icon with orientation. **Process Active face is independent**: changing Main orientation must not change the Process target face, and vice versa.
- Layers button selection follows the actual panel open state and persists through reload. History restore must not overwrite this UI preference.
- Annotation Depth profile is a direct two-state Follow offset / Smooth icon control; no extra dropdown.
- Compact icon controls, direct binary toggles, and one Export menu entry remain preferred. Do not reintroduce settings menus for individual binary controls.

Earlier accepted preferences remain in force: wide default Overview; Mask Source before Draw, icon-only and direct File/Draw toggle, Draw source forces Draw selected; 3D Rotate/Pan mutually exclusive for left drag while wheel Zoom is independent and pinch retained; Section Pan/Zoom coexist with momentary Fit; one Z Break button and checkbox in its float; direct XZ Auto/1:1 icons; rectangular Section ROI drawing/moving/resizing/clearing; ROI before the separator, then Layers and Export; right-aligned layer checkboxes; inline rename with presentation-only color focus in the views; palette closes promptly and every Random selection generates a new palette. Section SVG is real; PNG remains disabled pending implementation. Preserve existing export cancellation via the shared task manager.

## Included implementation

The page uses one shared runtime/model and reuses existing controllers, Section compositor and the existing Three renderer. No legacy `app.js` startup, copied whole legacy DOM, second renderer, Kernel/model/worker/schema change, or approved visual baseline update is included.

| Files                                                                           | Responsibility                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `site/ui-v2/workstation-workflow.js`, `workstation-workflow.css`                | New v2 hosts for existing Process, Recipe, Diagnostics, Project, History mutation, session and persistence controllers; shared task/cancellation and confirmation; M2 Manual form order and form draft Undo/Redo |
| `site/ui-v2/project-mask-panels.js`                                             | Real Project New/Open/Save/Export, Base lifecycle, Mask import/browser/alignment and display units                                                                                                               |
| `site/ui-v2/workstation-runtime.js`, `workstation-entry.js`                     | Shared History capture/restore, cross-view invalidation, workflow startup/status, local Layers preference and shared task integration                                                                            |
| `site/ui-v2/workstation-v2.js`, `site/app-v2-workstation.html`                  | Actual Split view choices and workflow styles/generated guide integration                                                                                                                                        |
| `site/ui-v2/view-kit/display-units.js`, `inspection-fields.js`                  | Display/input unit conversion helpers; physical storage unchanged                                                                                                                                                |
| `site/ui-v2/main-runtime.js`, `main-view.js`, `mask-runtime.js`, `mask-view.js` | Shared unit formatting/parsing and independent Main view orientation                                                                                                                                             |
| `site/ui-v2/section-view.js`, `view-icons.js`                                   | Layers selected-state persistence, direct Depth profile controls, unit-aware inspection fields and icons                                                                                                         |
| `site/ui-v2/three-view.js`                                                      | Uses the same workflow task for real export and cancellation                                                                                                                                                     |
| `site/controllers/workspace-persistence-controller.js`                          | Optional explicit-start callback argument; preserves the legacy default                                                                                                                                          |
| `scripts/v2/check-sync.mjs`                                                     | New real operation sequence for shared state, independent ROIs, Process/History/Recovery, IO and layouts                                                                                                         |
| `scripts/v2/check-review-interactions.mjs`                                      | Layers preference and direct Depth profile regressions                                                                                                                                                           |

Process face currently lives in the workflow as a transient input preference, default Front. Main orientation retains the existing project `activeFace` field. Process operations record their actual face through existing scientific contracts; persistence of this new transient input choice has not been established.

Relative to takeover `1664405ef7835a3e974a8551f19c8879186255bf`, legacy product edits total **45 added/deleted lines of the 100-line budget**: Section collapse controller +8; legacy Three renderer +35; workspace persistence controller +1/-1. This checkpoint adds only the last two legacy lines. v2 files and test/docs additions are counted separately. Do not silently consume the remaining 55 lines.

## Local validation actually performed

Environment: Windows, Node 24.16.0, npm 11.17.0, locked Playwright 1.55.1 / Chromium 140.0.7339.186, Three 0.179.1. Dependencies were installed using `npm ci` earlier in this session. Legacy server 4174 and v2 server 4182 were running; preserve the user's dev servers.

```powershell
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
npx eslint site/ui-v2
node scripts/v2/check-sync.mjs
```

Both passed on the latest functional working tree before the handoff. Sync exited 0 at 1440 / 1024 / 768 / 390 and a 1024 `hasTouch` context. It establishes:

- shared model identity, three distinct ROI domains, real Main ROI clipping in 3D and Slice-to-Section recomputation;
- actual Mask-constrained Deposit geometry: area 1 µm², exact 0.125 µm thickness, inclusion outside Main ROI but inside Mask ROI, exclusion outside Mask ROI;
- separate Process front/back operations, Main orientation independence, real model Undo/Redo and History restore/return to HEAD;
- Layers preference preserved during restore, actual visibility updates, unit changes preserving model/ROI values;
- at 1440, strict Project export/read/Open, Save checkpoint/Recovery Restore, Base Keep/Revert, actual GDS import and Mask alignment, exact 0.35 nm Recipe film and read-only Diagnostics;
- real Split/Overview layouts, overflow and Main canvas/host agreement within the unchanged 0.25 px limits.

WebGL renderer: ANGLE/Vulkan **SwiftShader software WebGL**, not physical GPU. The `hasTouch` sync case still performs mouse operation sequences; it does **not** establish real touch-gesture or physical touchscreen acceptance.

Earlier during the session, `node scripts/v2/check-review-interactions.mjs` passed its five viewport/context cases and Electrical controls, and `node scripts/v2/check-section-view.mjs` passed four widths plus touch. These runs preceded the latest unit/Main-face/M2 Manual changes and are not final coverage of this checkpoint.

Local ignored artifacts: `test-results/ui-v2-sync/report.json`, `sync-1440.png`, `sync-1024.png`, `sync-768.png`, `sync-390.png`, `sync-1024-touch.png`, `depth-direct.png`; `test-results/ui-v2-review-interactions/report.json`; `test-results/ui-v2-integration/stage-c-section.log`. Early `failure.png` is stale. These artifacts do not transfer automatically; this committed validation summary is the portable evidence. No approved screenshots or baselines were replaced.

Before publishing this checkpoint, `npm run check` passed (exit 0): full ESLint, Prettier, documentation checks and **612/612 Node tests**, no failures/skips. The handoff check corrected an unqualified `matchMedia` browser reference in the new sync test to `window.matchMedia` and added this document to the documentation map. Log: `test-results/ui-v2-sync/handoff-check.log`. No product behavior or assertions changed during handoff preparation.

Legacy browser gates and final Main/Mask/Section/3D owner reruns were **not completed after the latest functional changes**. Latest M2 Manual visual acceptance has not happened. CI green or a successful Pages deployment would not complete product acceptance. PR #177 was verified Draft on `codex/ui-v2-main-wip` immediately before this handoff push.

## Open issues and next session

1. **First resume M2 visual review with the user.** Manual was reordered toward the screenshot but has not been accepted. Avoid broad unreviewed UI changes. Present the Material semantics comparison separately; leave its field in place until a decision is approved.
2. Audit all display-unit edit paths before declaring units complete. In particular, an already-open polygon Draw textarea and some manually constructed Mask shape fields may retain old display-unit values across a unit switch. Applying them could parse those values using the new unit. Test switching units while editors are open, then Apply, Recipe, export/read and restore; assert exact physical geometry. Existing test covers unit switching/model invariance, not this entire matrix.
3. Inspect Project Base hidden bridge controls. The browser accessibility tree exposed legacy Rectangle/Circle controls and a disabled Height even when the adapter sets `hidden`; existing flex CSS may override hidden styling. This is suspected, not a verified/fixed visual result.
4. New Manual form draft Undo/Redo and the thickness stepper lack their own completed interaction coverage. Distinguish form undo from real History model Undo/Redo.
5. Runtime source/hash metadata still describes the initial example after another project is restored; assess presentation accuracy without changing stored geometry/schema.
6. Run the owning local gates after review/fixes. Keep 0.25 px assertions and baselines intact. Add actual touch gesture coverage and clearly separate software WebGL from hardware GPU evidence. Large M3D/full-workflow paths remain unverified at this checkpoint.
7. Remain on the same WIP branch, preserve concurrent changes, and fetch before any integration. Do not reset away this checkpoint or apply the old superseded local Stage B stash. Browser IndexedDB/Recovery and screenshots are not repository state; use an exported project for a reproducible user scenario. Do not overwrite the user's existing workspace or lease while reviewing.

Read `AGENTS.md`, `docs/COLLABORATION.md`, `docs/DEVELOPMENT.md`, `docs/testing.md`, the original five takeover documents, and this handoff. Older static `UNCONFIRMED` audits and dated CI claims remain historical context. Stage C includes Project and Mask wiring; it is not a deferred extra stage. The final acceptance still requires the user to operate **one integrated four-view page**.
