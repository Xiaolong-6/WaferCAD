# M2 Self-Review: Closing UI Gaps and Defining the M3 Boundary

Date: 2026-10-09; handoff branch `codex/ui-v2-m2-handoff-2026-10-09`, product commit `0d5fb4e` (derived from integration point `refactor/ui-v2-m0`). This list compares the r2 plan, M0 CONTRACT/IMPLICIT_DEPS, legacy `app.html` and the relevant controllers.

Here, **completed** means an operable M2 static/semi-static shell with local drafts and visible states. It does **not** mean domain transactions, scientific computation, renderer, storage or file import/export are actually connected.

## Gaps addressed in M2

| ID | Self-review item | M2 deliverable and boundary |
| --- | --- | --- |
| G01 | Actual History Variant origins and HEAD/cursor | Added the pure Step-first `history-tree.js` projection. Uses real `rootNodeId` / `parentBranchId` to nest Variants recursively; HEAD and selected cursor have distinct markers. Each Step has a `⋯` row menu. Photodetector has browser assertions for the real branch tree. Source History remains frozen. |
| G02 | Manual operation form | Covers Deposit, Extend (Coverage/Placement), Etch (Directional/Isotropic separated from Smooth/Rough/Pyramid), Implant, Electrical and Record. Implant Tilt supports negative increments within −80…80. Edits local mock drafts only. |
| G03 | Recipe construction and checks | Add/Delete/Move, field editing, independent Undo/Redo, Validate entry and local field errors, template preview/explicit replacement confirmation, and Run All / Continue / Rebuild / Run to Step. This is not a production Recipe validator/parser. |
| G04 | Main / ROI / Section A–B | ROI shapes, anchor, position/size/radius/rotation and Clear; Mask alignment X/Y/scale/rotation; Section A/B coordinate editing. nm/µm/mm affects display/input only; length drafts normalize to µm. Actual pointer behavior remains M3 work. |
| G05 | Mask tools and File tree | Draw mode provides Select/Rect/Circle/Polygon/Ring/Ring-Sector plus Add/Delete/Clear drafts. ROI/alignment/opacity use separate floating canvas panels. A real GDS example displays a Cell tree recursively through TOP references, plus File-layer visibility drafts. More contains SVG/GDS/OAS scope controls. There is no real GDS import or geometry mutation. |
| G06 | Section display and Z-break | Auto/1:1, Borders, Z-break start/end/front/back scaling, Detail ROI set/clear and Legend preset/random-color controls, affecting local UI drafts only. The Section plot remains an explicitly labeled schematic stack, not the real Section renderer. |
| G07 | View export and appearance | Every view exposes export through the header More menu: Main SVG/PNG, Mask GDS/OAS, 3D GLB/PNG, Section options, cancel-export and opacity/border drafts as appropriate. No scientific output files are generated. |
| G08 | Project units and Apply History | XYZ nm/µm/mm are Project workspace options; UI-draft Undo/Redo snapshots appear beneath Manual Apply. Recipe has separate Undo/Redo. Rebuild Base explicitly offers Keep / Clear (with second confirmation) / Cancel. None writes to the source project or History. |

## Explicitly deferred to M3 / M4

- Project file IO, Base transactions, Recovery/IndexedDB/writer lease/reload. The current Save exports a UI draft clearly labeled as *not a project file*.
- Process workers, Recipe parser/validator/replay, failure rollback, and real History restore/fork/HEAD/bookmark transactions.
- Four real renderers, pointer coordinate paths, scientific Section, 3D Fast/Quality and physical GLB. Choosing History does not rebuild real scientific views.
- Static ID/dynamic control coverage of the 259-ID inventory remains unfinished; five dynamic expressions require M3 tracking.
- Welcome startup, default-entry switch and fallback route remain M3 work. M4 full regression and visual baseline were not performed; user still needs to approve baseline browser.
- Section Legend real rename/visibility/color/profile editing is M3; at this point only real read-only names, colors, IDs and Implant annotations are shown.
- `origin/main` at `b81598b` was merged; recheck and synchronize the then-current main before real wiring.
- At handoff publication `origin/main` advanced to `fbbc261`. New formatting commit `21b2318` and Lift-off commit `fbbc261` had not yet been merged into this branch. M3 must reconcile the latest Process/Recipe contract, add Lift-off to relevant UI and refresh the inventory. See [handoff](M2_ITERATION_HANDOFF_2026-10-09.md).

## Iteration corrections

- Moved XYZ display units to Project; Manual Undo/Redo sits below Apply, while Recipe retains its independent Step Undo/Redo.
- Moved Mask Draw tools into a floating canvas strip with distinct inline-SVG select/draw icons. ROI, Alignment and Opacity parameters use floating in-canvas panels instead of consuming left Cells/Layers space.
- Show Draw tools only when Mask source is Draw. ROI and ROI parameter entry remain independently available. Canvas strips share a consistent visual form, 16 px icons and at least 40 px touch targets.
- Removed native list numbering/bullets and card borders from History tree rows; compact rows, branch lines and indentation convey structure. Step actions remain fixed at the panel top; each Step row has an anchored `⋯` menu (Select / Restore / Edit / Create Variant). The list scrolls independently and preserves its position.

## Self-review evidence

- Native Chrome 155 / CDP: `node scripts/v2/check-m2-shell.mjs` passed 25 checks with zero page/console errors. No Playwright and no screenshots.
- At 1440/1024 px, mock Main versus 3D ROI top/bottom DOM alignment had 0 px delta (0.25 px threshold). This checks the mock registration plane, **not** the real PR #161 renderer root cause.
- Checks also covered 768/390 single-view document flow, absence of overlays/flyouts, Section Legend layout, real Photodetector's seven Variants and nested origin Steps, empty History, and frozen source objects.
- `node --test scripts/v2/view-state.test.mjs`: 5/5. ESLint and M2-scoped Prettier passed; the 18 preexisting main formatting failures were not reformatted.
- `git diff --check` passed. v2 mock data was derived from original examples, with no scientific execution.

M2 ended as an isolated mock-shell checkpoint. At that historical checkpoint, do not enter M3, change default entry, deploy or push.
