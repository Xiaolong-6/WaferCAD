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
caching. The <15 s Quality and <6 s Fast targets remain _advisory_.

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
- Any approximation is confined to _presentation-derived GPU meshes_ and must
  reconstruct the accurate version when zoom/quality/ROI/camera state changes.
- Changes to baseline screenshots are prohibited without explicit approval.
  CI pass without matching-camera near/far/edge-on screenshot review is
  insufficient.

## Phase A — observe-only screen-space budget (current first commit series)

New `site/renderer-v3-screen-budget.js` classifies _potential_ far-camera
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
  `v3SubpixelRawTriangleEstimate` estimate a _raw_ far-field candidate
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

The initial observation code also divided _physical_ wall height directly
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
`site/renderer-v3-projection-probe.js`, samples candidate _buried smooth_
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
Even with active Z-collapse, the diagnostic can record the truly _visible_
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

| Diagnostic (Fast distant unless qualified)              |                                               Measured |
| ------------------------------------------------------- | -----------------------------------------------------: |
| Smooth buried material-interface owners sampled         |                                                     13 |
| Projected sample quads / valid projected                |                                              520 / 520 |
| Subpixel _samples_ (both projected dimensions <=0.5 px) |                                      294 / 520 (56.5%) |
| Sample quads entirely offscreen                         |                                                      0 |
| Raw, unmerged two-pass owner upper-bound                |                                   25,360,000 triangles |
| Dominant owners                                         | `layer-6`, `layer-12`, each raw upper-bound 10,170,000 |
| Other owners by raw upper-bound                         |                  `layer-4`, `layer-10`, each 1,910,000 |
| Actual Fast / Quality submitted triangles               |                                16,906,262 / 57,040,012 |
| Fast completed / Quality cold / warm                    |                             9.16 s / 26.21 s / 25.64 s |
| Rendered triangles actually omitted by v3               |                                                  **0** |

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

**Next engineering decision:** start with `layer-6` / `layer-12` _buried
smooth material walls_ as the bounded owner-analysis targets, first adding a
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
- Compute a physical XY enclosing rectangle across _all_ part edges and a
  displayed Z range across _all_ surviving Section intervals. Translation
  extrema give the complete XYZ box for each tile without expanding
  thousands of edges by hundreds of repeated instances.
- Project all eight corners through the actual homogeneous
  `projectionMatrix * matrixWorldInverse`. If the camera's near/far clip
  planes are crossed or homogeneous `w <= 0`, mark the tile **uncertain**
  instead of falsely classifying it as visible/offscreen/subpixel.
- Classify only entirely projected bounding boxes by viewport pixel
  extent. A tile called subpixel has a _whole enclosing box_ no more than
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
zero subpixel _complete tile_ candidates even if the earlier 520-quad
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
therefore projects a conservative per-_contour-part_ ×
per-_spatial instance tile_ bounding volume. It:

- Automatically selects the two heaviest buried smooth array owners,
  rather than hard-coding the example layer IDs.
- Checks all template edges and every translated instance via per-tile
  XY extrema, preserving surviving Z-collapse fragments separately.
- Interprets width/height in pixels under the real homogeneous projection,
  marking near/far clipping uncertainty instead of calling it invisible.
- Caps projected bounds at **100,000**, reports incomplete work explicitly,
  and measures wall-clock overhead as `v3EdgeSurveyMs`.
- Reports **bounds**, subpixel bounds and an unmerged raw two-pass triangle
  _upper bound_ for the studied workload. These are **not** actual GPU
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

| Diagnostic                                      |    625-site Fast distant |
| ----------------------------------------------- | -----------------------: |
| Major buried material owners                    | 2: `layer-6`, `layer-12` |
| Complete contour edge x 64-instance tile bounds |                   81,360 |
| Complete subpixel bounds, threshold 0.5 px      |                    **0** |
| Near/far uncertain bounds and overflow          |                    0 / 0 |
| Raw unmerged two-pass estimate                  |     20,340,000 triangles |
| Actual GPU triangle reduction                   |                    **0** |
| Edge/tile diagnostic CPU time                   |              **85.8 ms** |
| Fast/Quality submitted triangles                |  16,906,262 / 57,040,012 |
| Fast distant elapsed                            |                   8.33 s |
| Quality transparent cold/warm                   |          24.37 / 23.65 s |

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
  vertices, or 33.3% fewer _only within the indexed subset_.
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

