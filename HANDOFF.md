# WaferCAD MVP — Handoff Notes

## 1. Product intent

The user is trying to build **wafer states**, not simulate semiconductor physics.

The closest interaction metaphor is:

> SketchUp-style face push/pull + GDS-defined patterns + synchronized Top/3D/Cross-section views + snapshots.

A user should be able to manually reconstruct a real fabrication flow by editing the wafer geometry and taking a snapshot after meaningful stages. Process-specific intelligence should be added only when a real process step cannot be represented adequately by the existing geometric primitives.

Do not turn the project into TCAD unless explicitly requested.

## 2. Current interaction model

```text
GDSII
  │
  ├─ layer 1 / datatype 0 ─┐
  ├─ layer 2 / datatype 0  ├─> independently visible/importable patterns
  └─ layer N / datatype M ─┘
                │
                ▼
          Imprint pattern
                │
                ▼
         selectable faces
           │         │
       Pull up    Push down
           │         │
           └────┬────┘
                ▼
          current model
         ┌──────┼──────┐
         ▼      ▼      ▼
        3D     Top    A–B section
                │
                ▼
             Snapshot
```

## 3. Layout-format requirement — important

GDSII and OASIS must remain **layer-aware**.

Do not collapse a layout into one mask image.

The backend currently groups polygons by the full pair:

```text
(layer, datatype)
```

Examples:

```text
1/0
2/0
10/5
```

Each pair is shown as a separate layer in the UI and can be independently shown, hidden, imprinted and selected.

Current parser: `gdstk`.

`app.py:/api/gds/inspect`:

- reads GDSII or OASIS natively according to the filename extension;
- reports all cell names and top-level cells;
- accepts an optional selected top-level cell and otherwise uses the first one;
- flattens referenced geometry for that top cell;
- preserves layer/datatype metadata on each polygon;
- normalizes layout coordinates into **µm** using the library unit;
- returns polygons grouped by layer/datatype.

### Next layout improvements

Do these incrementally, not all at once:

1. Preserve/browse cell hierarchy instead of only flattened preview.

## 4. Current data model

The frontend deliberately uses a small 2.5D representation:

```text
Wafer
  shape + outline dimensions/vertices
  thickness
  material

SolidRegion
  footprint: polygon XY
  zMin
  zMax
  material

CutRegion
  footprint: polygon XY
  zMin
  zMax

DopingRegion
  footprint: target-layer polygon XY
  zMin / zMax within target
  dopant + upper/lower position
  targetLayerId

ImprintedFace
  polygon XY
  source GDS layer/datatype
```

Everything is in physical **µm** internally.

Three.js is only a renderer. Do not let Three.js meshes become the source of truth.

## 5. Snapshot semantics

A snapshot is currently a saved copy of:

```text
wafer
solids
cuts
dopings
layer visuals
imprinted faces
```

It represents a fabrication state such as:

```text
Bare wafer
After oxide
After opening
After etch
Final device
```

Snapshots are intentionally not yet called process steps. The user can construct states manually first; semantic process operations can be added later.

## 6. How 3D rendering currently works

`static/app.js` derives Three.js geometry from the 2.5D model.

- Wafer: circle, rectangle, or coordinate-defined polygon extruded from the stored outline.
- Upward additions: polygon `ExtrudeGeometry`.
- Downward substrate cuts: wafer is split into Z slabs; each relevant cut polygon is inserted as a hole in the slab shape.
- A–B line: rendered as a translucent vertical slice plane.

This is good enough to validate the interaction but is not a general BRep/CSG kernel.

Do not keep expanding ad-hoc Boolean logic indefinitely. When multi-material subtractive editing becomes necessary, stop and evaluate a mature geometry kernel (e.g. OpenCascade/CadQuery or another appropriate library) and tell the human the advantages, costs and consequences before changing the architecture.

## 7. Cross-section algorithm

The Top View stores A and B in model XY coordinates.

The Cross Section:

1. intersects A–B with the current wafer outline;
2. intersects the line with every region polygon;
3. converts each in-polygon line interval into a 2D section rectangle using the region's Z extent;
4. overlays cuts as empty regions;
5. uses a display-Z mapping so thin structures remain visible.

The section is derived from the same geometry state as the 3D view.

## 8. What should be built next

Do **not** implement a generic process library yet.

Take the user's real process flow sequentially. For each actual fabrication stage ask:

