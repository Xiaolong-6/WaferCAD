# Architecture — v0.1

## Domain vs renderer

The central invariant is:

```text
physical editor state != Three.js scene
```

The current physical state is 2.5D polygonal geometry in micrometres. Top view, section view and 3D view are derived outputs.

## Components

### `app.py`

Small FastAPI host + GDS adapter.

The GDS endpoint is intentionally narrow. `gdstk` objects are converted immediately to neutral JSON polygons so the rest of the project does not depend on `gdstk` object types.

### `static/app.js`

Owns the current project state and all MVP interactions.

Main responsibilities:

- wafer state;
- GDS layer list;
- imprint/select;
- push/pull edits;
- snapshots;
- save/open;
- top-view geometry;
- section calculation;
- Three.js derivation.

It is intentionally a single file for the first vertical slice. Split it only when another feature creates a clear boundary.

## Geometry units

All internal physical coordinates are µm.

For GDS:

```text
raw GDS coordinate × library_unit [m] × 1e6 → µm
```

Display coordinates are separate and may exaggerate Z.

## Why 2.5D first

Most initial wafer-process geometry can be represented as planar footprints with vertical extent. This gives:

- simple GDS mapping;
- exact layer-aware top views;
- fast cross sections;
- deterministic snapshots;
- easy Three.js extrusion.

It is not intended to solve arbitrary free-form 3D CAD.
