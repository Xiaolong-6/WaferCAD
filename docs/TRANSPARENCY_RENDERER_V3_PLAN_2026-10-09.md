# Transparency Renderer v3 — hierarchical LOD execution and acceptance (2026-10-09)

**Status: experimental branch, observe-only Phase A.** Branch:
`perf/transparent-renderer-v3-20261009`, created at `main`
`b81598b7d8f4c5e7d246df250c82b9de4c2d4178` (PR #164 merge).
**Do not merge before scientific visual and performance acceptance.**

## Why v3

At full Native Fig3 625-site / 1,885 render instances, integrated v2 still
takes approximately **34.00 s Quality cold**, **33.51 s warm**, and **11.77 s
Fast distant** on the software-WebGL CI runner. Exact Quality submits
**57,040,012 triangles and 1,408 draw calls** despite existing scene
caching. The <15 s Quality and <6 s Fast targets remain *advisory*.

Frame work is dominated by buried material-interface and Electrical Region
surfaces. Prior v2 trials established that transparent planar caps can safely
skip a duplicate back/front pass but bit-exact vertex indexing **does not**
improve measured first-frame latency. Repeating cache or vertex-count
experiments without frame-accurate benchmarks is not useful.

## Scientific and UI contracts

- Canonical µm geometry, ROI, Mask, Process, Recipe, History, project migration,
  worker transactions, Recovery and physical GLB export must remain unchanged.
- Near, ROI, edge-on, Section Z-collapse/cuts, rough surfaces and meaningful
  buried Electrical/Implant interfaces must have an **exact fallback**.
- Maintain current opacity/color, transparent depth order, owned layer
  boundaries, coincident material interfaces and annotation coverage.
- Any approximation is confined to *presentation-derived GPU meshes* and must
  reconstruct the accurate version when zoom/quality/ROI/camera state changes.
- Changes to baseline screenshots are prohibited without explicit approval.
  CI pass without matching-camera near/far/edge-on screenshot review is
  insufficient.

## Phase A — observe-only screen-space budget (current first commit series)

New `site/renderer-v3-screen-budget.js` classifies *potential* far-camera
subpixel buried **smooth** array sidewall segments. Inputs include the active
camera's micrometres per pixel, view angle, ROI/collapse state and ownership
metadata. It accepts only a Fast far-tier camera, at least 64 translated
instances, and an interior smooth physical Z interval whose
`abs(z1-z0) * effectiveDisplayZScale / unitsPerPixel <= 0.5`. The projected-height estimate is diagnostic at the camera target, not an
exact perspective-space visibility proof for every instance. Invalid
viewport, edge-on, ROI, disabled camera and active Section collapse fail closed.

- `v3ScreenBudgetMode='observe-only'` and `v3SkippedTriangles='0'` at all
  times; **no triangles, polygons or materials are removed** in Phase A.
- `v3SubpixelWallCandidates`, `v3SubpixelWallInstances` and
  `v3SubpixelRawTriangleEstimate` estimate a *raw* far-field candidate
  budget. The estimate does not account for exact edge-chain merging,
  frustum culling, material visibility or raster timing and is **not** a
  guarantee of achievable savings.
- Variant cache snapshots must restore their own telemetry; values from
  Fast far transparency cannot leak into opaque or Quality inspection.
- The 625-site script asserts zero skipped triangles, while the pipeline
  benchmark records telemetry. Unit tests cover near, ROI, Z-collapse,
  edge-on, malformed data, rough boundaries, exact physical Z and no mutation.

### Phase A gate

1. Verify `npm ci`, `npm run check` and
   `node --test site/tests/renderer-v3-screen-budget.test.mjs` on the
   exact branch head (GitHub CI is acceptable; report the actual commands
   and environment).
2. Run targeted Chromium and the 625-site Fast far regression; capture the
   probe counts, camera/viewport, scene resources and submitted triangles.
   The actual renderer draw counts should be **unchanged** from v2 at
   equivalent project/camera and quality settings.
3. Check Quality, opaque, ROI and edge-on fail-closed and 20 cached opacity
   transitions. Confirm no frame-time or input-responsiveness regression.
4. Keep this commit separate from any LOD change so the diagnostic can be
   used as a control. If probe cost itself is measurable, remove or relocate
   it into the benchmark rather than penalize production frames.

## Phase A full-wafer result and corrected measurement

The first [PR #166 625-site Browser run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37916330681)
**passed**. [Native Fig3](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37916331342),
[Recipe Run All](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37916330726),
Quality and targeted Chromium also passed at `f4a5928`.

The actual `report.json` artifact records Fast far transparency **6.39 s**,
Quality cold/warm transparency **20.34/19.80 s**, and unchanged submitted
triangles **16,906,262 Fast / 57,040,012 Quality**. The far scene has LOD
tier `far-2.56`, yet its effective Section Z-collapse is **enabled** and
its 3D Z display scale is **23,196.347**. Therefore the original v3 probe's
`qualified=false, candidates=0, skippedTriangles=0` was an intended
collapse safety exclusion, **not an indication that no interface workload
exists**. Run-to-run timing variance is substantial and no v3 speedup
has been demonstrated.

The initial observation code also divided *physical* wall height directly
by screen units per pixel while overlooking the renderer's huge Z-display
scale. Such a probe could label visibly tall walls as subpixel; no real
geometry was omitted in that version. The follow-up fix now uses the
**effective** `currentZDisplay.enabled` instead of the stored Section
setting's truthiness, propagates the exclusion as
`v3ScreenBudgetReason`, checks positive finite `displayZScale`, and
multiplies displayed Z extents by that scale. Dedicated unit and 625-site
browser regression assertions lock down the behavior.

**No automatic culling is authorized by the budget.** Perspective
projection and nearer translated instances require per-owner/tile
clip-space error bounds, verified transparent color/occlusion and
near/ROI/edge-on restoration before Phase B can remove even one triangle.

## Phase A.2 — bounded real-camera projection sampling (current work)

An independently testable pure diagnostic,
`site/renderer-v3-projection-probe.js`, samples candidate *buried smooth*
translated material sidewall quads using the actual Three.js perspective
camera, viewport pixels, and the effective Section Z-display transform,
including its scale and hidden Z intervals. It records actual projected
pixel dimensions rather than inferring visibility from physical film
thickness at the camera target.

It samples no more than **32 owners × 8 representative parts × 5 translated
instances**, reports the observed subpixel/offscreen portions, and ranks
owners by their **raw, unmerged two-pass triangle upper bound**. Raw triangles
are deliberately labelled an upper bound (not measured GPU triangles);
samples are deliberately labelled samples (not a proof for every instance).
Even with active Z-collapse, the diagnostic can record the truly *visible*
remaining sidewalls while the older Phase A reduction-eligibility gate
remains `z-collapse`. It never changes geometry, masks, Z cuts, material
alpha, transparent sort order, GLB or canonical scientific data.
`v3SkippedTriangles` must remain zero in every mode.

The 625-site regression now insists on a meaningful projected workload
measurement at the saved far camera, and on correct zero readings for
opaque/Quality cached variants. Unit tests cover display-Z magnification,
Section collapse, camera clipping, exterior/rough/unique wall exclusions,
deterministic sampling and exact lack of source mutation.

**Next decision gate:** compare `v3ProjectionTopOwners`, sampled projected
width/height, sample counts and actual `rendererDrawTriangles` on a complete
625-site software-WebGL run. Only implement any actual GPU LOD after measuring
full perspective error bounds per tile/owner, color accumulation, overlapping
layer ownership, and restored near/ROI/edge-on/Section behavior. Do not
extrapolate a 160-sample candidate histogram to an exact triangle saving.

## Phase B — ownership-aware distant representations (future, NOT shipped)

Work on one surface family at a time; begin with buried **smooth material**
sidewalls only after Phase A demonstrates real candidate budget. Group by
layer, Z interval, face/depth policy and spatial tile. Do not collapse a
junction, open contour, rough/coating seam, ROI cut or independent transparent
sort boundary. Use screen-space error budgets and restore exact meshes
at closer views. Electrical/Implant volumes require their own coverage,
boundary and gradient acceptance and should not be silently dropped.

A candidate must provide a measured reduction in **submitted triangles
and/or completed-frame time** on the same runner, not merely fewer JS
objects or different indices. Compare screenshots at the same camera, DPR,
material alpha and border modes. Revert if visibility, layer registration
or interaction contracts fail.

## Phase C — viewport responsiveness and lifecycle (future, NOT shipped)

After scientific approval of Phase B: profile GPU/WebGL raster and
compositor costs on hardware; consider progressive accurate final refinement
with bounded task cancellation and predictable opacity variant retention.
Include 20+ toggles, 625-site full replay, native Fig3, M3D, multi-level
zoom and screenshot acceptance. Do not replace approved visual baselines.

## Initial handoff / environment

The branch was created via the GitHub repository connector. A local writable
WaferCAD checkout was not available. All changes, test results, head commits,
CI links and any failures must be recorded before requesting merge; v3
currently makes **no performance-improvement claim**. The latest version of
the canonical roadmap is `docs/RENDERER_TRANSPARENCY_ROADMAP.md`.
