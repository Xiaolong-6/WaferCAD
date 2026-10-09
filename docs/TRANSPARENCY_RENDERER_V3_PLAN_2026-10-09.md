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

## Phase A.3 625-site verified outcome and Phase A.4 edge-tile survey

[Complete Browser regression on 907c2c3](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37926039136)
and [Quality](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37926039175),
[Native Fig3](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37926039230),
[Recipe Run All](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37926039161)
all passed (including M3D/JLFET). Extracted from the committed 625-site
renderer artifact: **13 complete buried interface owners** were represented
by **130 owner × 64-instance tiles**, with **0 complete tile projected under
0.5 px** and **0 near/far clipping uncertainties**. Neither owner nor tile
coverage overflowed. The 520 projected individual-quad samples previously
showed 294 (56.5%) small patches; that cannot be extrapolated to whole-owner
GPU savings. The fixture continues to use Section Z-collapse, which forbids
geometry omission. Actual submitted Fast/Quality triangles remain
**16,906,262 / 57,040,012**.

**Finding:** whole-owner bounds are intentionally broad. In layer-6 and
layer-12 the template contains ~4,068 contour segments across 625 translated
instances; enclosing the full contour inevitably hides fine-scale
subpixel patches. The next diagnostic, `site/renderer-v3-edge-tile-survey.js`,
therefore projects a conservative per-*contour-part* ×
per-*spatial instance tile* bounding volume. It:

- Automatically selects the two heaviest buried smooth array owners,
  rather than hard-coding the example layer IDs.
- Checks all template edges and every translated instance via per-tile
  XY extrema, preserving surviving Z-collapse fragments separately.
- Interprets width/height in pixels under the real homogeneous projection,
  marking near/far clipping uncertainty instead of calling it invisible.
- Caps projected bounds at **100,000**, reports incomplete work explicitly,
  and measures wall-clock overhead as `v3EdgeSurveyMs`.
- Reports **bounds**, subpixel bounds and an unmerged raw two-pass triangle
  *upper bound* for the studied workload. These are **not** actual GPU
  reductions, nor is the subpixel ratio guaranteed to approximate them.
- Preserves all geometry, material opacity, transparency sorting, and exact
  scientific data; `v3SkippedTriangles` remains zero and the reduction
  gate stays `z-collapse` / `alpha-coverage-unverified`.

**Next gate:** CI must prove the added diagnostic completes within its
bounded workload, has zero overflow in the 625-site example and does not
harm image parity or 20 opacity/border toggles. Compare its measured overhead
and projected candidate pattern with the prior `907c2c3` reference,
then decide whether the architecture warrants a separate display-only
transparency LOD experiment. No experimental culling is enabled in A.4.

## Phase A.4 result — full 625-site acceptance (2026-10-09)

Runtime head `4976bda7c4be7d786a4b2dc042cdcae4cf4e7e5e` passed Quality, Browser 625-site, edge-on, Native Fig3 and all Recipe Run All.
Browser run: https://github.com/Xiaolong-6/WaferCAD/actions/runs/37928527195

| Diagnostic | 625-site Fast distant |
| --- | ---: |
| Major buried material owners | 2: `layer-6`, `layer-12` |
| Complete contour edge x 64-instance tile bounds | 81,360 |
| Complete subpixel bounds, threshold 0.5 px | **0** |
| Near/far uncertain bounds and overflow | 0 / 0 |
| Raw unmerged two-pass estimate | 20,340,000 triangles |
| Actual GPU triangle reduction | **0** |
| Edge/tile diagnostic CPU time | **85.8 ms** |
| Fast/Quality submitted triangles | 16,906,262 / 57,040,012 |
| Fast distant elapsed | 8.33 s |
| Quality transparent cold/warm | 24.37 / 23.65 s |

The prior Phase A.3 CI run gave Fast 11.84 s and Quality 33.01 / 32.30 s, with identical GPU triangle counts; CI variance precludes any speedup claim.
The 85.8 ms survey imposes real additional scene-build CPU work. It should be run benchmark-only once the scientific measurement is accepted.
The A.4 and A.3 screenshots differ only in the 111 by 9 pixel status-bar text area at bottom right (x1138-1248, y947-955); 3D rendering pixels are unchanged. No screenshot baselines were replaced.

**Decision:** No complete subpixel 64-instance contour tile qualifies; previous 294 / 520 individually sampled subpixel quads do not authorize whole-tile or alpha-blended geometry culling. Phase B remains unimplemented. Future optimization should measure transparency/overdraw and preserve depth and alpha accumulation before proposing display-only LOD. Keep PR #166 experimental and unmerged.

## Phase B.0 closed — measured and reverted (2026-10-09)

The integrated runtime at `ba6654bbbc1c7dfe100219829773f835f290cfa8`
passed [Quality](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37933170117),
[625-site Browser/edge-on](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37933615621),
[Native Fig3](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37933615627)
and [Recipe Run All](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37933615747).

Direct artifact comparison against the A.4 625-site reference:
- **2,200** template wall triangles indexed. **6,600 → 4,400** template
  vertices, or 33.3% fewer *only within the indexed subset*.
- **16,906,262** Fast and **57,040,012** Quality GPU draw triangles,
  plus **1,408** draw calls in both tests — identical to the reference.
  The indexed subset is too small relative to the complete scene to
  support a meaningful full-wafer performance claim.
- Fast completion was **8.33 s → 12.55 s**, Quality cold transparent
  **24.37 s → 34.30 s**, and warm **23.65 s → 33.40 s**
  (reference → experiment). CI host variation makes these observations
  unsuitable for inferring causal slowdown or speedup.
