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

## R2 implementation — partition preparation and CPU cache (2026-10-10)

R2 is an **opt-in CPU metadata experiment** on the same stacked PR. No
WebGL geometry, materials, draw calls or GPU resources are created or
destroyed by this code. GPU tile ownership remains a separate, unimplemented
acceptance stage.

- `site/renderer-v4-tile-plan.js` prepares a deterministic chunk list and
  per-tile XY bounding volumes, retaining immutable numeric derived values
  for physical Z intervals. The per-camera projection stage reapplies
  current Z-collapse/display transforms and camera matrices. It does not
  memoize a world-to-screen result across camera changes.
- `createAdaptiveTilePlanCache` provides a bounded (default two-entry)
  CPU plan LRU keyed by the exact Surface Plan array identity, revision and
  chunk/owner limits. The 3D view explicitly clears the cache and previous
  LOD tiers when model identity, revision or `plan.sidewalls` changes, even
  when a project mutation reuses a numeric revision.
- R1 `?rendererV4TileProbe=1` keeps its original uncached algorithm.
  R2 `?rendererV4TileCache=1` opts into both the probe and prepared-plan
  execution. Both remain disabled by default and continue to submit
  **identical original render meshes**.
- The R2 cache also supplies a throttled read-only observation during
  OrbitControls movement (at most one sampling attempt per 250 ms).
  This avoids camera-dependent tier diagnostics becoming stale between
  scene rebuilds; `data-v4-tile-cache-camera-samples` and cache-hit
  counters expose whether warm reuse actually happened. Camera sampling
  makes no mesh visibility, render-buffer or GPU allocation changes.
- Host diagnostics add `data-v4-tile-cache-mode`,
  `data-v4-tile-cache-hit`, `data-v4-tile-cache-hits`,
  `data-v4-tile-cache-misses`, `data-v4-tile-cache-evictions` and
  `data-v4-tile-cache-retained-tiles`, besides R1's count and gate data.
  Probe time includes cold preparation or warm cache reuse.
- `site/tests/renderer-v4-tile-plan.test.mjs` tests exact R1/R2 projection
  classification parity in a synthetic tile fixture, cache hits and source
  invalidation, strict capacity/eviction, near-plane unknowns, ROI,
  edge-on, Section transforms, rough exclusion, and scientific-data
  immutability.

### R2 camera-interaction follow-up

The initial 625-site Fast transparent Chromium/SwiftShader browser acceptance
found 130 tiles and exact R1/R2 same-pose pixel parity (**0/146,025**
different pixels). CPU cache preparation had one miss, as expected; actual
OrbitControls movement later produced **22 cache hits** and 22 sampled camera
projections, proving real plan reuse. The post-drag frame sequence took
minutes on SwiftShader because camera damping continues issuing expensive
full-wafer redraws. This is evidence of an interaction bottleneck, not a
GPU performance improvement.

A separate default-off pilot, `?rendererV4HeavyCameraNoDamping=1`, disables
inertial damping only when transparent, at least 64 array instances, and
at least 5 million triangles are measured in the last rendered frame.
It does not change the mesh pipeline, draw submissions or scientific
coordinates. Missing/nonfinite counters fail closed. The paired browser R2
arm combines that flag with `?rendererV4TileCache=1`, asserts the policy
is active after a real drag and records camera-move-to-cache-hit latency.
Preserve ordinary camera easing outside this explicitly gated experiment.
Do not use a one-off software-WebGL interaction time as hardware proof.

**Limitations**: tile IDs are scoped to an individual source plan epoch.
R2 does not have GPU tile ownership, geometry error bounds, cancellation,
progressive refinement, proven draw-call reductions or hardware performance
data. R2 must not be described as a completed LOD replacement or GPU cache.

### R2 focused verification

```bash
node --test site/tests/renderer-v3-tile-bounds.test.mjs site/tests/renderer-v4-adaptive-tiles.test.mjs site/tests/renderer-v4-tile-plan.test.mjs
npm run check:ci
npx prettier --check site/renderer-v4-adaptive-tiles.js site/renderer-v4-tile-plan.js site/tests/renderer-v4-adaptive-tiles.test.mjs site/tests/renderer-v4-tile-plan.test.mjs site/three-view.js docs/RENDERER_V4_ADAPTIVE_TILES_2026-10-10.md
```

For browser acceptance, open the same real 3D project twice, with
`?rendererV4TileProbe=1` and `?rendererV4TileCache=1`. Compare identical
camera poses, pixel output and draw/triangle counts. Change camera, zoom,
ROI and Section Z, then verify no stale cache and no resource growth.
For a cache-hit test, move the actual 3D camera while retaining the same
Surface Plan, and require nonzero `v4TileCacheHits` and
`v4TileCacheCameraSamples`. The browser acceptance script performs this
after recording paired same-pose screenshots. A zero-hit run is not evidence
of reuse. Hardware
WebGL identity and GPU frame completion still require independent checking.

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

R1 is intended as an _initial experiment_, not acceptance of V4 or PR #166.
Record exact CI results, browser availability and final branch HEAD in the
Draft PR; any unrun gate remains **pending**, never implicitly passed.


## R2 verified checkpoint — 2026-10-10

- [Full R1/R2 focused CI](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38063163584):
  **27/27 focused V3/V4 tests** and **634/634 full Node tests**, zero
  failures/skips; ESLint, Prettier and documentation gate passed.
- [One-pose 625-site browser run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38063174708):
  Chromium/Playwright under Linux SwiftShader software WebGL, not a physical
  hardware GPU result. At 1440x960 viewport, Fast transparent with 1,885
  reported array instances and model revision 61, both flags submitted
  **16,906,262 triangles / 1,408 calls** and retained 880 objects, 880
  geometries and 588 materials. The **531x275** canvas had **0/146,025**
  changed pixels (max channel delta zero) between R1 and R2.
- R2 prepared 130 CPU tiles (128 near, two mid, zero far), retained 130 tiles,
  and recorded one cold miss. The actual camera gesture yielded **13 warm
  cache hits / 13 camera samples**, confirming reusable CPU metadata.
  Section Z collapse remained a strict `z-collapse` reduction gate, and
  the experiment submitted **zero skipped triangles**.
- The opt-in heavy-camera policy was active during the R2 camera gesture.
  However, the measured Playwright drag-to-cache-hit interval was **132.74 s**
  on this software-WebGL runner. This includes pointer event processing,
  scene/WebGL work and browser scheduling, and is not a GPU execution timer.
  The earlier non-inertia-pilot drag had 22 samples and also took minutes;
  the trials are not a controlled latency A/B. **No product interaction
  speedup is accepted.**
- The original build-stage R1 probe was about 23.9 ms versus about 40.1 ms
  for the R2 cold plan/projection at this run. This is diagnostic CPU
  overhead, not total renderer cost or repeatable profiling; do not present
  caching as a cold-start win.

**R2 acceptance boundary:** stable derived CPU partitioning, bounded
lifecycle, real cache hits, same-pose canvas parity and regression tests are
validated. GPU tile ownership, real GPU timers, reduced WebGL submissions,
edge-on/ROI multiview canvas parity, resource lifetime over prolonged model
edits and repeatable motion speedup remain **open**. In particular, the
64-instance tile screen footprint classifies most groups as near despite the
Fast far-wafer tier; R3 needs structure/template-level projected error and
transparent-material coverage proof before removing any face. Keep both R2
interaction flags default-off, PR #166 and PR #174 Draft, and approved
visual baselines unchanged.