| Measurement              | Phase A.4 unindexed baseline | Indexed Phase B.0 trial |
| ------------------------ | ---------------------------: | ----------------------: |
| Fast submitted triangles |                   16,906,262 |              16,906,262 |
| Fast completed stage     |                       8.33 s |                 12.55 s |
| Fast completed frame     |                     172.1 ms |                255.5 ms |
| Fast scene assembly      |                     486.9 ms |                828.6 ms |
| Quality transparent cold |                      24.37 s |                 34.30 s |

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

## Phase B.1 — Quality-only, exact indexed-wall A/B experiment (2026-10-09)

**Status:** opt-in pilot, **disabled in production**, no documented speedup yet.
Updated from current main `0125967` (conformal review branch integration).

The prior Fast-only experiment was reverted because it indexed just 2,200
template triangles. This controlled follow-up tests a different workload:
the **Quality exact transparent 625-site scene**. The original Quality
scene rebuild path is unchanged unless the page uses
`?rendererV3QualityIndex=1`. The 625-site benchmark and pipeline benchmark
also explicitly include `?rendererV3Diagnostics=1` to record diagnostics.

- Only **buried, smooth, instanced material walls in transparent Quality**
  call `pushIndexedSmoothWall`. Each quad keeps the exact two physical
  triangles in the same order, original winding, normal and Z coordinates
  using four vertices plus six indices.
- Rough/non-planar appearance, annotation gradients, Fast LOD, opaque
  variants, clipped non-instanced walls, Process/Kernel geometry, GDS/OAS
  and GLB export continue to use their old implementations.
- The strict `canIndexSmoothWalls` predicate rejects a whole candidate
  template whenever it contains roughness, invalid coordinates or
  depth-annotation interpolation. Empty sets cannot be indexed.
- Unit tests re-expand the indices and check triangle positions, normals,
  winding, shared sharp corners and original-input immutability.
- Instrument logical GPU source vertex instances:
  `v3QualityIndexedVertices`, `v3QualityOriginalVertices`,
  `v3QualityIndexedTriangles`. Their vertex ratio must equal 4:6
  while triangle count stays unchanged; renderer triangle counters
  now honor `geometry.index.count` where applicable.
- Variant cache restores the metrics along with the transparent scene.
  The experiment flag is read only on page load; normal UI stays on
  the unindexed exact Quality path.

**Acceptance:** Quality, targeted Chromium, full 625-site/20-toggle,
edge-on, Native Fig3 and every Recipe Run All on the same integration
head. Compare full-scene 3D pixels against the previous indexed-free
625-site reference at a matching camera, and compare _actual_
`rendererDrawTriangles`, `rendererDrawCalls`, first completed-frame
time and tested indexed vertex coverage. A claimed performance benefit
requires paired repeated measurements beyond CI-host variation. If
the covered vertex fraction is negligible or screen output differs,
revert the runtime opt-in branch and keep only this record.

## Phase B.1 paired hardware gate — ABBA within one runner (2026-10-09)

The first fully green Phase B.1 CI run at `04d93f1` was an ON-only
smoke/regression test. Its 625-site Quality transparent scene reports:

| Quantity                                                 | Instrumented count |
| -------------------------------------------------------- | -----------------: |
| Indexed smooth interface triangles                       |     **11,855,000** |
| Equivalent unindexed source vertices (instances applied) |     **35,565,000** |
| Indexed vertices (instances applied)                     |     **23,710,000** |
| Source vertex-count reduction within affected owner set  |         **33.33%** |
| Total GPU-submitted transparent Quality triangles        |     **57,040,012** |
| Total Quality draw calls                                 |          **1,408** |
| V3 skipped physical triangles                            |              **0** |

These are renderer diagnostic counts, not actual GPU hardware vertex-invocation
counters or evidence of reduced pixel shading. The ON-only benchmark finished
Quality cold / warm transparency in **18.70 / 18.87 s** on its particular CI
runner. Cross-run numbers cannot establish speedup.

