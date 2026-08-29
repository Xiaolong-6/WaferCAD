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

- `static/js/core.js` — `state`, `DEFAULT_WAFER`, `UNIT_TO_UM`, `palette`, `uid/clone/status`, `NS`. Single source of truth for `state.wafer/solids/cuts/dopings/layerVisuals/gds/imprintedFaces/patternSelectedKeys/slice/snapshots/topBounds/zExag/showAxes/maskBaseOpacity/operationUndo/_exactThickness/_topFaceSelection`.
- `static/js/geometry.js` — `normalizeWafer`, `waferOutline` (circle/rect/custom + `Main flat/Notch` at `-Y` auto-sized per SEMI M1 via `waferFlatLengthMm/waferNotchDepthMm`), `waferBounds/viewAspectBounds/waferXYScale`, `bboxPolys/polygonArea/orient/isSimplePolygon/pointInPoly/centroid/detectBorderOnly/polyBbox/bboxIntersects/isPolyInViewport/linePolyIntervals/lineCircleInterval`.
- `static/js/geometry-api.js` — thin `fetch` wrappers `clipPolygonsToWafer`, `resolveMaskRegions`, `isotropicOffset`, `splitPolygonsByMask` (each `POST /api/geometry/*` with waferOutline clip and error mapping).
- `static/js/layer-model.js` — `materialColor/validColor/validLayerScale/nextLayerName/ensureLayerVisuals/layerVisual/solidLayerDescriptors/outerLayerPosition/displayZ/mappedSolidBounds/mappedDopingBounds/pieceThicknessRange/substrateThicknessRange/layerLegendEntries/formatThickness/editableLayerMaterial/renameLayerMaterial/physicalLayerOptions`. `displayZ` and `mapped*Bounds` implement true `×1` (`z*waferXYScale()`) plus global `zExag` and per-layer `scale` (visual only).
- `static/js/layout-model.js` — `normalizeGds`, `transformPoint` (`scale→mirror→rotate→offset` about layout origin), `effectiveLayerPolygons/transformedLayerPolygon/transformedGdsBounds/patternSelectedLayers/patternRawMaskPolygons/patternHasBlockedBorder`.
- `static/js/legend-controller.js` — `createLegendController` (figure legend render, `refreshExactThickness` → `POST /api/geometry/substrate-thickness` with `atoms/exact`, edit/delete dialogs, delegated click `z-index 30`).
- `static/js/svg.js` — `NS/makeSvg/clearSvg`.
- `static/app.js` — owns `THREE`/`OrbitControls` setup, wafer dialog, GDS import (`importGds` preserving aliases/tones/fills/mirrors), `Full faces` (`topLayerAt`) vs `Patterns` (`∪(inverted?S\layer:S∩layer)`) vs legacy `Imprinted`, `push/pull/conformal/isotropic/doping` + layer-by-layer `split-by-mask` consumption, snapshots strip (`thumb` via `preserveDrawingBuffer` + `camera position/target/up`, auto-save on switch), save/open (JSON v7), `renderTop`/`renderSection`/`render3D` derivation, `mask veil`, `Z display`, hierarchy UI (`renderHierarchy`), slice handling.

Previous monolithic `static/app.js` is preserved in git history (`515cd33` and earlier).

## Geometry units

All internal physical coordinates are µm.

For GDS:

```text
raw GDS coordinate × library_unit [m] × 1e6 → µm
```

Display `×1` is isotropic (`z*waferXYScale()`). Global `Z display` and per-layer `scale` are visualization only.

## Why 2.5D first

Most initial wafer-process geometry can be represented as planar footprints with vertical extent. This gives:

- simple GDS mapping;
- exact layer-aware top views (with viewport culling);
- fast cross sections (exact substrate partition for thickness);
- deterministic snapshots with 3D camera;
- easy Three.js extrusion (slab + holes).

It is not intended to solve arbitrary free-form 3D CAD. When stacked Boolean exceeds the 2.5D slab model, evaluate a mature BRep kernel before expanding ad-hoc logic.
