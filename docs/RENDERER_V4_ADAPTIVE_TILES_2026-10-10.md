# Renderer V4 — adaptive spatial tiles, R1 handoff (2026-10-10)

## Branch and integration boundary

Repository: `Xiaolong-6/WaferCAD`.
Branch: `perf/renderer-v4-adaptive-tiles-20261010`.
Starting point: PR #166 / `perf/transparent-renderer-v3-20261009`,
HEAD `3b7e6af9d608ea8814217f385cf251be0f4ffb06`.
This is a stacked, experimental branch. Its review target is V3, **not main**.
PR #166 remains Draft, unmerged and the source of truth for the transparent
pass experiments. Do not promote either experiment to production.

## Why R1 is diagnostic only

A historical 625-site transparent Quality test submitted **57,040,012 triangles
and 1,408 draw calls** under the default policy. The V3 opt-in planar cap pilot
reduced these submissions to 54,066,262 / 1,291 with exact same-pose screenshots
in the historical software-WebGL trial. This is historical V3 evidence, not a
V4 benchmark. The newer instrumented hardware A/B remains unverified;
see [PR #166 continued acceptance](PR166_ACCEPTANCE_2026-10-10.md).

Small projected geometry is not sufficient evidence for removing transparent
layer interfaces, for replacing alpha compositing, or for preserving near/edge-on
appearance. V3 diagnostic projections and tile bounds already fail closed on
near-plane uncertainty. V4 must also prove stable spatial identity,
repeatability, camera-response costs and actual mesh replacement before
changing the submission path.

## R1 implementation (first cut)

- `site/renderer-v4-adaptive-tiles.js` implements pure screen-space
  bounding-volume classification of smooth buried array sidewall owners.
  Physical XY and Z are inputs only. Bounded 64-instance tiles (configurable
  through validated limits), deterministic translation ordering, camera
  projection, ROI/Section Z/edge-on guards, near/mid/far footprint tiers and
  20% hysteresis are isolated from Three and the Process Kernel.
- `site/three-view.js` provides an opt-in scene-build observation:
  `?rendererV4TileProbe=1`. It publishes `data-v4-tile-*` host attributes
  for status, gate, probe duration, tier counts, offscreen and uncertain
  volumes, overflow and a bounded sample. Tier memory is reset on model
  identity or revision change; unprobed builds publish disabled status.
  Unlike a full scheduler, R1 observes on scene build, not on every camera
  animation frame.
- `site/tests/renderer-v4-adaptive-tiles.test.mjs` covers stable IDs for
  unchanged sources, tier hysteresis, Z display exaggeration, no source
  mutation, failure on malformed input, near/far clipping uncertainty, ROI,
  edge-on, Section collapse, rough exclusion and budget overflow.
- R1 has no tile mesh generation, request queue, GPU buffers, draw-call
  reductions or visibility changes. `skippedTriangles` is **always 0**.
  Exact stored geometry, worker transactions, History, project schema,
  exports and approved visual baselines are untouched.
- All far counts are **candidate workload buckets only**; the reduction
  gate remains `alpha-coverage-unverified` in otherwise eligible views.

## Reproduce and evidence requirements

Use pinned dependencies (`npm ci`), start the static server with
`python -m http.server 4173 --directory site`, and exercise a 625-site
project in 3D with and without `?rendererV4TileProbe=1`.
Check `data-v4-tile-probe-status`, `data-v4-tile-probe-ms`,
`data-v4-tile-total`, `data-v4-tile-near`,
`data-v4-tile-mid`, `data-v4-tile-far`,
`data-v4-tile-uncertain`, `data-v4-tile-overflow` and
`data-v4-tile-skipped-triangles` on the 3D host.

Focused static checks:

```bash
node --test site/tests/renderer-v4-adaptive-tiles.test.mjs site/tests/renderer-v3-tile-bounds.test.mjs
npm run lint
npm run docs:check
npx prettier --check site/renderer-v4-adaptive-tiles.js site/tests/renderer-v4-adaptive-tiles.test.mjs site/three-view.js docs/RENDERER_V4_ADAPTIVE_TILES_2026-10-10.md
```

The runtime A/B must record exact screenshot/pixel parity, native WebGL
draw calls/triangles, backend identity (SwiftShader/software vs hardware),
same-camera near/edge-on/ROI/collapse, and timestamps that distinguish JS
submission from complete frame. Do not treat a passing Node/CI test or a
software-WebGL timing as real hardware acceptance. Measure R1 probe overhead
separately; it is default-off to avoid unquantified build costs.

## Staged gates before a real V4 LOD renderer

1. **R1 audit and baseline:** prove diagnostics are inert, bound their CPU
   overhead and memory, and obtain a fresh 625-site current-head baseline.
2. **R2 spatial identity and cache:** partition instance owners with stable
   revision-aware keys, show per-tile GPU ownership, and evict with bounded
   resources. Compare exact output when every tile uses the original mesh.
3. **R3 safe screen-space LOD:** define per-template geometric error bounds
   (not only projected tile footprint), add hysteresis and seam ownership.
   Only permit replacement for individually proved materials/angles;
   transparent interfaces remain exact until alpha parity is established.
4. **R4 roughness and instancing:** share reusable geometries, combine
   physically consistent boundaries and shading-only subpixel detail;
   preserve silhouettes, Sections, process geometry and GLB exports.
5. **R5 progressive refinement:** camera-movement scheduling with
   cancellation, no stale GPU buffers or input starvation; retain visual
   and geometry acceptance under multiple browser/GPU backends.

Promotion requires a measured, repeatable gain on the same physical GPU and
same viewport/scene, exact or explicitly reviewed toleranced pixel parity,
correct material ownership, zero geometry/History changes, no resource leaks
across zoom/opacity/ROI and full product regressions. No visual baseline
updates without explicit user approval.

## Validation and publication

R1 is intended as an *initial experiment*, not acceptance of V4 or PR #166.
Record exact CI results, browser availability and final branch HEAD in the
Draft PR; any unrun gate remains **pending**, never implicitly passed.
