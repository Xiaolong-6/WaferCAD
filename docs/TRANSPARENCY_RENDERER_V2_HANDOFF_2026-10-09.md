# Transparency Renderer v2 — measured acceptance and rejected trial (2026-10-09)

**Status: branch-only, pending visual review and latest-main integration.**
PR: [#164](https://github.com/Xiaolong-6/WaferCAD/pull/164).
Starting baseline: `main` at `fbbb2f9f3a585574e20ed706c34653164f13440c`.

## Problem

Native Fig3 full-wafer: 625 sites, 1,885 renderer instances. The exact
Quality transparent path submits approximately 60 million triangles in software
WebGL. This is GPU/WebGL vertex and raster throughput work rather than mainly
CPU scene assembly. The reference 15 s cold Quality and 6 s Fast targets remain
**aspirational, non-blocking performance targets**; scientific correctness and
input responsiveness remain blocking.

## Accepted candidate — smooth planar material-cap single pass

Transparent Three.js `DoubleSide` normally renders distinct back and front
passes. For strictly smooth, single-Z-plane **material caps** in an active
transparent scene, the second pass contributes no additional visible faces.
`site/transparent-pass-policy.js` explicitly scopes `forceSinglePass` to
these material caps. It retains DoubleSide shading and does not enable the
policy for opaque scene variants, sidewalls, rough surfaces, Electrical Region
or Implant volumes, or ROI cuts.

The physical Kernel geometry, stored model, Process/Recipe, History, migration,
Recovery and GLB export are unchanged. The frontend exposes
`sceneSinglePassCapObjects` and `sceneSavedCapTriangleSubmissions` (an
**estimate** of removed duplicate cap submissions, not elapsed GPU time).
Policy tests, 625-site variant-swap assertions and benchmark fields were
added without weakening earlier scientific regression gates.

### Reference comparison (Linux Chromium software WebGL)

| Indicator | Previous integrated baseline | Single-pass cap candidate | Indexing experiment (rejected) |
| --- | ---: | ---: | ---: |
| Quality cold first **completed** frame | 35.50 s | **31.13 s** | 33.42 s |
| Quality warm transparent swap | 34.67 s | **30.21 s** | 32.50 s |
| Fast far transparent first frame | 12.24 s | **11.91 s** | 12.05 s |
| Quality submitted triangles | ~59.96 M | **57.04 M** | 57.04 M |
| Fast far submitted triangles | 18.35 M | **16.91 M** | 16.91 M |

Numbers come from **different** CI executions, not a strict paired
on-machine A/B benchmark. They are useful evidence of relative behavior, not
device-independent guarantees. Timings include the browser's actual completed
frame, using `rendererFrameSerial` instead of stopping at
`renderState=ready`.

- Integrated benchmark baseline: [PR #155](https://github.com/Xiaolong-6/WaferCAD/pull/155).
- Single-pass candidate Browser 625-site/edge-on full **PASS**:
  [run 37906605619](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37906605619)
  (variant timing: 31,126.6 ms cold, 30,210.4 ms warm; Fast far 11,911 ms).
- Same candidate Native Fig3 full replay **PASS**:
  [run 37906605618](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37906605618).
- Same candidate Example Recipe Run All **PASS**:
  [run 37906605651](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37906605651).
- Same candidate Quality **PASS**:
  [run 37902406319](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37902406319).

The 625-site resource and repeated-opacity-switch assertions passed.
The first optimization's speed benefit remains **modest** and does not meet
the 15 s Quality or 6 s Fast goals.

## Rejected experiment — IEEE754-bit-exact indexed vertices

A follow-up added `renderer-exact-index.js` to deduplicate repeated vertex
attributes (position, normal and optional annotation depth) by exact Float32
bits without changing topology, triangle order, or draw sort. New diagnostics
indicated approximately 47.5 million **logical** repeated vertex attributes
could be avoided in exact Quality. Actual submitted triangles stayed at
57.04 million.

The new candidate's full, frame-accurate 625-site/20-toggle regression **PASS**
and all functional test workflows **PASS**, yet its performance was **worse**
than the single-pass baseline: 33,418 ms cold, 32,501 ms warm, and 12,047 ms
Fast far. Therefore the experiment **was reverted**, including runtime
integration, diagnostic counters, isolated module and related tests. Its
results remain documented as a negative benchmark. Do not reintroduce
indexing solely because unit tests pass or the vertex reuse counter is large.

Evidence:
- [Full 625-site browser run 37909092971](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37909092971)
- [Native Fig3 replay 37909092859](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37909092859)
- [Recipe reconstruction 37909093029](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37909093029)
- [Quality 37909076955](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37909076955)

No canonical data, baseline screenshots, API contract or physical export
format were modified. No visual baselines were replaced.

## Remaining integration and acceptance

1. Confirm the **rollback HEAD** again passes Quality and applicable Chromium
   regressions. Previous candidate evidence is not a substitute for a new
   commit's checks; identical runtime sources can be verified by diff.
2. Current `main` advanced substantially while the branch was active.
   Review and integrate without force-push, checking for concurrent changes
   and re-running affected tests. No previous branch commit is auto-merged.
3. Review matching-camera screenshots for opaque, Quality transparency,
   Fast far, edge-on, near/ROI, buried Electrical/Implant volumes, rough and
   conformal seams, and borders. Passing edge-on structural checks alone
   is not a declaration of pixel-identical scientific visual parity.
4. Future larger gains require material/geometry ownership-aware **medium/far
   screen-space LOD or GPU raster improvements**, retaining exact near/ROI,
   annotation visibility, section Z-collapse and canonical data. Re-profile
   before adding another expensive optimization or silently relaxing gates.
5. Record commit SHA, exact commands and latest CI result before a merge
   decision. Do not manually dispatch expensive workflows, force-push,
   weaken assertions or overwrite screenshots merely to satisfy CI.

**Merge status: not merged.**
