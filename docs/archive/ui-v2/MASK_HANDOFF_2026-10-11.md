# Mask-only v2 checkpoint

Date: 2026-10-11. Branch: `codex/ui-v2-m3-main-audit-20261010`.
Stage base: `22358329e9dc68f934c8ed17823eff1c6c587377` (Main view-kit extraction).
This stage is authorized for Mask only and a local checkpoint, with no push.
Resolve its checkpoint using `git log -1 --format=%H -- docs/ui-v2/MASK_HANDOFF_2026-10-11.md`.
The earlier [Main architecture report](MAIN_ARCHITECTURE_HEALTH_2026-10-11.md)
remains the historical extraction/audit record; its pending Mask status is
superseded by this approved stage.

## Run and review

From the repository root:

```powershell
npm ci
node scripts/v2/serve-v2.mjs
```

- Real Mask: <http://127.0.0.1:4182/app-v2-mask.html>
- M2: <http://127.0.0.1:4182/app-v2.html?example=m3d&domain=project&review=mask>

Both use the full `site/examples/m3d-selfpowered-full-replay.wafercad` M3D
example, SHA-256 `31f07d85c32d44685ef7f49485e432c2b73f713550dd981998376c61de46995b`.
The real page validates it through `readProjectFile`; the prototype uses its
existing derived fixture with the same recorded hash. The project contains two
Draw rectangles and no File elements. The caption derives from current source
and actual shape/element count. Neither page boots the legacy UI or saves projects.

## Implementation and budget

The shared floating-strip/editor/inspection-fields/plan-gestures implementations
serve both Main and Mask. Mask has no stylesheet or private strip/editor
implementation. Its fields/tools are configuration; controllers own scientific
Draw and ROI operations. Generic planar canvas styles move from Main CSS to
the view-kit. Mouse navigation is opt-in for Mask; Main retains its existing
controller mouse behavior and unchanged touch binding.

| Existing legacy file                       |       Added | Removed | Reason                                                                             |
| ------------------------------------------ | ----------: | ------: | ---------------------------------------------------------------------------------- |
| `site/controllers/draw-mask-controller.js` |          24 |       0 | Public operations plus optional UI/editor callbacks bypass legacy UI construction. |
| `site/controllers/mask-roi-controller.js`  |           2 |       0 | Optional v2 editor-sync callback.                                                  |
| **Stage total / ceiling**                  | **26 / 40** |   **0** | Defaults retain the legacy path.                                                   |

The v2 shell, prototype, new adapter/presentation, shared kit, documentation and
test edits are reported separately in the final validation table below. No
science, schema, IO implementation, worker implementation, legacy entry, D1,
main branch, or approved visual baseline is edited.

## Adapter workarounds

| Workaround                                               | Reason                                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| New v2 hook map, including detached bind targets         | Existing controller bind requires IDs; these nodes are created from v2 primitives, never obtained from app.html.                      |
| Optional Draw UI/editor callbacks                        | Prevent controller-generated legacy fields and legacy strip/source synchronization from owning v2 presentation.                       |
| Public clear delegates to the bound controller operation | Reuse its exact confirmation/state reset without copying its implementation.                                                          |
| Optional Mask ROI editor callback                        | Keep field visibility, display precision and overlays in the v2 kit.                                                                  |
| Explicit UI-only strip state                             | Hiding/reopening preserves source, stable IDs, selection, tool and pending polygon.                                                   |
| Opt-in shared mouse navigation                           | Mask has no standalone Pan/Zoom controller binding; reuse plan ports and shared pointer ownership.                                    |
| Stable Mask palette mapping in adapter                   | app.js privately owns presentation colors; preserve that mapping without importing its boot.                                          |
| Thin worker export promise                               | Reuse the existing layout-export worker; terminate on done/error, download only a completed result, and serialize concurrent exports. |
| Empty Project panel / disabled cross-view navigation     | Left panel and other views remain outside this independently approved Mask stage.                                                     |

## Try this

1. Toggle Pan and Zoom independently; drag with the left mouse button and zoom with the wheel.
2. On touch, enable Pan for dragging and Zoom for pinching; test each disabled state.
3. Open Draw; create Rectangle, Circle, Polygon, Ring and Ring sector. Close a polygon at its first point or press Enter.
4. Select an original rectangle; drag/resize it and open Draw settings. Edit X/size at 0.1 nm precision.
5. Delete the selected shape; check that another shape survives and Delete disables after selection clears.
6. Start a polygon, hide/reopen Draw, then continue it; the source and draft must survive.
7. Create/edit/clear a Mask ROI and inspect File alignment. Drag a settings panel, click the canvas, and dismiss it with Escape.
8. Export SVG/GDS/OAS; switch File/Draw explicitly using Mask source. Cancel Clear, then confirm it if desired.

## Known boundaries

- File import and Cell/Layer browsing belong to the later left-panel integration; this M3D example has no imported File geometry.
- The M2 canvas remains a prototype illustration; real Mask shows the existing scientific process alignment reference and real shape/ROI handles.
- This isolated review does not save or run Process; edits remain in memory until refresh.
- Hardware touch/GPU and final visual approval remain hands-on checks; Chromium touch emulation is automated evidence only.

## Validation

Pending execution. Required commands:

```powershell
npm run check
$env:WAFERCAD_URL = 'http://127.0.0.1:4174'
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
npm run test:ui:smoke
npm run test:ui:workstation
npm run test:ui:interaction
npm run test:ui:product:layout
node scripts/v2/check-main-view.mjs
node scripts/v2/check-mask-view.mjs
```

Mask review artifacts: `test-results/ui-v2-mask-review/index.html`,
`report.json`, full/window screenshots at 1440/1024/768/390, settings screenshots,
and touch screenshot. These are ignored review artifacts, never baseline replacements.
Main and legacy 0.25 px assertions remain unchanged; new Mask pointer/touch
projection checks use the same 0.25 px bound.

Isolation commands (exit 1 is expected when the prohibited patterns have no matches):

```powershell
rg -n 'app\.js|app\.html|cloneNode|real-view-bridge|importNode|adoptNode' site/ui-v2/main-*.js site/ui-v2/mask-*.js
rg -n 'legacy|\.view-panel|mainControls|maskTools' site/ui-v2/main-*.js site/ui-v2/mask-*.js
git diff --numstat 22358329 -- site/controllers site/app.js
```

All DOM append/replace operations in Main/Mask presentation target newly created
v2 nodes, hooks, canvas hosts and shared portals. No legacy page/document is
loaded to source controls. `mask-runtime.js` imports public factories, physical
geometry helpers and the view-kit only; it does not import `app.js`.