- All three saved 1440×960 screenshots differ only in a tiny bottom
  status-bar text region (x1215–1234, y948–953); their **3D drawing
  regions are pixel-identical**. No baseline changed.
- The detailed projection probe measured 152 ms on the later CI runner
  when explicitly enabled. It is now **benchmark-only** by default in
  the normal UI.

**Decision:** retire the indexed-wall runtime helper, its opt-in path,
its tests and its indexed-specific assertions from the active branch.
Keep the empirical record and the useful `?rendererV3Diagnostics=1`
opt-in, which avoids running expensive Phase A surveys during normal
interactive rendering. Do not merge this PR as a proven speedup.
The next actual GPU bottleneck investigation should profile instance
submission, overdraw and fragment blending before proposing a
scientifically safe material-wall representation.

## Phase B.0 — exact smooth-wall index reuse experiment (2026-10-09)

After Phase A.4 established zero complete subpixel 64-instance edge-tile bounds,
V3 changed strategy: avoid unsafe face omission and instead reduce redundant
vertex traffic while retaining **every** smooth material-interface triangle.

- New pure `site/renderer-smooth-wall-index.js` encodes each perfectly planar
  smooth-wall quad using four vertices and the original six indices
  `[0,1,2,0,2,3]`, instead of six independent vertices.
- Enabled only for **Fast transparent buried instanced smooth sidewalls**.
  Quality, rough/coating walls, non-instanced walls, implant/depth-gradient
  annotations, canonical process geometry and GLB export retain their old paths.
- The old triangle ordering, winding, alpha, material blending and each
  quad's normal are preserved. No triangles have been culled.
- Metrics `indexedSmoothWallVertices`, `indexedSmoothWallOriginalVertices`
  and `indexedSmoothWallTriangles` survive opaque/transparent variant caching.
  The expected ratio is six original vertices / four indexed vertices = 1.5;
  **33.3% fewer vertex attributes is not the same as a 33.3% GPU speedup**.
- Important topology accounting fix: `sidewallTriangleCount` and
  `smoothSidewallTemplateTriangleCount` read `geometry.index.count` when present.
- Expensive Phase A screen budget, perspective quad sampling, owner/tile bounds
  and contour-tile survey now run only with
  `?rendererV3Diagnostics=1` in the browser URL; `array-renderer-regression.mjs`
  and `renderer-pipeline-benchmark.mjs` explicitly opt in. Normal UI builds
  do not pay the previously measured 85.8 ms edge-tile survey cost.

The three additional exact-geometry unit tests in
`site/tests/renderer-smooth-wall-index.test.mjs` check triangle expansion,
normals, winding and rejected rough/annotation input. CI adds actual Fast
array usage + 1.5 ratio assertions and requires Quality's indexed count zero.

**Gate:** targeted Chromium and Quality passed on runtime commit
`a8c20c76d54c8fe28e00b8bbe9f75ce4467b21f3`.
Do not claim a performance win before a full **625-site visual comparison**
(identical 3D pixels), frame-completion benchmark, exact GPU triangle count,
20 opacity/border transitions, edge-on/ROI/Section restoration, Native Fig3
and Recipe replay on the integrated latest-main commit. If vertex reuse does
not materially improve completed-frame cost, retain only the benchmark result
or revert the experiment rather than presenting it as an achieved speedup.

## Phase B.0 empirical gate — indexed wall trial did not demonstrate a speedup

The integrated latest-main head `ba6654bbbc1c7dfe100219829773f835f290cfa8`
passed Quality, Chromium, complete 625-site renderer (including 20
presentation toggles), edge-on exact restoration, Native Fig3 and all Recipe
Run All with the trial enabled. Browser CI:
https://github.com/Xiaolong-6/WaferCAD/actions/runs/37933615621.

| Measurement | Phase A.4 unindexed baseline | Indexed Phase B.0 trial |
| --- | ---: | ---: |
| Fast submitted triangles | 16,906,262 | 16,906,262 |
| Fast completed stage | 8.33 s | 12.55 s |
| Fast completed frame | 172.1 ms | 255.5 ms |
| Fast scene assembly | 486.9 ms | 828.6 ms |
| Quality transparent cold | 24.37 s | 34.30 s |

Both trials were on separate CI runs: their timing differences are affected
by runner/WebGL and workstation variance, and cannot prove a causal
indexing slowdown. **No meaningful speedup was established.** Indexed
smooth template walls encoded 2,200 retained triangles with 4,400 unique
vertices instead of 6,600; this is a 33.3% local vertex count reduction
but a small fraction of the total 16.9M Fast submitted triangles. Quality
remained unindexed by construction.

The same-size screenshots (`fast-transparent-lod.png`, `quality.png`,
`transparent.png`) were pixel-identical throughout the actual 3D render
region. Their only differing pixels (102) were a 19 × 6 status text region
at x1216..1234 and y948..953. No visual baselines were updated.

**Decision:** Do not expose the trial to ordinary users. The opt-in is now
`?rendererV3IndexedWalls=1`; full renderer benchmarks additionally use
`rendererV3Diagnostics=1`. In normal interactive use both expensive probes
and the unproven indexed geometry are off. Keep the original scientific
Fast, Quality, rough, annotation, and GLB paths intact. The next actual
optimization must come from measured GPU transparency/overdraw, not an
unsupported claim that 33% local vertex count implies frame improvement.
PR #166 remains Draft and is not authorized for merge.

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
