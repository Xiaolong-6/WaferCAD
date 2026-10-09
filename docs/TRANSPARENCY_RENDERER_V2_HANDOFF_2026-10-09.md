# Transparency Renderer v2 — planar-cap submission reduction (2026-10-09)

**Status: in progress, branch only; not approved for merge.**
Branch: `perf/transparent-renderer-v2-20261009`, based on `main` at `fbbb2f9f3a585574e20ed706c34653164f13440c`.
This note is an implementation handoff and test checklist, **not** a performance or visual acceptance report.

## Problem and baseline

The canonical transparency roadmap records 625-site Native Fig3 at 1,885 array render instances.
The last accepted software-WebGL run on PR #155 recorded **35.50 s** cold Quality
transparency, **34.67 s** warm Quality transparency and roughly **60 million
submitted triangles**. Fast distant transparency had 18,346,852 submitted
triangles and one 12.24 s first-frame observation. These are historical
measurements at an earlier revision, not measurements of this branch.

The exact transparency scene uses `THREE.DoubleSide`. In Three.js, a transparent
double-sided mesh normally requires separate back-face and front-face passes.
A single *smooth planar cap* at a fixed physical Z plane cannot show both sides
to a camera simultaneously; its second pass provides no additional visible
faces. Material sidewalls, rough surfaces and annotation volumes can show
multiple orientations or Z surfaces and must keep the original two-pass policy.

## Implemented candidate

- `site/transparent-pass-policy.js` allows `forceSinglePass` only for a
  **smooth, explicitly marked planar material cap**, in an active transparent
  scene with a transparent material. This is a presentation-material policy.
- `site/three-view.js` marks smooth planar array caps and smooth cap buckets,
  preserving `THREE.DoubleSide` shader/back-face support. Rough surfaces,
  sidewalls, Implant and Electrical Region volumes, and ROI cuts do not opt in.
  Opaque scene variants do not opt in, including their hidden buried faces.
- The scene diagnostics expose `sceneSinglePassCapObjects` and
  `sceneSavedCapTriangleSubmissions`: an **estimated** number of geometry
  submissions avoided versus default two-pass rendering. This is not elapsed
  time or a GPU timer.
- The existing pipeline benchmark collects both counters. The 625-site browser
  regression asserts cold Quality transparency uses the policy, an opaque
  variant does not, and a warm transparent variant preserves the counter.
- `site/tests/transparent-pass-policy.test.mjs` covers allowed and excluded
  presentation cases.

Canonical XY/Z regions, rough morphology, Process Geometry, mask geometry,
History, storage and physical GLB export are unchanged. The active 3D scene
retains all the original polygons and ownership; only the number of
transparent cap draw passes is requested to change.

## Verification status / honest limitations

Source changes were committed via the GitHub repository connector. **No local
Node/Chromium workspace was accessible in this session.** No `npm ci`,
`npm run check`, Playwright run or side-by-side screenshot inspection has been
completed as of this handoff. The committed tests are unexecuted until CI or
a local workspace validates them. Therefore do **not** claim a measured speedup
or merge readiness based on this branch alone.

Required exact-HEAD acceptance:

1. `npm ci && npm run check` and `node --test site/tests/transparent-pass-policy.test.mjs`.
2. Serve `site/` at port 4173 with pinned Three/Chromium configured, then run
   `node scripts/renderer-pipeline-benchmark.mjs` against both `main` and
   this candidate on the same machine, browser, camera, viewport and project.
3. `node scripts/array-renderer-regression.mjs --fast-transparent-lod` and
   `node scripts/array-renderer-edge-on-regression.mjs`; repeat without the
   Fast flag for exact Quality state and cache/20-toggle coverage.
4. Compare opaque, Quality transparent, Fast distant, edge-on, near, ROI,
   buried Implant/Electrical and thin conformal interface screenshots at
   matched camera poses. Check transparent sorting/color differences, buried
   visibility, doubled borders and rough seams before considering acceptance.
5. Record cold/warm complete-frame wall time, `rendererFrameMs`, submitted
   triangles, draw calls, scene resource counts, input response and
   `sceneSavedCapTriangleSubmissions`. First frame requires
   `rendererFrameSerial` advancement, not merely `renderState=ready`.
6. Do not overwrite visual baselines or relax scientific correctness gates.
   If planar-pass sorting causes any scientific visibility error, revert the
   optimization and pursue safe owned-surface reductions instead.

## Next scope (not shipped by this patch)

- Profile cap / sidewall / annotation GPU time on actual hardware as well as
  the software-WebGL reference.
- Explore camera-aware medium/far hierarchical LOD for material buried faces
  and safe batching by Z/material/opacity/tile, with exact near/ROI fallback.
- Consider progressive first useful frame only after guaranteeing correct
  final refinement, no input starvation and bounded cache growth.

Merge to `main`: **not authorized / not performed**.
