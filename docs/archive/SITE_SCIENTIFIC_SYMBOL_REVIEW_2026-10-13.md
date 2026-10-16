# Scientific symbol reachability review (2026-10-13)

## Evidence and boundary

The AST-based source audit found six unused local bindings in Geometry
Kernel and display renderer modules. Each occurred only at its declaration.
None was exported or registered as a callback.

- `model.js`: an unread `maskBoundsCache` WeakMap allocation, and
  `uncoveredGeometry()`, an uncalled wrapper around
  `uncoveredGeometryRaw()`. The underlying topology routine remains.
- `plan-renderers.js`: unused `x0` / `x1` local screen coordinates
  after profile generation. All profile sampling and drawing remain.
- `renderer-line-reduction.js`: unused `compatibleWall()` helper.
  The active sidewall grouping, ownership checks and reduction paths
  remain unchanged.
- `surface-rendering.js`: unused `roughNoise2D()` helper. Active
  roughness, heightfield and pyramid computations remain intact.

This branch removes only these disconnected local declarations. The
scientific calculations, public exports, and runtime branch selection
are unchanged. The full AST scan includes the production sources and
tests; a source-level no-unused-binding assertion guards regressions.

## Required acceptance

Run Quality/Node tests and the Geometry Kernel, Section, roughness,
3D renderer, and real-project browser gates before treating this as
verified. The report alone cannot prove pixel-level or hardware-GPU
equivalence; those require separate evidence. Do not expand deletion
into geometry or renderer exports based on this audit.
