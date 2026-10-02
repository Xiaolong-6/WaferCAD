# Architecture

## Scope

WaferCAD is a static browser application. There is no runtime backend, desktop client, or server-side geometry service in the active architecture.

Product positioning is **Visual Process CAD / geometric process emulation**. The architecture is optimized for fast mask-to-topography reasoning and synchronized inspection, not for predictive process physics. The canonical model therefore stays vector 2.5D, while higher-detail morphology and Implant visualization are explicit render/annotation layers with documented limits.

The product is centered on four synchronized views: Mask, 3D, Main, and Section A–B.

## Core geometry

The canonical model is a **vector 2.5D region stack**.

Each model contains:

- a vector base boundary in XY;
- non-overlapping XY polygon regions;
- an ordered Z stack for each region;
- stable layer IDs with editable display name and color;
- optional deterministic surface-appearance metadata on exposed front/back segment faces;
- Implant annotations stored separately from material layers and clipped against current material geometry for rendering.

A region is conceptually:

```text
Region
├─ geom: MultiPolygon in XY
└─ stack
   ├─ { layerId, z0, z1 }
   └─ ...
```

X, Y and Z are physical geometry stored internally in micrometres. The UI has one global display/input-unit layer (nm / µm / mm) for all three axes.

The model is intentionally 2.5D: XY footprints are vector polygons and vertical structure is represented by Z intervals. This is sufficient for the current Deposit, Extend, Etch, Directional, and Conformal workflows without introducing a full arbitrary-solid B-rep kernel.

## Modules

### `site/app.js`

Owns application state, UI orchestration, 2D viewport interaction, undo/redo, project persistence, and synchronization between the views. The 3D renderer is delegated to a focused controller rather than implemented inline.

### `site/model.js`

Owns the region-stack model and geometry semantics:

- base creation;
- stable layer IDs;
- Deposit (`add` internally);
- Extend (`grow` internally);
- Etch;
- Directional/Conformal coverage behavior;
- front/back surface access;
- stochastic Rough / Pyramid surface-appearance normalization and polarity;
- structural Implant creation as a non-material annotation;
- layer rename/color metadata.

### `site/three-view.js`

Owns Three.js dependency loading, renderer/camera/OrbitControls lifecycle, event-driven frame scheduling, polygon extrusion, ROI clipping, opacity/border inspection state consumption, Fit behavior, physical GLB export, high-resolution PNG capture, and graceful degradation when the external 3D dependency is unavailable. Rough/Pyramid caps use scope-aware bounded tessellation plus profile-derived vertex normals, so full-model views receive a larger mesh budget while ROI inspection retains fine relief. Inherited rough interfaces are rendered on both sides of a material boundary with a shared displacement direction, allowing conformal display shells to keep the same micro-profile instead of exposing the ideal process plane. Ideal horizontal border segments are suppressed wherever a displaced rough boundary is rendered. No separate bump/noise texture is added. Implant is rendered as a clipped translucent internal volume plus its current exposed/cut surface; its body/cap contrast is preserved while alpha scales with the global 3D opacity. GLB export scales canonical µm coordinates by 1e-6 so downstream glTF software receives metres; render-only morphology and Implant overlays are not promoted into the canonical material solid.

### `site/section-editor.js`

Owns explicit A/B handle interaction, fixed CSS-pixel targets, grab offsets, pointer capture/cancellation and keyboard editing. Application callbacks supply canonical coordinates and the current viewport/face transform.

### `site/model-view-geometry.js`

Derives Section material contours, same-material/same-height Main surface groups, rough appearance-boundary groups, clipped Implant fragments/solids, and 3D material boundaries from the canonical region-stack model. Rough appearance groups include exposed faces and inherited buried interfaces so adjacent materials can share one visual heightfield without changing the ideal stack. Exact-Z slabs union each material footprint; only footprint differences produce horizontal faces and border lines. Computation partitions are not visible interfaces. ROI clipping leaves the model unchanged.

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

Owns display/input-unit conversions. Internal X, Y and Z remain µm; nm/µm/mm changes are presentation/input conversions only. User-entered/displayed length fields use a 1 nm quantization boundary. Imported geometry and internal vector operations retain their working precision; project persistence separately normalizes physical lengths and coordinates to 0.1 nm.

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

## Directional and Conformal

Directional coverage preserves the selected XY footprint.

Conformal coverage uses one shared coating kernel for Deposit and Extend. Stage 1 coats every exposed material surface in the selected area by the requested physical thickness: Deposit uses a newly created layer id, while Extend reuses the selected target layer id so contiguous material merges during stack normalization. Directional Extend remains narrower and only thickens locations where the target layer is already exposed. Conformal Extend still requires the target to be exposed somewhere in the selected area before it can be continued. Stage 2 re-reads the newly coated surface, offsets genuine step boundaries outward by the same physical distance, and fills the vertical sidewall interval with the same layer id.

Etch performs physical vertical subtraction and does not accept a coverage mode. The optional Surface mode can attach render-only Stochastic Rough or Pyramid morphology to the newly exposed face, with Normal/Inverted polarity. That appearance metadata does not modify the canonical Z stack. Supported material-geometry fixtures and the through-void limitation are documented and locked by [process benchmarks](PROCESS_BENCHMARKS.md).

## Views

### Mask

