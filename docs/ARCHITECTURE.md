# Architecture — v0.2

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

### `static/app.js`

Owns the current project state and all MVP interactions. Still a single file for the vertical slice; split only when a clear boundary appears.

Main responsibilities:

- wafer state (`circle` with optional `Main flat/Notch` at `-Y` auto-sized per SEMI, `rect`, `custom`; `normalizeWafer`/`waferOutline`);
- GDS layer list + `Cell` single-select + `Layers` multi-select (`Use`/`Show`, `isBorderOnly` detection, `Fill` cache);
- transform `scale` about layout origin (`transformPoint` does `scale→mirror→rotate→offset`);
- viewport culling (`isPolyInViewport` vs `topBounds`);
- `Full faces` (topmost solid) vs `Patterns` (combined mask, per-layer `S\layer` ∪ `S∩layer`) vs legacy `Imprinted` for selection;
- push/pull/conformal/isotropic/doping + layer-by-layer `split-by-mask` consumption;
- snapshots as a horizontal strip below `3D` with `thumb` (`preserveDrawingBuffer` `toDataURL`) and `camera` (`position/target/up`), auto-save on switch covering the current archive, `New wafer` confirmation dialog;
- save/open (JSON version 7), top-view geometry, section, `Three.js` derivation, `figure legend` (exact thickness, delegated click), `mask veil` opacity, `Z display` uncapped.

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
