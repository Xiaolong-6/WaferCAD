# Foreground-first renderer: initial P0 scene continuity

## Scope and status

This is the first narrowly scoped step toward responsive, progressively refined 3D. It does not implement GPU LOD, background WebGL rendering, or fully non-blocking input. The current `site/three-view.js` renderer stays the only rendering engine, and no experimental V3/V4 Index/Caps flags are enabled.

## Implemented

When an opaque/transparent presentation variant needs a new scene (rather than a cached variant swap), the renderer retains the previous completed group in the scene while constructing the replacement group hidden. Once the new group has been assembled and its presentation state applied, the old group is detached and left available in the existing variant cache. A failed variant build disposes the partial group and attempts to restore the complete cached group, preserving a usable viewport.

The existing per-model initial scene rebuild, rough-mesh refinement, and full WebGL draw path are unchanged. They may still cause main-thread stalls or an empty viewport. This work does not claim that GPU rendering is interruptible, or that retained frames remain cheap to draw while a build runs.

## Verification and boundaries

- Branch: `perf/foreground-responsive-rendering-20261012`, forked from current `main`.
- Touches only the variant-build presentation lifecycle and this handoff.
- Preserve canonical geometry in micrometres, layer/Process/ROI identity, project revisions, export geometry, and existing visual policies.
- CI must confirm Node/format/lint, existing 3D and renderer browser regressions. Runtime acceptance is still pending; no physical GPU speedup, FPS, or exact-pixel acceptance is claimed.
- Do not merge this branch into `main` until CI and a focused runtime variant transition are verified.

## Next stages

1. Exercise opaque to transparent to opaque rebuilds with large arrays and injected build exceptions; assert no blank visible scene, no leak and correct final single-group presentation.
2. Separate interaction preview from exact rendering using explicit frame budgets and revision-aware invalidation. Defer expensive scene/mesh work while the user is actively dragging; cancel obsolete builds before publishing.
3. Move chunkable geometry preparation into worker jobs with bounded transfer and upload budgets. Retain valid old output until new output is ready and never treat a preview as exact geometry for scientific inspection or export.
4. Extend proven far-field presentation LOD to more eligible mesh owners, retaining all near/ROI/edge-on exact geometry contracts. Measure input-to-visible-frame latency, long tasks, driver finish timing, triangulation work and memory on both software WebGL and physical hardware.

The existing strict visual acceptance baselines remain unchanged. Preview-specific visual requirements need separate explicit review.