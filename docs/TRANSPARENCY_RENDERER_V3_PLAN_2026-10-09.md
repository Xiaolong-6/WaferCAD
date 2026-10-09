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

## Phase A.2 empirical acceptance: 625-site projection (2026-10-09)

**Verified commit:** `60f82a4d46bd13b38353d73ba27135c06d8a68d1`.
The [full Browser regression](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37922563922)
passed including Fast distant, Quality cold/warm, 20 border/opacity
transitions, targeted Chromium and edge-on restoration. Independently:
[Quality PASS](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37922385573),
[Native Fig3 PASS](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37922563961),
and [Recipe Run All PASS](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37922563926)
including M3D and JLFET.

The 625-site `wafercad-array-renderer` artifact `report.json` recorded:

| Diagnostic (Fast distant unless qualified) | Measured |
| --- | ---: |
| Smooth buried material-interface owners sampled | 13 |
| Projected sample quads / valid projected | 520 / 520 |
| Subpixel *samples* (both projected dimensions <=0.5 px) | 294 / 520 (56.5%) |
| Sample quads entirely offscreen | 0 |
| Raw, unmerged two-pass owner upper-bound | 25,360,000 triangles |
| Dominant owners | `layer-6`, `layer-12`, each raw upper-bound 10,170,000 |
| Other owners by raw upper-bound | `layer-4`, `layer-10`, each 1,910,000 |
| Actual Fast / Quality submitted triangles | 16,906,262 / 57,040,012 |
| Fast completed / Quality cold / warm | 9.16 s / 26.21 s / 25.64 s |
| Rendered triangles actually omitted by v3 | **0** |

Interpretation: the **observed samples** indicate some distant material walls
project to subpixel size, but the sample is capped per owner/edge/instance,
is not a statistical random sample and is **not** the fraction of GPU work
that may safely be removed. The raw owner upper bound may exceed actual
submitted triangles because it precedes topology reduction, clipping and
instancing. Crucially, `zCollapseEnabled=true` still **disqualifies geometry
reduction** by the strict Phase A gate. Even a small projected quad can
contribute nonzero transparency color/occlusion. Camera projection samples
neither prove conservative bounds for the full tile nor correct alpha
compositing after omission.

Screenshot comparison against the **previous probe-only 625-site artifact**
under matching camera and resolution showed `quality.png` and
`fast-transparent-lod.png` pixel-identical, while `transparent.png`
had 394 pixels (0.029% of a 1440x960 screenshot) with maximum channel
difference >8. This comparison is diagnostic, not blanket scientific
near/ROI proof; visual baselines were **not** replaced.

**Next engineering decision:** start with `layer-6` / `layer-12` *buried
smooth material walls* as the bounded owner-analysis targets, first adding a
conservative whole-tile/whole-owner screen-space bound and transparency
coverage validation. Do **not** use a sample fraction as a culling ratio.
Keep rough, exposed, Electrical/Implant, ROI, edge-on, Z-collapse cuts and
near inspection exact. Before enabling any geometry reduction, require a
separate experimental commit, matching-camera visual acceptance, the same
625-site resource/20-toggle suite and paired frame-accurate measurements.

**Status:** Phase A.2 diagnostics accepted on this head; v3 actual
hierarchical LOD remains **unimplemented**; PR stays Draft and unmerged.

## Phase A.3 — whole-owner spatial tile projection bounds (experimental)

This step adds `site/renderer-v3-tile-bounds.js` as an independent,
pure, conservative and **observe-only** diagnostics module:

- For each smooth buried instanced owner, inspect **every template sidewall
  part** and **every translated instance** once; reject mixed rough/invalid
  owner geometries entirely. Partition sorted translations into spatial
  groups of up to 64 instances per tile.
- Compute a physical XY enclosing rectangle across *all* part edges and a
  displayed Z range across *all* surviving Section intervals. Translation
  extrema give the complete XYZ box for each tile without expanding
  thousands of edges by hundreds of repeated instances.
- Project all eight corners through the actual homogeneous
  `projectionMatrix * matrixWorldInverse`. If the camera's near/far clip
  planes are crossed or homogeneous `w <= 0`, mark the tile **uncertain**
  instead of falsely classifying it as visible/offscreen/subpixel.
- Classify only entirely projected bounding boxes by viewport pixel
  extent. A tile called subpixel has a *whole enclosing box* no more than
  0.5 pixels wide and tall; sample-only classification is insufficient.
- Record owner/tile coverage, skipped/rough owners, overflow, uncertain
  cases, and top six raw workload owners. Hard safety budgets: 32 owners,
  512 tiles, 64 instances per tile; overflow is exposed, not silently
  considered measured.
- Explicit scientific gates `not-far`, `roi`, `z-collapse`,
  `edge-on`, and `alpha-coverage-unverified` prevent treating even a
  fully bounded subpixel tile as automatic permission to remove an
  overlapping transparent material surface.

The additional unit tests cover full template/instance coverage, invalid
and near-plane-crossing bounds, Section magnification, ROI/edge-on,
rough/exterior/unique owner exclusions, offscreen bounds, capped
coverage, and no canonical mutation. The 625-site browser regression
requires actual tile bounds in distant Fast mode and exact fallback in
Quality and opaque cached variants.

**Important:** The whole-owner bounding box deliberately overestimates
screen coverage for disjoint walls and large arrays; this can yield
zero subpixel *complete tile* candidates even if the earlier 520-quad
sample saw many small projected faces. That is a conservative finding,
not a bug. Real Phase B savings would need smaller **topology-owned**
tile/feature partitions, a verified visible-color/alpha error model, and
paired image/first-frame performance results. No tiles or triangles are
currently culled.

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
