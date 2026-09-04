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
- `static/js/layer-model.js` — `materialColor/validColor/validLayerScale/nextLayerName/ensureLayerVisuals/layerVisual/solidLayerDescriptors/outerLayerPosition/relativeThickness/displayZ/mappedSolidBounds/mappedDopingBounds/mappedCutBounds/substrateVisualHeight/pieceThicknessRange/substrateThicknessRange/layerLegendEntries`. `Physical` uses `z*waferXYScale()*physicalZExag` (state.zExag, 8). `Relative` uses `relativeThickness(t_um)=1+log10(t_um*1000)` (zero→0, MIN 0.25) per complete layer × `relativeZScale` (state.relativeZScale, 1) × per-layer scale, logarithmic between layers and linear within, anchored at the local supporting surface (substrate top or the visual top/bottom of the supporting solid(s) found by footprint overlap at the exact Z). Coplanar different layers at same elevation both start at substrate top; mixed-height pieces of the same layer keep the same visual thickness with offset from their local support. Substrate total height `H=relativeThickness(T)*relativeZScale` is mapped with a front/back-symmetric surface-detail `F(d)=(H/2)·ln(1+d/1µm)/ln(1+(T/2)/1µm)` so 1 µm/2 µm trenches are clearly visible. One source of truth: `computeVisualBoundsForPiece`/`substrateVisualZ`/`mappedCutBounds` feed both Three.js and Cross Section.
- `static/js/layout-model.js` — `normalizeGds`, `transformPoint` (`scale→mirror→rotate→offset` about layout origin), `effectiveLayerPolygons/transformedLayerPolygon/transformedGdsBounds/patternSelectedLayers/patternRawMaskPolygons/patternHasBlockedBorder`.
- `static/js/legend-controller.js` — `createLegendController` (figure legend render, `refreshExactThickness` → `POST /api/geometry/substrate-thickness` with `atoms/exact`, edit/delete dialogs, delegated click `z-index 30`).
- `static/js/svg.js` — `NS/makeSvg/clearSvg`.
- `static/app.js` — application wiring, dialogs/input adapters, workspace/GDS integration, project/session restore, snapshot-card DOM and high-level refresh/persistence callbacks. Owns the shared top-surface partition and substrate Boolean caches without duplicating them in views; delegates Top display/interaction and wafer/process/snapshot workflows.
- `static/js/views/top-view.js` — `createTopView` owns SVG projection, scale bar, visible surfaces/selection overlays, physical front/back coordinate mirroring, pan/zoom, A/B handles and coordinate inputs. API: `bind`, `render`, `fitWafer`, `fitLayout`, `destroy`, `diagnostics`. Binding is idempotent; terminal destruction removes owned static/global listeners and pending drag RAF. Surface atoms and cache refresh are injected. Slice callbacks preserve the existing cadence: drag updates Section, release updates Three, explicit coordinates update both and persist. No process mutation, second cache or view-to-view imports.
- `static/js/controllers/wafer-controller.js` — `createWaferController` owns synchronous validation/normalization, new/replacement wafer state, default slice, active-face selection reset and the device portion of session reset. API: `createWafer`, `flipActiveFace`, `reset`, `initializeSlice`, `diagnostics`. Replacement resets physical geometry/undo/selections/projection, but retains snapshots and imported layout as before. Dialog close/refresh, default section configuration, camera animation and persistence are injected. The existing UI replaces rather than offering a separate non-destructive wafer edit mode; none is invented here.
- `static/js/controllers/snapshot-controller.js` — synchronous `create`, `activate`, `delete`, `autoSaveActive`, `listSnapshots`, `diagnostics`. Reads live shared snapshot state rather than caching arrays. Injected device/camera/thumbnail callbacks keep DOM, Three internals and persistence outside. Switching auto-saves the previous record, sets the target ID, restores the device (including existing app refresh/persist), then restores camera and cards. Creation does not auto-save the previous record. Deleting the active record points its ID to the last remaining snapshot without restoring geometry; pruning occurs on deletion only, using unchanged snapshot-store reference rules. No rename/duplicate feature is added. QA counters are opt-in and not persisted.
- `static/js/controllers/process-controller.js` — `createProcessController` owns Push/Pull, conformal/isotropic operations, doping, exact material-depth validation, staged material consumption, process undo and worker cancellation. API: `applyPushPull(options)` (including doping mode), `stop`, `undo`, `recordUndo`, `diagnostics`. UI status/activity, selection clearing, surface-cache invalidation and post-process refresh/persistence are injected callbacks; there are no DOM or view imports. Required asynchronous geometry completes before undo/physical mutation; post-commit QA surface diagnostics are explicitly optional. Generic geometry algorithms remain in their existing modules. `availableMaterialDepth` retains its exact geometry-ID matching and is re-exported by app.js for existing callers.
- `static/js/views/section-view.js` — owns Cross Section rendering, navigation and controls; independent of the Three view.
- `static/js/views/three-view.js` — `createThreeView` owns the scene, camera, controls, meshes, resize observer and RAF lifecycle. Uses the existing import map and shared layer-model mapping; never owns physical process state or Boolean computation. `init` is idempotent, `destroy` is terminal and cancels both RAFs, removes its visibility listener, disconnects the observer and disposes owned resources (including axis textures only at destruction). Snapshot controllers use `captureCamera`/`restoreCamera` and `captureImage`; the saved camera schema is unchanged. Module-instance orchestration adds no window globals. Refill bounding boxes remain QA-only.
- `static/js/project-schema.js` — validates project JSON, rejects future/invalid input and migrates versions 1–8 to v9 (legacy `log`→`relative` with `relativeZScale=1` sensible default, `zLogK` retired, `baseThickness` added, separate `zExag`/`relativeZScale`).
- `static/js/snapshot-store.js` — content-addresses immutable device geometry and thumbnails; snapshot cards contain references rather than full copies.
- `static/js/core.js` — revisioned in-memory state and the serialized IndexedDB repository boundary.
- `static/js/legend-controller.js` — exact-thickness requests are keyed by a geometry revision and discard stale responses.

Previous monolithic `static/app.js` is preserved in git history (`515cd33` and earlier).

Architecture extraction is complete for this scope. App wires independent views/controllers to shared modules; controllers do not import views, views do not import one another, and geometry/model modules do not import app/controllers/views. Remaining shared-state coupling, app-owned derived caches and generic/project UI are intentional boundaries. Surface Texture and the performance backlog remain separate feature work.

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
