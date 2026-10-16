# Main architecture health and view-kit extraction

> **Historical design checkpoint (2026-10-11):** The budgets, source paths, missing integrations and approval statements below apply only to the named revision. They do not describe the production Workstation as of 2026-10-16. Consult [Architecture](../ARCHITECTURE.md) and the current `site/ui-v2/` implementation before planning new UI work.

Latest approved stage: behavior-preserving view-kit extraction, based on Main checkpoint 6dfff3b0ac58a9d3af1db550ece1a3629a6e0864. The [extraction checkpoint](#view-kit-extraction-checkpoint) below records the current budget rule, migration, isolation evidence, workarounds and validation. Earlier sections preserve the original Main checkpoint and its historical budget/authorization statements; they do not override the later approval. Mask remains unimplemented and awaits approval.

Date: 2026-10-11. Branch: codex/ui-v2-m3-main-audit-20261010. Product diff base: da37fe4d217d26f23941144908f5abe9d4dc784c. Pre-checkpoint HEAD: 918b4bbcc9cdaaef08b419aebff7441f40c12f3e (the separate verified format-only commit). This report accompanies a local checkpoint; no push, merge, deployment, view-kit extraction or Mask implementation is authorized. Resolve the checkpoint containing this report with `git log -1 --format=%H -- docs/ui-v2/MAIN_ARCHITECTURE_HEALTH_2026-10-11.md`.

## Existing product-file changes

Count additions plus deletions against the fixed product base, including the prior format commit. The count does not reset at this checkpoint. Documentation/tests/scripts are outside this product-code table. Only the Main navigation link in docs/README.md enters this checkpoint; the unrelated M1.5 link, review documentation and capture script remain unstaged.

| Existing product file                       |   Added | Deleted | Changed | Reason                                                                                                         |
| ------------------------------------------- | ------: | ------: | ------: | -------------------------------------------------------------------------------------------------------------- |
| site/controllers/main-canvas-controller.js  |      12 |       2 |      14 | Optional Main-only bind, public Pan toggle, Pan-state callback and Zoom gate; defaults retain legacy behavior. |
| site/controllers/roi-controller.js          |      14 |       2 |      16 | Optional v2 editor sync, Main-only binding and public drawing-tool setter; legacy default binding retained.    |
| site/controllers/view-popover-controller.js |       1 |       1 |       2 | User-approved legacy race fix: closing Opacity must retain More when Export is already open.                   |
| site/ui-v2/domain-adapters.js               |      13 |       3 |      16 | Previously approved format-only change.                                                                        |
| site/ui-v2/mock-views.js                    |      23 |       2 |      25 | Approved Main prototype removal of Ring/Ring sector/Rotation and solid Sector presentation.                    |
| site/ui-v2/mock-workspace.js                |      51 |      27 |      78 | Approved Main prototype field contract and deterministic Main/M3D review route.                                |
| site/ui-v2/real-view-bridge.css             |       4 |       5 |       9 | Previously approved format-only D1 CSS change; no D1 functionality changed.                                    |
| site/ui-v2/shell-preview.js                 |      12 |      12 |      24 | Previously approved format-only change.                                                                        |
| site/ui-v2/shell-registry.js                |       6 |       2 |       8 | Previously approved format-only change.                                                                        |
| **Total**                                   | **136** |  **56** | **192** | **200-line hard cap respected; 8 lines remain.**                                                               |

Reproduce with `git diff --numstat da37fe4 -- site`. Earlier format-equivalence evidence is described in the companion Main handoff: JS AST, CSS ordered rule tree including comments, and rendered Markdown HTML were identical. No app.js, app.html, science/model/worker/IO/schema implementation or approved visual baseline is modified.

## New Main product files

These files are new relative to the fixed base and are counted separately, as authorized. Line count is a maintainability indicator, not an excuse to split files solely to evade a cap.

| New file                           |    Lines | Responsibility                                                           |
| ---------------------------------- | -------: | ------------------------------------------------------------------------ |
| site/app-v2-main.html              |       32 | Main-only route and M2 component/style imports.                          |
| site/ui-v2/main-view.js            |      580 | M2 presentation, tool actions, editable forms and Main-only boot.        |
| site/ui-v2/main-view.css           |      113 | New canvas, handles and approved floating-editor presentation.           |
| site/ui-v2/main-runtime.js         |      213 | Inject real Main/ROI/Slice/Plan/Export public APIs with v2 hooks.        |
| site/ui-v2/main-overlay-manager.js |      143 | Persistent nonmodal editor lifecycle extending the v2 overlay owner.     |
| site/ui-v2/main-touch.js           |       95 | Independently gated single-finger Pan and two-finger Zoom.               |
| site/ui-v2/main-square.js          |       30 | Square constraint over rectangular inspection ROI; no stored shape type. |
| **Total**                          | **1206** | Tests/scripts/docs and standalone design preview excluded.               |

The Main presentation is still large. Reusable interaction/presentation boundaries are emerging, but this checkpoint is not yet a production view-kit. It is appropriate to review Main behavior before extracting those boundaries.

## Legacy-isolation evidence

Run these exact searches from the repository root:

```powershell
rg -n --glob 'main-*.js' 'cloneNode|importNode|DOMParser|real-view-bridge|#focusEditor|#roiEditor|#maskCanvas|\.view-panel' site/ui-v2
rg -n --glob 'main-*.js' '(import|fetch|require).*app\.(js|html)' site/ui-v2
```

Both returned no matches (rg exit 1, its normal no-match result). A comment mentioning that app.js is not booted is not an import. The new modules use M2 `el`, `button`, `field`, `select`, `toolbar` and view-panel factories. Canvas/controller IDs are assigned to those newly created nodes; the hook Map supplies detached v2 field hooks where an existing controller requires them. No legacy page is fetched or parsed, and no legacy controls are copied/reparented/cloned.

Static searches are evidence, not a complete transitive runtime proof. The Main browser harness additionally checks resource entries for app.js/app.html boot, zero legacy `.view-panel` nodes, one scientific canvas, zero duplicate IDs and an unchanged loaded scientific model. It compares the same full M3D source/hash and authoritative 27-layer/551-region caption to M2. These runtime checks are required before committing the checkpoint; final gate outcomes are recorded below. Reuse of legacy-named controller hook IDs does not mean reuse of legacy DOM nodes.

## Workarounds and reasons

| Workaround                                  | One-line reason and exit path                                                                                                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Main-only entry and manually injected state | Load the validated M3D model without starting the full legacy UI/persistence path; replace with an approved project-state provider when Project is implemented.                  |
| Hook Map plus document-backed v2 root       | Existing public controller factories require specific IDs; newly built v2 controls supply those hooks until adapter ports are formalized.                                        |
| No-op Mask/Section rendering callbacks      | Main-only factories accept cross-view dependencies; keep other renderers unbooted until their independently approved integration.                                                |
| Optional ROI editor-sync callback           | Existing editor synchronization is DOM-bound; route authoritative ROI data into v2 fields without reusing the legacy editor.                                                     |
| Main overlay-manager extension              | Shared v2 popovers dismiss outside clicks and dialogs are modal; the approved editors need persistence, drag and focus/Escape ownership without changing the shared service yet. |
| Document-level Main action delegation       | Floating panels live outside app-root; the Main route handles their v2 actions without introducing another legacy event path.                                                    |
| Touch capture plus pointercancel for drafts | Pinch must cancel an uncommitted one-finger ROI/Slice edit before navigating; preserve the existing controllers' cancellation/restore behavior.                                  |
| Square stored as rectangular ROI            | The existing inspection type supports physical rectangle geometry; constrain equal sides in v2 instead of adding science/schema types.                                           |
| UI-only 0.0001 micrometre formatting        | Provide 0.1 nm position/size display and typed input without rounding loaded geometry or pointer projection.                                                                     |
| Existing SVG exporter with deferred PNG     | Reuse the real export API while retaining the previously approved Main-only PNG boundary.                                                                                        |
| Main-scoped reuse of M2 Mask strip classes  | Match the existing strip appearance now; remove per-view presentation duplication through the single proposed view-kit strip.                                                    |

## Proposed view-kit split — design only

User decision: **Mask Draw and Main ROI share one component and one stylesheet.** Both remain visible while their toolbar owner is selected, use icon-only buttons with hover hints, divider-separated groups, and a final settings button opening a persistent nonmodal floating panel in the same style as Main Slice/ROI settings. Differences between views are configuration only: tools, groups and settings fields. This is a requirement for the next approved extraction, not authorization to implement Mask now.

| Proposed boundary                                 | Responsibility                                                                                                                                     |                          Expected new-module size |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------: |
| view-kit/floating-strip.js + floating-strip.css   | One renderer/style for owner selection, configured groups, tool states, dividers, responsive wrapping, hints and final settings entry.             |                            100–160 JS; 60–100 CSS |
| view-kit/floating-editor.js + floating-editor.css | One persistent editor lifecycle/style for drag, bounds, close, Escape, focus return and coexistence with menus; absorb Main's temporary extension. |                             140–190 JS; 60–90 CSS |
| view-kit/inspection-fields.js                     | Declarative fields/groups, precision, validity and unit labels; no geometry computation or schema ownership.                                       |                                         80–130 JS |
| view-kit/plan-gestures.js                         | Independent Pan/Zoom ownership for planar views, touch cancellation and zoom-anchor dispatch through per-view ports.                               |                                         90–130 JS |
| Main/Mask-specific configuration and adapters     | Configure supported tools/fields and call existing controller APIs; keep controller/model state out of generic presentation.                       | 60–100 config and 150–230 adapter per planar view |

Proposed floating-strip configuration has an owner button, selected/available state, tool groups, per-tool IDs/icons/hints, action callbacks and final settings descriptor. The component owns visibility, layout and accessibility; callbacks dispatch to the view adapter. Settings fields are descriptors consumed by the same floating-editor/field components. Main's intermediate Slice settings button is configured within its Slice group; the final button remains ROI settings. No parallel Main/Mask strip implementation or CSS forks are permitted.

Do not generalize planar gesture semantics blindly to 3D: 3D controller ports and gestures must be audited at that view's stop. Section persistence/schema changes remain a separate PR. Project is the first left-panel integration after all view approvals.

## Mask contract audit — read-only

Actual controller: site/controllers/draw-mask-controller.js; current legacy tool markup: site/app.html:452 onward; M2 drawing-strip configuration: site/ui-v2/mock-views.js:161 onward. The controller's pointer path explicitly supports `rect`, `circle`, `ring`, `ring-sector`, plus its separate vertex-based polygon path. Null tool means Select with hit testing, move and resize.

| M2 item           | Legacy capability                                                                    | Proposed contract resolution                                                  |
| ----------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Select            | Null tool; select/move/resize actual selected shape.                                 | Keep.                                                                         |
| Rectangle         | `rect` drag creation and editor.                                                     | Keep.                                                                         |
| Circle            | `circle` drag creation and editor.                                                   | Keep.                                                                         |
| Polygon           | Vertex clicks; first-point closure, double-click or Enter completion; vertex editor. | Keep with the real completion gestures.                                       |
| Ring              | `ring` drag creation and radii editor.                                               | Keep.                                                                         |
| Ring sector       | `ring-sector` drag creation and radii/angle editor.                                  | Keep.                                                                         |
| Add preview shape | M2 manufactures a mock shape; the legacy controller creates via drawing gestures.    | Remove from M2 contract under the user's rule.                                |
| Delete last shape | M2 deletes the last mock item; legacy deletes the selected stable ID.                | Change M2 to Delete selected; disable when no selection.                      |
| Clear Draw shapes | Existing clear confirmation and normalized empty drawing state.                      | Keep through the same confirmation/controller behavior.                       |
| Final settings    | Existing selected-shape editor for coordinates, dimensions, vertices/radii/angles.   | Show the shared nonmodal editor; disable until an editable shape is selected. |

No unresolved Mask case requires a question at this audit stage. Do not add Main Square or solid Sector to Mask merely for cross-view symmetry: they are not the audited Mask tools. Unsupported M2 items must be removed from the M2 contract, not implemented by changing science code. Only the proposal is updated now; Mask prototype/controller/product files remain untouched in this pass.

The Mask controller currently owns legacy editor construction and privately holds setTool/applyEditor/removeSelected. Future integration needs additive public ports and an optional v2 editor-sync callback, preserving default legacy behavior and stable IDs. It must not intercept and restyle the legacy-generated controls. Its source-mode synchronization also needs a presentation hook so hiding the floating strip does not silently switch the File/Draw source or erase drawing state.

## Proposed existing-file budgets — require separate approval

The current cumulative cap remains 200 lines against da37fe4, with 192 consumed. The following are requested planning ceilings for later approved work, not permission to reset that count or spend these lines now. Count additions plus deletions, including formatting, and stop before exceeding the approved total.

| Stop                       | Proposed existing-file ceiling | Expected changes                                                                                                                |
| -------------------------- | -----------------------------: | ------------------------------------------------------------------------------------------------------------------------------- |
| Current Main checkpoint    |     200 cumulative; actual 192 | Existing optional controller hooks, approved prototype changes, verified formatting and approved legacy race fix.               |
| Shared view-kit extraction |                             40 | Additive shared-overlay/component hooks and one style integration; new Main modules can migrate only after extraction approval. |
| Mask                       |                             40 | Public drawing/editor ports plus optional UI-sync callback; no science/model/worker/IO/schema edits.                            |
| 3D                         |                             60 | Additive public controller ports after auditing real interactions; no renderer/science rewrites.                                |
| Section                    |                             40 | Additive viewport/controller ports and v2 legend hookup; exclude persistence/schema changes.                                    |
| Left panel: Project first  |                             30 | Additive state/command ports; retain existing migration/History/recovery contracts.                                             |

Existing-file ceilings and the cumulative counting base must be explicitly approved before each future stop. If a real port gap cannot fit, report the gap and revised estimate before coding. Keep each view's screenshot/functional stop and unchanged legacy checks. No splitting solely to evade line counts.

## Checkpoint validation

Environment: Windows, Node 24.16.0, locked Playwright 1.55.1 / Chromium 140.0.7339.186, local Three 0.179.1. Servers: Main/M2 on 4182, legacy site root on 4174. Main data remains the full M3D source with SHA-256 31f07d85c32d44685ef7f49485e432c2b73f713550dd981998376c61de46995b.

| Command                             | Result                                                                                        | Supporting artifact                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| npm run check                       | PASS: ESLint, Prettier, documentation gate; 610/610 Node tests, zero failures/skips.          | test-results/main-checkpoint-full-check.log                        |
| npm run test:ui:smoke               | PASS, unchanged legacy suite.                                                                 | test-results/main-checkpoint-legacy-smoke.log                      |
| npm run test:ui:workstation         | PASS, including unchanged View UX v3.                                                         | test-results/main-checkpoint-legacy-workstation.log                |
| npm run test:ui:interaction         | PASS, unchanged legacy suite.                                                                 | test-results/main-checkpoint-legacy-interaction.log                |
| npm run test:ui:product:layout      | PASS: wide/medium/phone, 109 captures.                                                        | test-results/main-checkpoint-legacy-product-layout.log             |
| node scripts/v2/check-main-view.mjs | PASS: 1440/1024/768/390 plus independently gated touch Pan/pinch Zoom and touch Square/Slice. | test-results/ui-v2-main-review/report.json; main-wired-browser.log |

All commands exited 0. Main and M2 screenshots use the identical M3D dataset. No duplicate IDs, legacy panels, app.js boot, toolbar overflow or page errors were observed. Real Rectangle/Square/Sector, Slice endpoints and coordinate editing, 0.1 nm inputs, SVG download, floating-panel coexistence/drag/Escape and owner-toggle dismissal passed. Independent 0.25px ROI/A-B assertions are unchanged; the loaded scientific model remains unchanged. Touch tests use Chromium's emulated touch input; physical touchscreen acceptance remains a hands-on review task. The complete test:ui:all browser inventory was not run; the four owning legacy groups above were executed unchanged.

Screenshot comparison: test-results/ui-v2-main-review/index.html. Actual floating editors: main-floating-1440.png, main-floating-1024.png, main-floating-768.png, main-floating-390.png in the same directory. These ignored captures are review evidence, not approved baselines; regenerate with the command above. Known Main scope gaps remain PNG export, Project/other views and project preference persistence; units are fixed to micrometres.

The initial checkpoint gate stopped on an unreachable new report and a new browser test clicking beneath the persistent ROI strip. The user approved adding the report link to the reachable handoff and making the new test locate exposed canvas without force-clicking or changing assertions. Those corrections were applied before the successful reruns. No legacy test was edited.

The local checkpoint includes only the relevant Main/report/test files and preserves unrelated local work. No push. Wait for the user's approval before view-kit extraction or Mask. Future changes retain the independent 0.25px ROI/A-B assertions and the legacy-failure stop rule.

## View-kit extraction checkpoint

Stage base: 6dfff3b0ac58a9d3af1db550ece1a3629a6e0864. The user approved only behavior-preserving extraction of floating-strip, floating-editor, inspection-fields and plan-gestures, migration of Main and removal of Main-specific duplicates. Resolve the resulting local checkpoint with `git log -1 --format=%H -- docs/ui-v2/MAIN_ARCHITECTURE_HEALTH_2026-10-11.md`. No push or Mask work is authorized.

### Current budget and changes

The revised 200-line Main cap counts legacy product files only; v2 shell/product files are reported separately. Extraction has its own 40-line legacy ceiling for this stage, not a cumulative ceiling. **Legacy product changes in this extraction: 0/40.** The inherited Main/controller changes against da37fe4 total 32 added/deleted legacy lines (Main canvas 14, ROI 16, approved popover race fix 2); extraction adds zero. Science/model/worker/IO/schema, app.js/app.html, D1, M2 prototype behavior and approved baselines remain untouched.

| Existing v2 file                   |  Added | Deleted | Reason                                                                                          |
| ---------------------------------- | -----: | ------: | ----------------------------------------------------------------------------------------------- |
| site/app-v2-main.html              |      3 |       0 | Load shared strip/editor/field styles.                                                          |
| site/ui-v2/main-view.js            |     52 |      72 | Tool/field configuration calls the shared components; remove glyph/strip/field implementations. |
| site/ui-v2/main-runtime.js         |      4 |       3 | Import shared planar touch gestures and UI length formatter; preserve controller ports.         |
| site/ui-v2/main-view.css           |      0 |      55 | Move editor, paired-field and strip rules to view-kit.                                          |
| site/ui-v2/main-overlay-manager.js |      0 |     143 | Remove Main implementation; migrate it to floating-editor.js.                                   |
| site/ui-v2/main-touch.js           |      0 |      95 | Remove Main implementation; migrate it to plan-gestures.js.                                     |
| **Total existing v2**              | **59** | **368** | **427 changed lines; reported separately from legacy.**                                         |

| New shared file                |   Lines | Boundary                                                                                                                       |
| ------------------------------ | ------: | ------------------------------------------------------------------------------------------------------------------------------ |
| view-kit/floating-strip.js     |      57 | Configured tool groups, icons/hints, dividers, final settings button and owner/selection sync.                                 |
| view-kit/floating-strip.css    |       7 | Shared persistent-strip visibility/wrapping over the unchanged M2 p-mask-* appearance primitives.                              |
| view-kit/floating-editor.js    |     146 | Shared nonmodal drag/bounds/coexistence/focus/Escape lifecycle, retaining the existing v2 menu owner.                          |
| view-kit/floating-editor.css   |      44 | Shared floating surface, header, body and action-row presentation.                                                             |
| view-kit/inspection-fields.js  |      30 | Configured numeric/select hooks, length/angle precision and paired fields; no geometry computation.                            |
| view-kit/inspection-fields.css |       5 | Shared two-column field layout.                                                                                                |
| view-kit/plan-gestures.js      |      95 | Existing independently gated touch drag/pinch through view-supplied ports. Mouse navigation stays in the unchanged controller. |
| **Total new shared v2**        | **384** | No Mask adapter or tool configuration added.                                                                                   |

The existing-v2 count includes deletions as well as additions, including relocated modules; it is not a claim of 427 behavioral changes. Git detects the editor/gesture relocations as renames: the rename-aware v2 product diff is 212 additions plus 137 deletions, 349 changed lines. The tables above also expose the full old/new module sizes rather than hiding relocated source. Product source totals are 897 Main-specific lines plus 384 shared lines, 1,281 total versus 1,206 before extraction. Configuration and reusable API/style boundaries explain the increase; no splitting was performed to evade a legacy cap.

| Requested file          | Before | After | Result                                                                                            |
| ----------------------- | -----: | ----: | ------------------------------------------------------------------------------------------------- |
| main-view.js            |    580 |   560 | Presentation/configuration/controller actions remain; shared strip/field implementations removed. |
| main-overlay-manager.js |    143 |     0 | Deleted; one shared floating-editor implementation, 146 lines.                                    |

Main imports the shared modules directly. There are no Main compatibility wrapper modules for editor/gestures and no duplicate Main editor/field/strip style rules. Its `v2-main-floating` class is retained only as a configured test/DOM compatibility marker; appearance and lifecycle use the shared generic classes. The unchanged M2 prototype still uses its original components; this stage does not migrate or extend Mask.

### Repeated isolation and preservation evidence

```powershell
rg -n --glob 'main-*.js' 'cloneNode|importNode|DOMParser|real-view-bridge|#focusEditor|#roiEditor|#maskCanvas|\.view-panel' site/ui-v2
rg -n --glob 'main-*.js' '(import|fetch|require).*app\.(js|html)' site/ui-v2
rg -n 'cloneNode|importNode|DOMParser|real-view-bridge|#focusEditor|#roiEditor|#maskCanvas|app\.(js|html)|mainCanvas|roiShape|section[A-B]' site/ui-v2/view-kit
git diff --name-only 6dfff3b0 -- site/controllers site/app.js site/app.html site/tests scripts/v2/check-main-view.mjs scripts/v2/check-main-touch.mjs
```

All three searches returned no matches (rg exit 1); the final diff list is empty. Existing Main/legacy test files, touch script and every 0.25px assertion remain byte-for-byte unchanged from the stage base. Shared modules import no controller, scientific model or legacy page. Their append operations insert only newly constructed v2 nodes; the configured Main hook IDs continue to refer to v2-created controls.

Supporting Espree AST comparison: the planar gesture function body is identical before/after; the length formatter expression is identical; the editor body is identical after substituting its generic CSS classes and configurable compatibility class. The editor's factory parameters now accept the same root/window injection through an options object. Evidence: test-results/view-kit-equivalence.json. This comparison supplements runtime checks; it does not replace them.

### Current workarounds

| Workaround                            | Reason/status after extraction                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Main-only entry and injected state    | Preserved: validate M3D without full legacy UI/persistence; Project remains a later stop.                                            |
| Hook Map and document-backed v2 root  | Preserved: supply required public-controller IDs with newly built v2 fields.                                                         |
| No-op Mask/Section render callbacks   | Preserved: Main-only controller dependencies must not boot other renderers.                                                          |
| Optional ROI editor-sync callback     | Preserved: controller-owned authoritative ROI updates v2 fields through the existing additive port.                                  |
| Menu/floating lifecycle composition   | Now shared in floating-editor: native v2 popovers retain their owner while persistent editors own drag/focus/Escape.                 |
| Document-level Main action delegation | Preserved: portalled v2 form actions remain connected to Main controller commands.                                                   |
| Touch capture plus pointercancel      | Now shared in plan-gestures: pinch cancels an uncommitted one-finger inspection draft.                                               |
| Square represented as rectangular ROI | Preserved: v2 equality constraint introduces no stored shape or science change.                                                      |
| UI-only length formatting             | Now shared in inspection-fields: 0.1 nm presentation/input does not round canonical geometry.                                        |
| SVG exporter and deferred PNG         | Preserved approved scope; no export feature added.                                                                                   |
| M2 p-mask-* appearance primitives     | Shared strip inherits the approved base appearance; one kit component/style serves future real views without changing the prototype. |
| v2-main-floating compatibility marker | Retained through config to keep existing tests/selectors unchanged; no Main-specific editor implementation/style remains.            |

The temporary Main editor manager, Main touch module, numeric-field helper and glyph/strip implementation are removed. View-specific ROI/Slice data synchronization, field values, tool actions and geometry constraints remain in Main, not in the generic kit.

### Extraction validation and stop

All required gates passed, exit 0. Environment: Windows, Node 24.16.0, locked Playwright 1.55.1 / Chromium 140.0.7339.186, local Three 0.179.1. The exact commands are unchanged:

```powershell
npm run check
$env:WAFERCAD_URL='http://127.0.0.1:4174'
$env:WAFERCAD_THREE_DIR=Join-Path (Get-Location) 'node_modules/three'
npm run test:ui:smoke
npm run test:ui:workstation
npm run test:ui:interaction
npm run test:ui:product:layout
node scripts/v2/check-main-view.mjs
```

Full check: ESLint/Prettier/docs PASS; Node 610/610 PASS, zero failures/skips. All four unchanged legacy suites PASS, including View UX v3 and 109 responsive product-layout captures. Main PASS at 1440/1024/768/390 plus the same touch cases; 0.25px ROI/A-B assertions, scientific model equality, real shape/Slice/export interactions, focus/Escape/coexistence/drag, duplicate-ID/overflow/legacy-boot checks remain unchanged and pass. Physical touchscreen acceptance is not established by emulation. The broad test:ui:all inventory was not run.

Logs: test-results/view-kit-full-check.log, view-kit-main-browser.log and view-kit-legacy-{smoke,workstation,interaction,product-layout}.log. Main/M2 use the same M3D source/hash. Screenshots/report remain in test-results/ui-v2-main-review/; pre-extraction captures were retained under test-results/main-before-view-kit/, and the extracted run is also preserved in test-results/view-kit-main-validated/. No approved baseline is modified. Initial Main-panel PNGs are byte-identical before/after at all four widths. The floating-editor PNGs match at 1024/768/390; the first 1440 capture had different panel positions, despite passing the unchanged behavior/bounds assertions. Three direct original/extracted 1440 editor-open/drag comparisons produced identical positions (test-results/view-kit-editor-position.json).

A read-only proxy served the original six Main entry/module/style files from 6dfff3b0 on temporary localhost port 4184. The unchanged full Main command was replayed with WAFERCAD_V2_BASE=http://127.0.0.1:4184: PASS, all four widths and touch, exit 0. Its recorded result/widths/errors/browser/touch data are exactly equal to the extracted run (test-results/view-kit-preservation.json). The replay's 1440 editor capture matches the prior checkpoint; it did not reproduce the differing extracted capture. Therefore exact floating-panel screenshot repeatability is not established, and the cause of that isolated position difference remains unproven. No position fix or new feature was added during extraction. Original replay artifacts/log: test-results/view-kit-checkpoint-replay/ and view-kit-checkpoint-browser.log. The temporary server was stopped; the normal Main/M2 URLs remain on 4182. The gallery/report were restored from the retained extracted run after the diagnostic, without editing image content.

Final documentation navigation and formatting checks also pass after updating this report. The committed result is a local checkpoint only; unrelated M1.5 README/document/capture work remains unstaged. Resolve the exact commit using the path-specific git log command above.

This stage ends at a local checkpoint, no push. Mask controller ports, tool contract changes and configuration will be implemented only after a separate approval. The prior read-only Mask capability audit still applies.
