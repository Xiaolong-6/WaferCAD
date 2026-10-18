# Rough boundary geometry audit, 2026-10-15

Repository: `Xiaolong-6/WaferCAD`. Baseline: PR #250 at
`f76c8e02a2e9944dcea72ea1db3410727bb9a67d`. Implementation remains on
`fix/3d-rough-seams-transparent-outlines-20261015`; this report does not authorize
merging. Browser image review, hardware measurements and CI are recorded in the
parent PR audit.

## Confirmed geometry causes

1. The cap boundary used power-of-two triangle LOD, while walls independently
   sampled the continuous morphology at a feature-size-derived step. Even two
   exactly matching height evaluators produce different piecewise-linear curves
   when their vertices differ. The deterministic pyramid regression below
   reproduces a **0.148108005008182 um** midpoint separation before repair.
2. Unequal cap LOD was joined using vertical curtain triangles. Their fine edge
   was shader displaced while their interpolated coarse edge could use CPU
   values; the coarse cap and stitch therefore had distinct evaluation paths.
   A two-triangle unit-square fixture produced **eight vertical triangles** with
   zero XY projected area. The repair emits **zero** such seam sheets.
3. Long walls used a midpoint fallback to select a rough cap even when the cap
   covered only part of the wall. Ownership metadata now splits the render wall
   at cap interval endpoints and selects a fully containing cap.
4. Array wall parts retained leaf-local cap indices after parent cap grouping
   and smooth-substrate consolidation. The final parent cap indices are now
   remapped before grouped wall decoration. A two-template regression verifies
   distinct seeds 11 and 22 against the final parent cap array.

## Boundary contract and repair

`roughMeshDataFromPreparedCap()` returns `roughBoundaryPositions`, a transferable
Float32 segment buffer containing the actual XYZ endpoints of every exterior
cap edge, including buried cap boundaries. `roughBorderPositions` retains its
exposed-only presentation meaning. `geometryFromRoughMeshData()` preserves both
buffers in derived geometry metadata.

Every zone edge uses the union of neighboring zone samples and physical wall
split endpoints. Only triangles touching an inserted sample are refined; the
original interior mesh density and LOD requests remain unchanged. A local center
fan avoids degenerate collinear ears when several triangle edges need splitting.
Closure skirts are skipped where real walls exist, and zero-area Float32 closure
triangles are omitted.

Cap boundary vertices are evaluated once on the CPU at their actual Float32 XY
coordinates. GPU interior displacement remains enabled. The displacement
attribute uses `1` for GPU cap vertices, `0` for pinned cap vertices, and `-1` for
ideal closure triangles. The fragment normal domain is derived per vertex using
`step(0, flag)`: all cap triangles retain one continuous shading domain even when
some vertices are pinned. The initial separate displacement/normal treatment
created dark dotted normal cutoffs in browser review; those artifacts prompted
this additional repair. The GPU program cache version is now v4.

`rough-boundary-profile.js` indexes the actual cap segments.
`sidewallBoundarySamples()` unions lower and upper breakpoints and interpolates
the cap polylines. ROI/buried contour consumers use the same profile buffer.
Missing profiles retain a deterministic bounded CPU preview fallback; that
fallback is not evidence of an accepted final cap/wall join.

## Numerical invariants and limits

- For matching cap samples, CPU and GPU boundary buffers are exactly identical
  Float32 values; the explicit shared-profile regression has zero endpoint
  mismatch.
- CPU and GPU meshes with unequal and partially overlapping zone edges have
  exact paired nonphysical edges in the tested fixtures. The curved ring
  regression additionally verifies exact edge pairing under alternating LOD.
- The unit-square conforming cap retains signed projected area 1 within `1e-7`.
- Slanted ROI segment matching allows only Float32 coordinate representation
  error: `max(1e-10, maxAbsXY * 2^-22)` um. The focused slanted interpolation
  fixture checks Z agreement within `3e-7` um.
- Distinct upper/lower cap LOD may introduce sidewall vertices collinear with a
  coarser cap edge. Such geometric joins are closed within the Float32 bound;
  this does **not** claim that the complete multi-layer mesh is a single welded
  manifold with no collinear T-junctions. Same-plane LOD joins are explicitly
  conforming and pass exact edge pairing.
- These changes do not modify the morphology field, feature-size/height
  parameters, seeds, physical material ownership, or canonical Process geometry.
  Ownership-decoration and array regressions assert deep equality of the input
  canonical model before and after renderer preparation.
- Interior GPU/CPU floating-point height agreement is measured independently by
  browser GPU readback in the acceptance workline. Boundary continuity no longer
  depends on identical transcendental implementations across CPU and GPU.

## Reproduction and checks

The Node fixtures live in `rough-boundary-profile.test.mjs`,
`rough-mesh-geometry.test.mjs`, `renderer-geometry-cache.test.mjs`, and
`model-array.test.mjs`. The crack fixture is a pyramid profile with feature size
0.37 um, mean/etch height 0.2 um, zero CV, seed 21, base Z 2 um, on the line from
`[-0.9, 0.023]` to `[0.9, 0.023]`. The unequal LOD fixture is a unit square at Z 0,
stochastic inverted profile, feature size 0.5 um, mean/etch height 0.3 um, feature
CV 0.2, height CV 0.1, seed 21, and zone budgets 16/1.

Executed on Windows, Node v26.7.0, pinned Three 0.179.1:

```sh
node --test site/tests/rough-mesh-geometry.test.mjs site/tests/rough-boundary-profile.test.mjs site/tests/gpu-rough-surface.test.mjs site/tests/renderer-geometry-cache.test.mjs site/tests/model-array.test.mjs site/tests/sahli-example.test.mjs site/tests/renderer-line-reduction.test.mjs site/tests/renderer-instancing.test.mjs
node scripts/rough-boundary-audit.mjs
```

The final focused combined run passed 62 tests, including the zero-height skirt
regression. The parent integration run owns the full final Node gate.

## CPU preparation performance

`scripts/rough-boundary-audit.mjs` compares the exact baseline module with the
current module using the same 32-edge ring, 64 triangle zones, alternating
16/256 triangle budgets, and a deterministic stochastic field. It runs five
warmup iterations followed by 20 measured iterations. The JSON artifact is
`output/playwright/pr250-audit/geometry-cpu-performance.json`.

| Metric                 |      Baseline |        Repair |
| ---------------------- | ------------: | ------------: |
| CPU preparation median |       4.85 ms |      13.06 ms |
| CPU preparation p95    |       7.27 ms |      19.52 ms |
| Output triangles       |         9,216 |         9,010 |
| Typed result buffers   | 774,144 bytes | 772,200 bytes |

The remaining cost is shared boundary construction and conforming edge lookup;
the repair adds about 8.2 ms for this deliberately mixed-LOD 9k-face preparation
fixture. It reduces faces and transferred buffer size. An early implementation
that normalized every triangle edge cost about 48 ms and was replaced with
precomputed perimeter edge lookup. These numbers are CPU preparation results,
not frame-time or GPU-memory claims. Browser worker/array measurements and
visual review must determine whether the integrated performance is acceptable.

Final merge remains blocked on the required CI, visual and performance review,
and explicit user merge authorization.
