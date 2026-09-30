# Architecture

## Scope

WaferCAD is a static browser application. There is no runtime backend, desktop client, or server-side geometry service in the active architecture.

The product is centered on four synchronized views: Mask, 3D, Main, and Section A–B.

## Core geometry

The canonical model is a **vector 2.5D region stack**.

Each model contains:

- a vector base boundary in XY;
- non-overlapping XY polygon regions;
- an ordered Z stack for each region;
- stable layer IDs with editable display name and color.

A region is conceptually:

```text
Region
├─ geom: MultiPolygon in XY
└─ stack
   ├─ { layerId, z0, z1 }
   └─ ...
```

XY is physical geometry stored internally in micrometres. The UI has a global display-unit layer (nm / µm / mm) that converts only presentation and XY input values. Z is relative.

The model is intentionally 2.5D: XY footprints are vector polygons and vertical structure is represented by Z intervals. This is sufficient for the current Add, Grow, Etch, Direct, and Conformal workflows without introducing a full arbitrary-solid B-rep kernel.

## Modules

### `site/app.js`

Owns application state, UI orchestration, 2D viewport interaction, undo/redo, project persistence, and synchronization between the views. The 3D renderer is delegated to a focused controller rather than implemented inline.

### `site/model.js`

Owns the region-stack model and geometry semantics:

- base creation;
- stable layer IDs;
- Add;
- Grow;
- Etch;
- Direct/Conformal behavior;
- front/back surface access;
- layer rename/color metadata.

### `site/three-view.js`

Owns Three.js dependency loading, renderer/camera/OrbitControls lifecycle, event-driven frame scheduling, polygon extrusion, ROI clipping, opacity/border inspection state consumption, Fit behavior, and graceful degradation when the external 3D dependency is unavailable.

### `site/section-editor.js`

Owns explicit A/B handle interaction, fixed CSS-pixel targets, grab offsets, pointer capture/cancellation and keyboard editing. Application callbacks supply canonical coordinates and the current viewport/face transform.

### `site/model-view-geometry.js`

Derives pure Section slices and exact-Z 3D extrusion groups from the canonical region-stack model. Same-interval polygons are unioned to remove internal extrusion seams; ROI clipping leaves the model unchanged.

### `site/vector-geometry.js`

Owns polygon operations:

- union;
- intersection;
- difference;
- buffer;
- point-in-polygon;
- line/polygon intersection intervals;
- basic vector primitives.

Polygon Boolean operations are provided by the vendored `polygon-clipping` library.

### `site/units.js`

Owns the canonical XY display-unit conversions. Internal XY remains µm; nm/µm/mm changes are presentation/input conversions only.

### `site/workspace-snapshots.js`

Owns named immutable workspace checkpoints independently of the DOM and renderers. It receives capture/restore callbacks from `app.js`, so snapshot storage does not duplicate editor logic. Snapshots have timestamp defaults, can be renamed/restored/deleted, and intentionally contain no thumbnails.

### `site/gds.js`

Parses GDSII directly in the browser:

- cell hierarchy;
- SREF/AREF;
- layer/datatype;
- boundaries;
- width-bearing paths;
- magnification/rotation/reflection;
- GDS `UNITS`.

Coordinates and widths are converted from database units to micrometres on import.

## Cells and Layers

Cells and Layers are deliberately decoupled.

The cell tree represents hierarchy and defines the active subtree. The Layers list is global across the imported layout and contains unique `layer/datatype` pairs.

An operable mask is the union of selected global layers that occur inside the active cell/subtree.

Zero-width linework is not promoted to mask area.

## Operation areas

Every operation receives one vector area:

- **Selected mask** — selected mask geometry clipped to the base;
- **Invert mask** — base minus selected mask;
- **Whole face** — full base boundary.

The operation engine does not infer these from the view.

## Direct and Conformal

Direct growth preserves the selected XY footprint.

Conformal growth expands the selected footprint by the requested relative thickness and applies a sidewall band to adjacent exposed regions. This remains a geometric approximation suitable for the current vertical-stack model.

Etch performs vertical subtraction and does not accept a growth mode. The numeric coupling between relative Z and µm lateral buffering, supported fixtures, and through-void limitation are documented and locked by [process benchmarks](PROCESS_BENCHMARKS.md).

## Views

### Mask

Renders imported vector layout over the base. View zoom/pan never changes mask geometry or alignment scale.

### Main

Renders top/bottom surface patches directly from region polygons. Step boundaries come from exact region geometry.

### 3D

Extrudes vector polygons between each segment's `z0` and `z1`. XY stays in physical geometry coordinates, while relative Z is mapped through a separate visual scale for 3D display. The optional ROI clips rendering only; it does not change the model.

The renderer is event-driven: it renders on model/view changes and while OrbitControls damping is settling rather than running an unconditional 60 fps loop. Three.js is loaded as an optional external dependency; if it is unavailable, the rest of WaferCAD remains usable and only the 3D view is degraded.

### Section A–B

Intersects the A–B line with every region polygon, then draws each region stack over the resulting line intervals.

## Units

- XY canonical storage: µm
- XY display: nm, µm, or mm
- Z: relative

Changing the global XY display unit never rescales geometry. Base dimensions, alignment offsets, XY axes, cursor readouts, and A–B span all use the selected display unit. XY and Z remain intentionally independent.

## Persistence

Projects are JSON files with format identifier `WaferCAD-vector` plus an explicit format version.

The current project format stores the vector model, layout data, selected global layers, active cell, mask alignment, active face, ROI and its reference point, section line, plan-view state, XY display unit, structure palette preference, 3D opacity/border state, and named snapshots. Snapshot state never recursively contains the snapshot list.

`site/project-schema.js` owns migration into the current version before validation. Legacy files without an explicit version are migrated with deterministic defaults rather than inheriting unrelated session state.

## Project-file boundary

`site/project-io.js` is the browser file-IO boundary. `site/project-schema.js` validates parsed JSON before any project object is assigned to live application state.

Validation includes:

- supported format and vector-kernel identifier;
- finite/positive model dimensions;
- polygon/ring/point shape and project-wide geometry budgets;
- unique layer/region IDs and valid stack layer references;
- ordered, non-overlapping Z stack segments with `z1 > z0`;
- layout elements, bounds, layer combinations, and hierarchy;
- mask transform, active face, ROI/reference point, A–B section, plan views, and display/3D inspect settings;
- region containment/non-overlap and base-boundary consistency;
- conservative limits on file size, decompression size, and collection sizes;
- named snapshot records, including non-recursive validated workspace state.

This is a trust boundary: renderers and operation code may assume an opened project has passed these checks.