New `scripts/renderer-quality-index-ab.mjs` performs a scientific, paired
ON–OFF–OFF–ON sequence on **one browser binary and CI runner**, with four fresh
isolated contexts, identical fixture, 1440×960 viewport, exact Quality, and
0.5 transparency. It waits for completed frames and compositor screenshots,
and hard-fails on any 3D canvas PNG pixel mismatch or differing submitted
triangle/draw-call counts. It records per-trial completed-frame latency,
inner WebGL frame time, scene assembly, and vertex coverage, plus median ON
and OFF timing and ratio. **The script intentionally sets
`inferSpeedup: false`** until repeated paired evidence is evaluated; it
does not automatically assert any absolute software-WebGL speed target.

The extra test is a conditional final-review step in the existing full
625-site browser job, gated to branches named `perf/transparent-renderer-v3-*`.
Its report and exact screenshots go in a separate CI artifact. It does not
change the application defaults. A single complete ABBA measurement is still
exploratory; hardware GPU profiling or multiple paired replicates are required
for production performance claims.

## Phase B.1 final ON/OFF measurement — PASS, marginal and inconclusive

Full final-review CI at `f2ca6ef878cdf725aed18a38cc826daa00d584ec`:

- [625-site and strict same-run ABBA](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37958326595): **success**, including edge-on.
- [Native Fig3](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37958326645): **success**.
- [All Example Recipe Reconstruction / Run All](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37958326641): **success**.
- [Quality](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37958057419): **success**.

The exact A/B artifact is `wafercad-quality-index-ab-79db8e955129c0da3569b7e8f81bd7bcc3f6ccc8`
(artifact ID `11630912887`, Browser run `37958326595`). Each trial uses
a fresh isolated browser context, the same 625-site JLFET fixture,
1440×960 viewport, Quality transparency 0.5, and identical fitted camera.

| Trial            | Indexed      | Completed image (ms) | rendererFrameMs | Assembly (ms) |
| ---------------- | ------------ | -------------------: | --------------: | ------------: |
| 1                | ON           |               33,945 |             207 |           746 |
| 2                | OFF          |               34,077 |             140 |           457 |
| 3                | OFF          |               35,268 |             222 |           485 |
| 4                | ON           |               33,604 |             181 |           566 |
| **Mean per arm** | **ON / OFF** |  **33,775 / 34,673** |   **194 / 181** | **656 / 471** |

ON/OFF completed-image ratio `0.9741064`: indexed mode appeared **2.59%
faster (898 ms)** on this single four-trial run. However, the inner
`rendererFrameMs` and scene assembly did **not** improve; their values are
noisy and the full completed-image cost is dominated by expensive
software-WebGL render/compositor behavior. This one ABBA round with
two trials per arm cannot establish a statistically robust gain on hardware.

- All four canvas screenshots are **byte-identical** (531×275 JPEG-free
  RGB PNG, 20,819 bytes; SHA-256
  `f483a2eb0bf8a0b4687b10daa2b7794343f710a1e61989db42dbd85b653aaa4a`).
- Both arms submit **57,040,012** triangles and **1,408** draw calls,
  retain each original smooth material-interface triangle, and skip zero.
- ON represents **11,855,000** indexed source triangles, changing logical
  vertex-instance count from 35,565,000 to 23,710,000; this is _not_ a
  measured GPU hardware vertex-invocation reduction.
- The ABBA screenshot covers the current 3D canvas and pose; independent
  625-site, edge-on, Native Fig3, and Recipe regressions checked the other
  relevant states. No visual baseline was replaced.

**Decision:** The opt-in Quality index prototype is correct for the tested
pose and full automated acceptance but **cannot yet be promoted to the
default or claimed as a reproducible performance optimization**. Keep the
flag disabled for ordinary users. A hardware GPU profile and more paired
replicates would be needed to verify a meaningful frame-rate benefit.
Further changes should target the **57M submitted triangles / alpha
overdraw** bottleneck with explicitly preserved layer, blend and depth
contracts, rather than additional indexing experiments. PR #166 stays
Draft; main has advanced independently and requires integration audit before
any merge.

## Phase B.2 — isolated WebGL census and completion diagnostics

The branch has integrated main `d73a201` (Metalens examples) at `6301ae1`
without conflicts or force. Product geometry and approved baselines are unchanged.

`node scripts/renderer-quality-index-ab.mjs --gpu-profile` now performs
normal / raster-discard / raster-discard / normal on fresh browser contexts,
with Quality indexing off. Its browser-only helper is never imported by the
application. It counts actual WebGL2 calls and indexed/instanced triangle
submissions, including both transparent passes, by presentation owner. Totals
must equal Three's completed-frame counters, with zero GL or page errors.
Both normal canvases must match; discarded images must differ and are
explicitly **incomplete diagnostic images**, never scientific acceptance.