> Can the current editor represent this state correctly using imprint + push/pull + materials + snapshot?

If yes, use the current primitive.

If no, add the **smallest new geometry operation** that is required.

Likely examples later:

- thermal oxidation → requires substrate consumption + oxide growth;
- conformal ALD → requires conformal surface coating;
- implantation → requires a non-material volumetric/doping region;
- surface nanotexturing → requires a morphology representation;
- material-selective etch → requires robust stacked-material subtraction.

Do not implement these until requested.

## 9. Highest-priority technical debt

1. **Selection/editing semantics**: evolve from "selected imported polygon" toward selection of actual top faces of the current model.
2. **Geometry backend decision**: only when stacked push-down/Boolean editing exceeds the current 2.5D renderer.
3. **Large-layout performance**: characterize and improve behavior near the current 20,000-polygon cap.
4. **Schema evolution**: version 5 is now explicit; add migrations when a future schema change is introduced.

## 10. Reuse rule for the next agent

Do not hand-build infrastructure that a mature library already solves.

However, if adopting a library would materially constrain geometry representation, licensing, deployment, or future editing behavior, explain to the human first:

- what will be reused;
- why;
- benefit;
- drawback;
- architectural consequence;
- realistic alternative.

Then wait for the human's decision.

Routine dependencies do not need lengthy architecture reports.

## 11. Confidentiality

The repository contains only synthetic examples.

Keep it this way.

Do not commit real GDS masks, unpublished process recipes, experimental device structures or user-specific fabrication parameters into demos/tests/documentation.

## 12. Current local baseline and verification (2026-08-28)

This handoff was adopted as the new baseline at:

```text
C:\Users\liux16\OneDrive - Aalto University\Agents\Process_builder
```

The superseded implementation was preserved at:

```text
C:\Users\liux16\OneDrive - Aalto University\Agents\Process_builder_pre_wafercad_20260828_094310
```

Local environment:

- dependencies are installed in `.venv`;
- run with `.venv\Scripts\python.exe run.py`;
- application URL is `http://127.0.0.1:8765/`;
- `/api/health` returns `{"ok": true, "gdstk": true}`.

Verified interactively in Chrome and through local API tests:

- JavaScript syntax passes `node --check`;
- FastAPI starts successfully;
- multiple GDS top cells can be selected and remain layer/datatype aware;
- GDS X/Y offset and rotation change the layout geometry before imprinting;
- aliases are retained as project metadata;
- controls lock after imprinting so committed geometry cannot silently drift;
- a confidential real GDS was parsed read-only without copying it into the project, logging its structure, or hitting the polygon cap;
- Three.js is pinned as a local npm dependency and no longer uses jsDelivr.

The project JSON schema is now version 5 and stores layout top-cell, alignment, alias, mask-tone, processing-face, per-layer visualization, conformal/isotropic profile metadata and doping regions. Versions 1–4 remain loadable through normalization. No process-flow features from the superseded implementation were migrated.

Still not verified: large-layout performance near the 20,000-polygon cap.

## 13. Wafer outline editor (2026-08-28)

`Create wafer` now supports three outline types:

- circle (diameter);
- rectangle (width and height);
- custom polygon entered as ordered `x, y` vertex coordinates, one vertex per line.

The custom polygon closes automatically. Coordinates retain their absolute position relative to `(0, 0)`; the application does not recenter them. Lateral and thickness units can be selected independently from nm, µm, mm, and cm. Switching the lateral unit converts circle/rectangle dimensions and all valid coordinate rows in place.

The geometry pipeline now uses the wafer outline for Top View, Cross Section clipping, 3D extrusion, fit-to-view, and the default A–B slice. Project loading normalizes older circle-only wafer data.

Verified in automated Chrome:

- a five-vertex custom wafer was created successfully;
- mm-to-cm coordinate conversion preserved physical dimensions;
- Top View and Cross Section both rendered the custom geometry;
- a self-crossing polygon was rejected with an inline validation error;
- no application page errors occurred during the valid workflow.

## 14. Empty project startup (2026-08-28)

The application now starts with no wafer, no A–B slice, and no generated geometry. The 3D canvas, Top View, and Cross Section remain visually empty until the user creates a wafer or opens a project. `New wafer` still opens with sensible defaults, but those defaults are form values only and are not committed to the model until Create is pressed.