Mask is a source-neutral workstation view. **File** mode renders the imported vector layout over an outline-only reference derived from current active-face surface topography; **Draw** mode renders project-local Rectangle/Circle/Polygon/Ring/Ring Sector geometry in canonical wafer/world coordinates. Same-height material boundaries are collapsed so the reference communicates process steps rather than material color. Non-smooth surface regions receive only a subtle neutral darkening; material/mask colors are not changed. Imported layout data and Draw geometry are stored separately. A single active-mask geometry boundary feeds Process Selected/Invert operations, while Mask opacity remains display-only. 3D ROI geometry is edited in Main rather than Mask.

### Main

Renders top/bottom surface patches directly from region polygons. Step boundaries come from exact region geometry. Rough/Pyramid regions keep the same material color with a subtle neutral darkening, and Implant uses a deliberately light translucent overlay so the underlying structure remains dominant.

### 3D

Extrudes vector polygons between each segment's physical-`µm` `z0` and `z1`. 3D uses `zDisplayScale()` only to exaggerate Z visually; process geometry remains in physical coordinates. Rough/Pyramid boundaries are geometry-displaced from the shared deterministic morphology field. When deposition/growth inherits a rough profile, the renderer reuses that same XY field for the buried interface and the outer surface, producing a vertically offset conformal display shell while leaving canonical process Z intervals ideal. This is a visualization model, not a normal-offset deposition solver. Implant volumes are clipped to the currently surviving material geometry and follow current rough cut surfaces; their opacity also follows the global 3D opacity control. The optional ROI clips rendering only; it does not change the model.

The renderer is event-driven: it renders on model/view changes and while OrbitControls damping is settling rather than running an unconditional 60 fps loop. For transparent inspection, border line segments render before transparent meshes and do not write depth, so material opacity continuously controls how strongly occluded borders show through. Opaque mode keeps normal depth-tested borders. Three.js is loaded as an optional external dependency; if it is unavailable, the rest of WaferCAD remains usable and only the 3D view is degraded.

### Section A–B

Intersects the A–B line with every region polygon, then draws each region stack over the resulting line intervals. Rough/Pyramid boundaries sample the same morphology field used by 3D, so the cross-section is the reference profile for displaced surface rendering. Implant appears as a clipped gradient band whose outer boundary follows the current exposed morphology. Main, Mask, and Section have vector SVG exporters that reuse the same canonical geometry/view transforms. All four scientific views support an in-page maximize/restore inspection state; this state is display-only and is not persisted in the project.

## Units

- XYZ canonical storage: µm
- XYZ display/input: nm, µm, or mm

Changing the global display/input unit never rescales geometry. Base dimensions, alignment offsets, axes, cursor readouts, A–B span, base Z thickness, operation Z thickness/depth, and Section Z labels all use the selected unit. Section has two display-only modes: **Auto** fits X and Z independently and reports the resulting Z exaggeration, while **1:1** uses one shared px/µm scale and disables screen-space sidewall widening. 3D applies its own adaptive display-only Z exaggeration.

## Workspace layout

The editor uses CSS Grid without changing the underlying DOM/view ownership. At widths above 900 px, the landscape grid is **Main / Mask / Function** on row one and **3D / Section** on row two. The six-column allocation remains 2/2/2 on the first row and 2/4 on the second row, so reordering does not resize the panels.

At widths up to 900 px, the existing narrow layout is preserved: **Function/3D**, **Main/Mask**, then **Section**. Layout changes are presentation-only and do not alter view state, geometry, or project serialization.

## Persistence

Projects are JSON files with format identifier `WaferCAD-vector` plus an explicit format version.

The current project format is **v13**. It stores the vector model, imported layout data, selected global layers, active cell, mask alignment, active mask source (File/Draw), project-local Draw mask geometry, active face, Rect/Circle/Sector ROI and its reference point, section line, plan-view state, XYZ display unit, structure palette preference, 3D opacity/border state, named snapshots, Implant annotations, and validated surface-appearance metadata. The **Project** tool tab is the default tab. Browser persistence has two layers: continuous autosave keeps the current workspace in IndexedDB, while **Save** creates an explicit local Recovery checkpoint. **Export** is the separate action that downloads a `.wafercad` file; Recovery checkpoints can be restored or cleared without deleting the current autosaved workspace. v12 introduced explicit stochastic morphology/polarity; v13 adds Pyramid morphology. Older supported versions migrate forward with deterministic defaults. Snapshot state never recursively contains the snapshot list. On disk, repeated snapshot layouts and unchanged models are interned into shared assets; physical coordinates and lengths are normalized to 0.1 nm at the persistence boundary while runtime geometry keeps its working precision.

`site/project-schema.js` owns migration into the current version before validation. Legacy files without an explicit version are migrated with deterministic defaults rather than inheriting unrelated session state.

## Project-file boundary

`site/project-io.js` is the browser file-IO boundary. `site/project-schema.js` validates parsed JSON before any project object is assigned to live application state.

Validation includes:

- supported format and vector-kernel identifier;
- finite/positive model dimensions;
- polygon/ring/point shape and project-wide geometry budgets;
- unique layer/region IDs and valid stack layer references;
- ordered, non-overlapping Z stack segments with `z1 > z0`;
- validated stochastic/Pyramid surface morphology, polarity, relief bounds, seeds, and profile IDs;
- Implant identity, geometry patches, visibility, depth/tilt, and palette color metadata;
- layout elements, bounds, layer combinations, and hierarchy;
- mask transform, active face, ROI/reference point, A–B section, plan views, and display/3D inspect settings;
- region containment/non-overlap and base-boundary consistency;
- conservative limits on file size, decompression size, and collection sizes;
- named snapshot records, including non-recursive validated workspace state.

This is a trust boundary: renderers and operation code may assume an opened project has passed these checks.