Both arms use `gl.finish()` and record submission/completion wait separately
from the screenshot/compositor checkpoint. GPU timer queries are used only
when supported, available and non-disjoint; unavailable/busy/lost/disjoint/
timed-out results retain `gpuMs: null`. This is not a pure vertex/fragment
stage separation and never authorizes omission of physical faces. Discard
can change driver optimization; submitted API primitives are not hardware
invocation counters.

Local Linux, Node 24.19.0, Playwright 1.55.1, Chromium 140 / SwiftShader,
Three 0.179.1:

- `node --test site/tests/renderer-quality-index-experiment.test.mjs site/tests/renderer-v3-edge-tile-survey.test.mjs site/tests/renderer-v3-projection-probe.test.mjs site/tests/renderer-v3-screen-budget.test.mjs site/tests/renderer-v3-tile-bounds.test.mjs site/tests/webgl-frame-probe.test.mjs`: **39/39 pass**, including reference axes attribution without concealing unknown material draws.
- `WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/webgl-frame-probe-smoke.mjs`: **pass** on native WebGL2. Normal / discard / restored-normal all submitted **2,500 triangles / 2 calls**, with zero GL/page errors and exact restored image parity. This small synthetic scene validates instrumentation, not 625-site scientific acceptance or speed.
- `npm run check`: **pass**, including ESLint, full formatting, documentation contracts and **608/608 Node tests**. Subsequent frame-gate edits also passed focused ESLint and the 38-test renderer diagnostic group.
- SwiftShader reports `EXT_disjoint_timer_query_webgl2` **unsupported**;
  valid hardware GPU duration is unavailable in this environment.
- Two full 625-site attempts timed out at **initial 3D readiness (180 s)**,
  before arming or measuring a transparent frame. Captured state: no page
  errors, `renderState=building`, model revision 61, Process revision 40,
  37 partial renderer frames, last partial frame 685,100 triangles / 359
  draws. These attempts produced **no completed full-scene measurement**.
  Other repository tests were simultaneously using CPU;
  environmental attribution remains unproven.

An additional **default-off** `?rendererV3FinalFrameOnly=1` pilot suppresses
partial WebGL frame submissions during cooperative large-array assembly
while retaining its UI animation-frame yields. It clears the guard in the
build's `finally` block and schedules the unchanged exact final scene.
`--final-frame-only` enables it in either benchmark mode. Initial-scene
readiness, skipped-preview counters and frame policy are recorded. This is
an experiment to test the partial-frame hypothesis, **not an accepted
optimization**; keep it off until matched pose/geometry, completed-frame,
resource/interaction and performance evidence pass.

### Completed 625-site profile (2026-10-10)

The final-frame-only pilot completed normal / discard / discard / normal.
Every trial submitted **57,040,012 triangles / 1,408 draw calls**, with zero
GL/page errors, Quality indexing off and `gpuMs: null`. The two normal PNGs
were byte-identical (SHA-256
`082404084114f66422b986abfbfa6d57c6510f761ea6c6338911a379820432ee`).
This establishes same-run final-image parity, not an approved visual baseline.

| Trial     | Initial scene ready | Transparent completed checkpoint |
| --------- | ------------------: | -------------------------------: |
| Normal 1  |             7.825 s |                         19.474 s |
| Discard 2 |             6.986 s |                          3.805 s |
| Discard 3 |             6.528 s |                          4.040 s |
| Normal 4  |             7.079 s |                         28.238 s |

Normal median **23.856 s**, discard median **3.923 s**; diagnostic ratio
**0.1644**. Actual draw submission in the first three trials was 118–146 ms.
One assembly preview was skipped in each measured build. Shorter JS submission
alone cannot explain the completed-image cost. This experiment does **not**
isolate fragment, vertex, blending or compositor duration and is **not** a
product speedup. Startup benefit is not established.

The default preview policy also completed all four trials with the same
57,040,012 triangles / 1,408 calls, zero GL/page errors and no skipped preview
frames. Its normal median was **26.772 s**, discard median **4.860 s**
(ratio **0.1815**). Initial readiness was 11.417 / 7.737 / 8.484 / 7.645 s;
completed checkpoints were 28.158 / 4.914 / 4.807 / 25.386 s. Both normal
images matched each other **and the pilot's normal images byte-for-byte**.
These sequential policy blocks were not randomized or replicated; their
within-block variation does not establish a stable startup or completed-frame
speedup. Keep the assembly pilot default-off.