The synthetic `Demo layers` toolbar action and its in-browser geometry generator were removed. The GDS panel now only invites the user to import a real GDS file.

Verified in Chrome:

- the initial Top View and Cross Section SVGs contain no geometry;
- the initial 3D scene is blank;
- no Demo layers button exists;
- creating the default circle wafer still populates all three views;
- reloading restores the empty initial project.

## 15. GDS selection, alignment and offline rendering (2026-08-28)

- `/api/gds/inspect` accepts a selected top-level cell. A Windows temporary-file locking defect that previously prevented `gdstk` from reopening uploaded files was fixed by closing the temporary file before parsing and deleting it afterward.
- The GDS panel exposes top-cell selection, X/Y translation with selectable units, rotation about the GDS origin, and editable layer aliases.
- Alignment is applied to preview and imprint geometry. Top-cell/alignment controls lock after imprinting so committed solids and cuts cannot silently move away from their source faces.
- GDS top-cell, alignment and alias metadata introduced in project JSON version 2 remains supported in the current version 5 schema; older data is normalized on load.
- Three.js `0.179.1` is pinned by npm and served locally under `/vendor/three`; `node_modules` remains gitignored.
- The confidential reference mask passed a read-only local parse without being copied into the repository or exposing its structure in documentation/output.

## 16. Wafer dialog inline units (2026-08-28)

The separate lateral/thickness unit rows were removed from `Create wafer`. Unit selectors now sit directly after their numeric values. Circle diameter, rectangle width/height and custom coordinates share one synchronized lateral unit; changing any visible lateral selector converts all lateral values and updates the other selectors. Thickness keeps an independent inline unit. The dialog width is capped at 430 px and was checked in Chrome without horizontal overflow.

## 17. Substrate clipping, mask tone, backside processing and Top View navigation (2026-08-28)

- New local geometry endpoints use `gdstk` Boolean operations to intersect regions with the exact wafer outline and to resolve normal/inverted mask tone.
- Imprint and push/pull cannot create geometry outside the substrate. A partially overlapping polygon is clipped at the wafer edge; a fully external polygon is ignored. Non-convex custom wafer outlines are supported.
- Each imprinted face, solid and cut records `side: front|back`. `Face: Front/Back` switches the active processing surface. Backside Pull grows below `z=-wafer.thickness`; backside Push removes substrate upward from the bottom face.
- Each GDS layer has an `Invert mask tone` option. Inverted imprint means `substrate minus mask polygons`; the resulting holes are preserved in Top View, 3D extrusion and A–B sections.
- A/B dragging uses window-level pointer tracking and no longer rebuilds 3D on every pointer move. 3D updates when the drag ends.
- A/B coordinates can be entered numerically with nm/µm/mm/cm units. Top View supports wheel zoom and drag-to-pan on empty space.
- Project JSON version 3 introduced front-side/default-tone normalization; it remains loadable by the current version 5 schema.

Verified with synthetic geometry in Chrome:

- a polygon crossing a 100 mm wafer edge was clipped exactly at `x=50,000 µm` and an external polygon produced no region;
- normal front Pull produced `z=0…100 µm` and back Pull produced `z=-600…-500 µm` on a 500 µm substrate;
- inverted mask Pull preserved its central hole in 3D and produced two separated intervals in the cross section;
- manual A/B input produced the requested 40 mm line;
- wheel zoom, empty-space pan and continuous A-handle dragging all changed the view/state without page errors.

## 18. Whole-face Push / Pull without a pattern (2026-08-28)

Pattern selection is optional. When no imprinted face is selected, Push/Pull automatically uses the exact full wafer outline on the active processing side:

- Pull creates a blanket material layer across the whole active face;
- Push consumes existing material layers inward from the whole active face, then continues into the substrate;
- front/back Z direction follows the face semantics introduced above;
- when one or more patterned faces are selected, the operation remains pattern-local and substrate-clipped.

The button now reads `Apply Push / Pull`, and the helper text explicitly states whether the whole front or back face will be used. Verified in Chrome without any imported pattern: a 200 µm front blanket layer produced `z=0…200 µm`, while a 50 µm back push on a 500 µm wafer produced a cut at `z=-500…-450 µm`; no imprinted faces were created.

## 19. Per-layer figure legend and display scaling (2026-08-28)

The 3D canvas now contains a compact `Figure legend`. It represents physical model layers, not imported GDS mask layers:

- the substrate always has one entry;
- every successful Pull operation creates one layer entry, even when that operation produces several patterned polygon pieces;
- Push/cut operations do not create fictitious material entries;
- every entry defaults to display scale ×1 and an automatically assigned material color.

Clicking a legend row opens a layer display editor for color and a positive Z scale factor. Both are visualization-only properties: stored physical thickness, surface calculations and process geometry remain unchanged. The global `Z display` slider is retained and combines with the per-layer factor. Layer colors and scaled stacking are synchronized across 3D and A–B Cross Section.

`layerVisuals` and each solid's `layerId` were introduced in project JSON version 4 and remain in version 5 and device snapshots. Loading versions 1–3 assigns stable defaults to legacy solids in memory. Browser verification covered the empty state, substrate-only legend, a blanket Pull layer, color change, ×2 layer scaling, the global Z control at a non-default value, and error-free 3D/cross-section updates.

## 20. Conformal growth and isotropic etch (2026-08-28)

The operation selector now includes `Conformal grow` and `Isotropic etch`. Both use `/api/geometry/isotropic-offset`, backed by `gdstk.offset` with round joins and a Boolean intersection against the exact wafer outline. The supplied physical distance is used both as lateral radius and Z growth/removal distance.

This is deliberately identified in the UI as a **2.5D isotropic approximation**. It captures mask-edge undercut/overgrowth in Top View, 3D extrusion and A–B sections, but it is not a boundary-representation shell around vertical sidewalls. Conformal solids store `profile: conformal` and `lateralRadius`; isotropic cuts store `profile: isotropic` and `lateralRadius`.

API verification expanded a 20×20 µm square by 5 µm to exact bounds ±15 µm with a 36-vertex rounded outline. Browser verification expanded a 20 mm patterned region by a 1 mm radius to a 22 mm section width.

## 21. Back-face three-view orientation (2026-08-28)

`Face: Back` now changes all linked views rather than only the processing direction:

- Top View mirrors X and preserves inverse coordinate picking/dragging;
- the 3D camera moves to the underside and mirrors its X vantage;
- Cross Section mirrors A/B horizontally and flips physical Z vertically, so the backside surface is presented as the active side.

Physical coordinates and saved geometry are not transformed. This is a view transform only. Browser checks confirmed A/B exchange sides, section labels move from the lower to upper edge, the substrate changes vertical orientation, and the section metadata reports `backside flipped`.

## 22. Native OASIS import (2026-08-28)

The layout chooser accepts `.gds`, `.gdsii`, `.oas` and `.oasis`. OASIS is parsed directly with `gdstk.read_oas`; it is not converted through GDS. Both formats share the existing top-cell, flattened polygon, layer/datatype, alias, alignment, mask-tone and imprint pipeline.

A synthetic native OASIS file was verified through both the API and browser UI: top cell `TOP`, layer/datatype `7/3`, one polygon and correct micrometre bounds were preserved.

## 23. Operation Undo and doping regions (2026-08-28)

An `Undo` button sits immediately to the right of `Apply operation`. It keeps up to 50 in-memory pre-operation states and covers Pull, Push, Conformal grow, Isotropic etch and Doping. New/opened wafers and restored snapshots clear this transient history so Undo cannot cross project timelines.

`Doping` selects a physical target layer (substrate or a Pull-created layer), a target side (`Upper side (+Z)` or `Lower side (−Z)`), a dopant name and a depth. Doping regions:

- overlap the target footprint and are clamped to its physical thickness;
- do not affect `surfaceZAt` and therefore do not falsely raise or lower later process geometry;
- are stored separately in `dopings` with their target layer and physical Z range;
- appear as transparent volumes in 3D, as directional gradients in Cross Section, and as gradient swatches in the figure legend;
- participate in per-layer color/display scaling, snapshots, project JSON version 5 and Undo.

Browser verification added Boron to the upper 50 µm of a 100 µm Oxide layer, confirmed the gradient occupied half the target thickness, and removed/reapplied it through Undo without changing the solid count. No page errors occurred.

## 24. Layer-by-layer material consumption (2026-08-28)

Push down and Isotropic etch no longer write a substrate-only cut through unchanged films. They start at the local active surface and consume the 2.5D stack in physical depth order:

- `/api/geometry/split-by-mask` splits each affected solid footprint into outside-mask and inside-mask polygons;
- outside-mask polygons retain their complete Z interval;
- inside-mask polygons retain only the unconsumed lower portion for front-side etching or upper portion for backside etching;
- once the requested depth passes all films, only the remaining depth becomes a substrate cut;
- fully consumed physical layers are removed from `solids` and their figure-legend metadata is deleted;
- doping regions are split and consumed by the same mask/Z interval, and disappear with a fully consumed target layer.

The operation remains transactional: Boolean results are calculated before the new state is committed, and the complete pre-operation state is available through Undo. This is geometric stack consumption, not chemistry-dependent selectivity.

Browser verification covered a 100 µm Oxide layer with an upper 50 µm Boron region:

- Push 50 µm preserved a 50 µm Oxide remainder and removed the consumed Boron region;
- a second Push 50 µm removed Oxide and its legend entry;
- two Undo operations restored first the partial film and then the original full film plus doping;
- Push 150 µm removed Oxide and continued exactly 50 µm into the substrate;
- no page errors occurred.

## 25. Editable material names in the figure legend (2026-08-28)

Clicking a figure-legend row now opens a `Material name` field together with its existing color and per-layer Z scale controls. Renaming is a model-data change, not a display-only alias:

- the substrate updates `wafer.material` and is shown as `Substrate · <material>`;
- Pull/Conformal layers update `material` on every polygon sharing the physical `layerId`;
- doping layers update `dopant` and are shown as `Doping · <dopant>`;
- snapshots and project JSON retain the renamed values, while the doping target-layer selector and 3D material behavior use them immediately.

Color and per-layer Z scale remain visualization-only. Empty material names are rejected. Browser verification renamed `Si` to `Glass`, `Oxide` to `Nitride`, and `Boron` to `Phosphorus`; the legend and doping target selector updated without recreating geometry.

## 26. Axes, global Z, animated face flip, thickness, Fill pattern and Mirror (2026-08-28)

This batch responds to the latest visual/model-control requests:

- `Show axes` in the 3D title toggles red X, green Y and blue Z lines that span far beyond the device, plus X/Y/Z labels and a labelled origin. The long lines act as infinite axes within the camera frustum.
- `Z display` moved from the top toolbar into the Cross Section panel as a vertical slider. `displayZ` now applies the global factor to the substrate as well as films and doping; the previous substrate-height saturation was removed.
- Front/Back now rotates the current 3D camera continuously by 180° about the model's world-Y direction over 720 ms. Top View and Cross Section still flip immediately because they are editing views.
- Figure Legend rows show read-only physical thickness. Solid and doping layers report the exact minimum–maximum Z span among pieces sharing their `layerId`. Substrate remaining thickness accounts for the union of cut Z intervals at representative interior points and displays a range when removal is local.
- Every imported layout layer has independent `Invert`, `Fill pattern`, and `Mirror` checkboxes. Mirror maps local `x → −x` about the layout origin before the global rotation/offset. Fill pattern calls `/api/geometry/fill-holes`, unions border geometry with `gdstk`, removes Boolean hole walks, and uses the filled polygons for both Top View and Imprint. Raw imported polygons are retained and restored when Fill pattern is disabled.
- These three layer transformations lock after that layer has been imprinted. Project JSON is now version 6 and persists `view.zExag`, `view.showAxes`, and the per-layer options/cache while remaining backward-compatible.

Verification completed:

- JavaScript and Python AST syntax checks passed.
- A synthetic four-rectangle frame passed through `/api/geometry/fill-holes` and returned one filled 10 × 10 outer contour rather than a ring.
- Browser verification confirmed the new axes checkbox, vertical Z control/value, substrate `Thickness 500 µm`, animated Back/Front state transition, and `Thickness 450 µm` after a whole-face 50 µm Push.

Known follow-up / not fully verified:

- There was no synthetic GDS/OAS file in this baseline directory, so the new per-layer checkboxes were not exercised end-to-end through the browser file chooser in this batch; the fill backend itself was verified and the frontend passed syntax checks.
- Substrate min–max thickness uses representative interior samples. It is reliable for ordinary disjoint or nested process regions, but an exact planar-partition calculation would be preferable for pathological overlapping cuts or strongly concave custom wafers.
- The face-flip completion and editing-view state were browser-verified; a frame-by-frame visual regression test of the 720 ms camera trajectory has not yet been added.
