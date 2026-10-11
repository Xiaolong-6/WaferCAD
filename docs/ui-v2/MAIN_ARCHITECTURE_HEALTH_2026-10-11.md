# Main-only checkpoint: architecture health and view-kit proposal

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