| Presentation owner          | Submitted triangles | Draw calls |
| --------------------------- | ------------------: | ---------: |
| Material interfaces         |          26,407,500 |        213 |
| Internal electrical volumes |          23,535,000 |        234 |
| Electrical surfaces         |           5,947,500 |        234 |
| Exterior material surfaces  |           1,150,012 |        726 |
| Reference axes (lines)      |                   0 |          1 |

The integrated branch checkpoint `c9a79b4` passed automatic Quality and
targeted Chromium (UI smoke, resilience and renderer product) CI. Draft-only
heavy 625-site, edge-on, Process, Native Fig3 and Recipe jobs were skipped;
they are **not** current-head acceptance evidence. The latest diagnostic
changes passed focused tests, ESLint, formatting and documentation checks.

The benchmark writes failure stage, page errors and renderer state to
`test-results/renderer-gpu-profile/failure.json`; successful profile output
uses `report.json`. The final-frame-only pilot writes separately under
`test-results/renderer-gpu-profile-final-only/`. No additional costly automatic
CI job or manual workflow dispatch was added. PR #166 remains Draft; no merge
or speedup claim.

## Phase B.2.1 — paired assembly policy control (2026-10-10)

A standalone, **manual-only** `node scripts/renderer-quality-index-ab.mjs
--assembly-ab` mode now compares the existing default preview policy with
the opt-in `?rendererV3FinalFrameOnly=1` pilot on the same browser binary
and runner. Four fresh isolated contexts execute final-only / preview /
preview / final-only (ABBA). Both arms keep Quality indexing **off** and
rasterization **on**. No added CI dispatch or app default change.

The probe checks per-trial assembly policy, completed exact Quality triangles
(**57,040,012**), draw calls (**1,408**), no page errors, zero skipped
physical geometry and pixel-exact completed canvas equivalence between
**all four** trials. It reports the two arms' initial 3D readiness and
completed transparent image medians, their ratios, scene assembly and
skipped preview frames. Separate screenshots and
`test-results/renderer-assembly-ab/report.json` avoid overwriting earlier
GPU/discard diagnostics; stage-specific failures go to `failure.json`.

**Scientific gate:** this probe is a way to measure the existing pilot,
not a validated speedup. Await its real 625-site result before interpreting
the medians. One software-WebGL ABBA round cannot show stable benefit,
preview responsiveness or suitability on real GPUs; require further paired
replicates, interaction/Recovery checks and full near/edge-on/Process/Recipe
acceptance before enabling the policy by default. PR #166 remains Draft.

## Phase B.3 — opt-in Electrical Region smooth planar cap pass (2026-10-10)

The completed WebGL attribution showed **5,947,500 submitted triangles**
from Electrical Region surfaces (of **57,040,012** total Quality transparent
triangles). In contrast to interior Electrical Region volumes, a smooth
electrical *surface cap* lies in a single Z plane; Three.js's default
transparent DoubleSide backface/frontface two-pass draw can issue a redundant
pass for that cap. The material-cap single-pass implementation already has
a tested policy; this change extends it to one explicitly gated annotation
surface kind **without changing canonical geometry or shader/material alpha**.

The experiment requires **all** of:
`?rendererV3ElectricalPlanarSinglePass=1`, a transparent **Quality**
scene, no ROI clip, at least 64 array instances, a smooth (non-rough)
Electrical Region surface cap and an explicit `planarCap` presentation
tag. It keeps Electrical Region **internal volumes**, rough caps, exterior
materials, sidewalls, implant gradients and opaque/Fast scenes on their
existing paths. Product default remains **OFF**. The policy-level unit test
enforces the opt-in and negative controls.

The standalone paired 625-site test is
`node scripts/renderer-quality-index-ab.mjs --electrical-planar-ab`.
It runs ON/OFF/OFF/ON in isolated contexts on the same browser/runner and
requires **byte-identical 3D canvases** at the matching camera, color
opacity, image size and Quality settings, zero page errors, and preserved
physical model. ON must demonstrably submit fewer WebGL triangles and draw
calls while OFF retains **57,040,012 triangles / 1,408 calls**. A new separate
`test-results/renderer-electrical-planar-ab/` output captures the four
frames, per-trial counts and completed-frame timings.

