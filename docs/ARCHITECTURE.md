# Architecture — v0.3 (modular frontend)

## Domain vs renderer

The central invariant is:

```text
physical editor state != Three.js scene
```

The current physical state is 2.5D polygonal geometry in micrometres plus `Three.js` derived views. `displayZ` at `×1` is now true isotropic (`z*waferXYScale()`), higher values are exaggeration.

## Components

### `app.py`

Small FastAPI host + GDS adapter + geometry kernel (`gdstk`).

Endpoints: `/api/gds/inspect` (any cell as active, per-cell breakdown, hierarchy), `/api/geometry/*` (`intersection`, `mask-regions` with `invert` as `S\mask` vs `S∩mask`, `isotropic-offset`, `split-by-mask`, `fill-holes` with bridge removal, `substrate-thickness` via planar partition).

`gdstk` objects are converted immediately to neutral JSON polygons so the rest of the project does not depend on `gdstk` types. Hierarchy is preserved for browsing but the editor still consumes a flattened view of the active cell.

### `static/app.js` + `static/js/*`

`static/app.js` is now a thin orchestrator; domain logic lives in `static/js/` (ES modules, imported via importmap). Split occurred at v0.3 when the single-file vertical slice exceeded maintainability.

- `static/js/core.js` — state plus the revisioned `commitState()` transaction and IndexedDB repository. Structured state and the source layout Blob are stored separately; Web Storage is marker-only and legacy payloads are migrated on restore.
- `static/js/geometry.js` — `normalizeWafer`, `waferOutline` (circle/rect/custom + `Main flat/Notch` at `-Y` auto-sized per SEMI M1 via `waferFlatLengthMm/waferNotchDepthMm`), `waferBounds/viewAspectBounds/waferXYScale`, `bboxPolys/polygonArea/orient/isSimplePolygon/pointInPoly/centroid/detectBorderOnly/polyBbox/bboxIntersects/isPolyInViewport/linePolyIntervals/lineCircleInterval`.
- `static/js/geometry-api.js` — thin `fetch` wrappers for clipping, mask composition, offsets, material splits and the exact planar top-surface partition.
- `static/js/layer-model.js` — `materialColor/validColor/validLayerScale/nextLayerName/ensureLayerVisuals/layerVisual/solidLayerDescriptors/outerLayerPosition/relativeThickness/displayZ/mappedSolidBounds/mappedDopingBounds/mappedCutBounds/substrateVisualHeight/pieceThicknessRange/substrateThicknessRange/layerLegendEntries/formatThickness/editableLayerMaterial/renameLayerMaterial/physicalLayerOptions`. `Physical` mode uses true `×1` (`z*waferXYScale()*zExag`); `Relative thickness` uses `relativeThickness(t_um)=1+log10(t_um*1000)` per complete layer (clamped 0.25, e.g., 1 nm=1…500 µm≈6.7) × `zExag` (now `Display scale`) × per-layer `scale`, logarithmic between layers and linear within each layer. `mappedSolidBounds`/`mappedDopingBounds` stack front layers upward from 0 and back layers downward from the substrate visual bottom; partial etches and doping are proportional fractions of the full layer height.
- `static/js/layout-model.js` — `normalizeGds`, `transformPoint` (`scale→mirror→rotate→offset` about layout origin), `effectiveLayerPolygons/transformedLayerPolygon/transformedGdsBounds/patternSelectedLayers/patternRawMaskPolygons/patternHasBlockedBorder`.
- `static/js/legend-controller.js` — `createLegendController` (figure legend render, `refreshExactThickness` → `POST /api/geometry/substrate-thickness` with `atoms/exact`, edit/delete dialogs, delegated click `z-index 30`).
- `static/js/svg.js` — `NS/makeSvg/clearSvg`.
- `static/app.js` — coordinates `THREE`/`OrbitControls`, dialogs, process commands and derived views. The remaining process-command extraction is deliberately incremental rather than claiming this file is already a thin orchestrator.
- `static/js/project-schema.js` — validates project JSON, rejects future/invalid input and migrates versions 1–8 to v9 (legacy `log`→`relative`, `zLogK` retired, `baseThickness` added).
- `static/js/snapshot-store.js` — content-addresses immutable device geometry and thumbnails; snapshot cards contain references rather than full copies.
- `static/js/core.js` — revisioned in-memory state and the serialized IndexedDB repository boundary.
- `static/js/legend-controller.js` — exact-thickness requests are keyed by a geometry revision and discard stale responses.

Previous monolithic `static/app.js` is preserved in git history (`515cd33` and earlier).

## Geometry units

All internal physical coordinates are µm.

For GDS:

```text
raw GDS coordinate × library_unit [m] × 1e6 → µm
```

Display `Physical ×1` is isotropic (`z*waferXYScale()`). `Relative thickness` is automatic (`relativeThickness` per complete layer × `zExag` × per-layer `scale`), clamped to 0.25. Both are visualization only.

## Why 2.5D first

Most initial wafer-process geometry can be represented as planar footprints with vertical extent. This gives:

- simple GDS mapping;
- exact layer-aware top views (with viewport culling);
- fast cross sections (exact substrate partition for thickness);
- deterministic snapshots with 3D camera;
- easy Three.js extrusion (slab + holes).

It is not intended to solve arbitrary free-form 3D CAD. When stacked Boolean exceeds the 2.5D slab model, evaluate a mature BRep kernel before expanding ad-hoc logic.