**Status: not yet scientifically accepted.** The reduction is a *candidate*
only: opaque/transparent boundaries or blended coplanar overlaps could still
change pixels and fail the parity gate. Even a complete same-run image match
does not demonstrate a statistically significant hardware speedup. Require
full 625-site, edge-on, Section Z-collapse, ROI, 20-toggle and Process/Recipe
acceptance before considering promotion to default. Do not modify image
baselines or describe this as an achieved improvement.

At final non-Draft PR review, the **existing** V3 625-site A/B CI slot now
runs `--electrical-planar-ab` in place of the historical Quality-indexing
comparison. This is a cost-neutral replacement, not an added heavy job.
Historical indexing A/B evidence remains in the earlier Phase B.1 section;
the standalone `--assembly-ab` and indexing A/B modes remain locally
reproducible but are not duplicated in final-review CI.

## Phase B.4 — P0/P1 full-wafer Electrical Region internal-volume trials: both rejected (2026-10-10)

### Final measured result

The opt-in smooth Electrical **surface** single-pass experiment from Phase B.3
remains the last **accepted** V3 image-parity result: in the same-run
625-site Quality ABBA, baseline **57,040,012 triangles / 1,408 calls** became
**54,066,262 / 1,291** with byte-identical completed canvas frames.
Median completed-image time on the software-WebGL runner was **24.526 s OFF
vs 23.361 s ON** (two samples per arm; no general GPU speedup established).

P1 attempted to reduce the still-heavy `electrical-internal` owner
(**23,535,000** submitted triangles in the earlier GL census) without
changing the physical model. Both candidates failed the **strict final-image
pixel parity** contract, despite reducing GPU submissions. Neither is
shipped; implementation modules, query flag, tests and P1 CI wiring were
**removed from the active branch**. No screenshot baseline was adjusted.

| Candidate | A/B run | ON submitted triangles | ON draw calls | ON vs reference PNG | Gate |
| --- | --- | ---: | ---: | --- | --- |
| Group smooth caps separately, wall remains two-pass | [38031265243](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38031265243) | **48,118,762** | **1,408** | 20,815 vs 20,819 bytes; pixels differ | **FAIL** |
| Original BackSide/FrontSide order, separate indexed meshes skipping opposite cap | [38032284826](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38032284826) | **48,118,762** | **1,291** | 20,821 vs 20,819 bytes; pixels differ | **FAIL** |

Both tests activated **39** candidate electrical body owners and triggered a
hard A/B failure at the first ON/OFF cross-comparison. The first ON frame of
the second experiment completed in **21.079 s**, but OFF never completed a
reported ABBA trial because the pixel assertion failed. This is **not** a
paired speedup result. Both full-wafer **default** 20-toggle/resource tests,
targeted Chromium, exact edge-on, Native Fig3, all nine Recipe Run All and
Quality (on attempt 2) separately passed. Process geometry's standalone
browser job was skipped under the renderer-targeted CI plan.

The visual differences are consistent with a change in transparent pass
ordering, or an inter-object shading/sort interaction, but **their exact
pixel-level cause has not been isolated**. Never reinterpret alpha-blended
internal volumes as expendable geometry from these submission numbers alone.

### Next action / P0 instrumentation gate

Do not add another internal-volume optimization flag until the difference is
localized with a per-pixel image diff, object-owner isolation, near/edge-on
camera and transparency-order accounting. A cheaper early fail gate can
run isolated ABBA **before** the 625-site 20-toggle stress when reviewing a
future opt-in candidate, without increasing the number of CI jobs.

The CI renderer uses Chromium **software WebGL**. Timing and triangle counts
do not establish representative Windows **hardware GPU** cost or fragment
overdraw behavior. Hardware profiler runs require the actual GPU renderer
string, disjoint-safe GPU timer queries if available, browser/driver details,
same-run reference controls and separate scene-assembly vs final-frame
checkpoints. Where GPU timers are unsupported, explicitly report
`gpuMs: null`. No real-hardware performance target is accepted yet.

**Decision:** stay on the previously verified, default-off Electrical Region
smooth-surface pilot and preserve all canonical geometry. PR #166 remains
Draft and unmerged. Do not claim the proposed <20 s or <15 s Quality targets
were achieved by P1.

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
