# Renderer transparency bottleneck and phased LOD plan

**Status:** Open performance debt; frame-time targets remain **non-blocking** under the recorded 2026-10-08 acceptance policy. Current main includes the integrated renderer; PR #135 is historical provenance, not a pending main blocker. Owner: 3D Renderer / persistent-scene presentation. This document is the canonical forward plan, not a claim that all phases have shipped; see [the dated v2.1 audit](RENDERER_PERSISTENT_SCENE_V2_1_AUDIT_2026-10-08.md) for the commit-by-commit experiments and CI evidence.

## Scope and measured evidence

The workload is **Native Fig3: 625 sites / 1,885 render instances**, examined in full-wafer transparent 3D. The active bottleneck is browser **WebGL draw/vertex/raster submission of repeated buried interfaces and Electrical Region volumes**. Kernel geometry and the shared CPU scene assembly plan are not the current dominant cost.

Selected CI measurements (different revisions on the same class of Linux Chromium/software-WebGL runner; compare matched hardware/browser runs before attributing gains):

| Observation                           | Evidence                                                                                                                                                | Interpretation                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Cold transparent first complete frame | ~20.84 s on one attempted reduction, ~25.1 s in another; earlier ~32–38 s                                                                               | Above the aspirational 15 s target and visibly slow. Hardware-specific, not a universal user latency.              |
| Warm transparent scene switch         | ~36.77 s at integrated renderer v2.1                                                                                                                    | CPU scene assembly and geometry regeneration can be zero, yet the WebGL transparent frame remains expensive.       |
| Full transparent frame                | ~59–60 million submitted triangles (including the cost of two-sided drawing), ~1,759 draw calls                                                         | Dominated by per-site internal geometry; an opaque scene is much smaller.                                          |
| Pre-double-sided ownership diagnostic | ~14 million buried interface triangles, ~12 million Electrical internal region triangles, ~3 million Electrical surfaces, <1 million exterior triangles | Focus on the internal presentation meshes; do not spend another cycle optimizing the outer wafer silhouette alone. |
| CPU assembly                          | Often <1 s                                                                                                                                              | Repeating scene caching or minor JavaScript assembly changes alone cannot solve the renderer bottleneck.           |

These are diagnostic samples, **not** reproducible benchmark guarantees. In particular, older measurements incorrectly stopped their timer when `renderState=ready` was set, before the first WebGL frame finished. Current tests wait for `rendererFrameSerial` and record `rendererFrameMs`, `rendererDrawCalls`, `rendererDrawTriangles`, active/retained scene resources, and the largest triangle-owning objects.

## Attempts and what they established

1. **Persistent opaque/transparent scene variants:** reuse the canonical surface ownership plan and cached presentation meshes on warm switches. Effective at reducing repeat CPU assembly, but warm transparent drawing is still slow.
2. **Material/chunking experiments:** pooled vs private materials, spatial groups of various sizes, and Lambert shading for large transparent arrays. Shading can improve software WebGL time modestly; changing instance counts alone has not met the target.
3. **Single-pass transparency experiment:** reverted because it broke the established two-pass `DoubleSide` transparency/visibility contract. Do not silently trade scientific inspection correctness for a benchmark score.
4. **Exact collinear edge reduction and screen-space boundary simplification:** preserve physical geometry and help some mesh families, but measured full-scene triangles remained close to 60 million. Arrays may contain shuffled directed edges; contour reconstruction by endpoint plus Z/material ownership is being explored and needs full browser validation.
5. **Frame-accurate diagnostics and repeated toggle stress:** separate CPU assembly from WebGL frame completion; inspect retained geometry/material counts when opacity or border mode changes.

## Next work, in order

### Phase A — Grounded geometry/visibility profiling

- Capture cold and warm complete-frame timing, triangle ownership by cap/sidewall/electrical/implant category, draw calls, retained materials/geometries, and screenshots on the same Chromium/software-WebGL runner plus a representative hardware GPU.
- Determine which wall/volume tiles have subpixel projected contribution at each camera distance, viewport, DPI, ROI and material opacity; preserve quantitative profiling artifacts for before/after comparison.
- Attribute the remaining large allocations to array instance groups and buried interfaces before rewriting production scene assembly.

### Phase B — Presentation-only hierarchical LOD

- Keep **exact canonical 2.5D regions, Process Geometry Kernel results, History and GLB exports** unchanged.
- **Near / ROI:** render exact sidewall/cap geometry and all buried implant/electrical annotations, with current owned-interface and depth ordering.
- **Medium:** simplify reconstructed contours within bounded screen-space error by layer, Z interval, material and spatial tile; preserve holes, junctions, interface registration, transparent layer ordering, and rough morphology transitions.
- **Far full-wafer:** replace subpixel repeat interior details with a compact, visually legible per-tile or per-layer aggregate; retain outer topology, exposed sidewalls, major buried material interfaces and meaningful annotation color/coverage. Do not simply hide entire Electrical or Implant regions.
- Make LOD ownership adaptive to projected feature size, camera distance, ROI, viewport resolution/DPR, transparency and interaction state. Reconstruct higher detail after zoom-in without mutating project data.

### Phase C — Mesh ownership, batching and resource lifecycle

- Consolidate compatible presentation geometry by material, physical Z interval, opacity/depth policy, and spatial tile. Do not merge transparent objects that need independent depth sorting.
- Reduce both effective vertex/triangle work and draw calls; profile WebGL submission and GPU/CPU resource retention. Opaque/transparent cached variants must reuse or dispose resources predictably.
- Stress at least 20 border/opacity changes, ROI changes, zoom in/out and repeated project load; ensure no monotonically growing cached resources.

### Phase D — Visual/scientific acceptance and performance promotion

- Verify pixel/visual and structural invariants: opaque occlusion of buried annotations; transparent visibility of buried interfaces and Electrical/Implant regions; coincident interfaces; no duplicate borders, vertical curtains, floating annotation slabs or broken rough/sidewall seams.
- Run identical benchmarks before/after on supported hardware and the CI software renderer. Long-term **targets**: cold first transparent frame <15 s on the CI reference workload, warm variant swap meaningfully faster than cold, and responsive zoom/ROI refinement with bounded resources.
- Promote timing back to a blocking gate **only after** LOD and reference performance envelopes are validated and there is an explicit project decision. Do not relax or remove scientific/functional assertions to achieve a green badge.


## Fast-array LOD release — 2026-10-09

Originally developed in `perf/transparent-array-lod-20261008` from `be2f6af`, the Fast far-array electrical presentation LOD **merged to `main` in [PR #155](https://github.com/Xiaolong-6/WaferCAD/pull/155) at `a5e839c5`**. The physical Kernel, saved project, History and GLB model remain unchanged. This is a selective far-view feature, **not** a claim that all planned hierarchical LOD phases or frame-time targets are complete.

- `site/transparent-array-lod.js` quantizes the projected XY pixel footprint into bounded, camera-dependent far tiers (maximum 0.85 pixel simplification error per tier). Transparent full-array LOD is eligible only in **Fast**, with at least 64 translated instances, **no ROI**, and a view sufficiently elevated above the wafer plane; **Quality**, opaque inspection and local/near inspection retain the original exact presentation path.
- In eligible distant transparent arrays, `electrical-internal` repeated bodies retain their two true top/bottom caps, material colors, owner/depth Z and instance transforms but skip the many side triangles. This is a **far-field display approximation**: edge-on views are expressly excluded so the vertical annotation walls return, but oblique distant views still require visual comparison. The exterior Electrical surface remains separately rendered. No physical/annotation source model, Process, History, project storage or GLB path is modified. Implant gradient bodies, rough-electrical profiles and cut/partially collapsed annotation volumes deliberately retain their full walls.
- The camera LOD tier participates in scene-signature invalidation independently of Opacity, so an opaque/transparent scene variant swap can still reuse its physical plan. At tier changes on orbit-end, fit, restored view or resize, the renderer rebuilds the correct near/far meshes rather than retaining stale simplification. Retained variant diagnostics report the actual restored tier and count.
- `site/tests/transparent-array-lod.test.mjs` covers eligibility, thresholds, cap preservation, source immutability and Z-collapse fallback. The Quality workflow at commit `3e73f436` passed.
- Existing `scripts/array-renderer-regression.mjs` continues its established default quality/resource correctness gate. The PR's required `--fast-transparent-lod` browser run checks the far-field triangle count versus exact transparent Quality, materials/array ownership, full-frame success, and saves screenshots under `test-results/array-renderer/`. It does not weaken an existing performance or geometry assertion.

### Recorded full-wafer CI acceptance — 2026-10-09

At candidate revision `3e73f436`, all four PR workflows passed: Quality, Example Recipe Reconstruction (including M3D and three-tier JLFET), Native Fig3 full replay, and Browser regression. The explicit 625-site Fast transparent LOD probe completed its first submitted frame in **12.24 s** and submitted **18,346,852 triangles**, versus **59,961,852 triangles** for Quality exact transparency: a **69.4% reduction in submitted geometry**. The separate Quality exact cold frame still took **35.59 s** on this software-WebGL runner and missed the explicitly non-blocking **15 s** aspirational target. These single-run numbers do not establish a cross-hardware speedup guarantee.

The browser diagnostic archive from that run includes `fast-transparent-lod.png`, `quality.png`, `transparent.png`, and `report.json`. At the captured full-wafer pose, the Fast and Quality screenshots show consistent outer silhouette, area coverage and stack/section appearance; the small 3D viewport in these screenshots does **not** substantiate fine-grained near, ROI or edge-on wall visibility. Keep those cases on the outstanding visual acceptance checklist instead of presenting the screenshot comparison as proof of them.

### Exact-transparent orbit responsiveness correction — 2026-10-09

The exploratory 625-site edge-on browser probe revealed a genuine input-starvation mode: with OrbitControls damping enabled, rotating a full-wafer exact transparent array schedules successive costly software-WebGL frames after the pointer is released. Subsequent user or automation clicks can exceed even a 120 s watchdog. The renderer now disables **inertial damping only when an array has at least 64 instances, its active scene is transparent, and its presentation LOD tier is exact**. It retains camera dragging and every physical and annotation sidewall; Fast far-field transparency and normal/opaque scenes continue to use damping. The browser regression now asserts the applied policy in both Fast far and exact transparent modes and still exercises the edge-on transition. This mitigation is subject to the current PR's fresh CI and actual browser validation; the 15 s full-frame timing target remains non-blocking, but stalled input remains a release blocker.

### Final PR #155 release acceptance

At head `a0e71aad`, [run 37886966574](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37886966574) passed the original 625-site software-WebGL renderer stress (`ARRAY_RENDERER_OK`), the new **isolated** edge-on exact-wall/Fit recovery browser job (`ARRAY_EDGE_ON_OK`), and Chromium targeted regressions. Quality, Native Fig3 replay and all Example Recipe Reconstruction cases (including M3D and three-tier JLFET) also passed at that same head.

The independent browser probe recorded the following unmodified-process scene transitions:

| Camera/presentation       | Tier       | Submitted triangles | Electrical far-LOD bodies |
| ------------------------- | ---------- | ------------------- | ------------------------- |
| Fitted far view           | `far-2.56` | 18,346,852          | 39                        |
| Edge-on rotation          | `exact`    | 30,471,548          | 0                         |
| Return to fitted far view | `far-2.56` | 18,346,852          | 39                        |

The model revision remained **61**, Process revision **40**, and translated instance count **1,885** across those transitions; browser errors were empty. The far/recovered screenshots showed the same wafer silhouette, array coverage and stack at the recorded inspection scale. The edge-on exact frame was verified via a completed renderer frame and diagnostic counters; its fine-grained pixel equivalence to Quality/ROI inspection has **not** been established. Keep that limitation explicit in future renderer work.

On the final 20-toggle stress run, exact Quality cold transparency still required **35.50 s** and warm exact transparency **34.67 s** on the CI software-WebGL reference. These exceed the documented **non-blocking 15 s target**; a pass is a correctness/resource/stability result, not a claim of fast exact transparency. Merge-commit validation on `main` is tracked separately from the PR-head evidence.

### Ongoing correctness and visual acceptance

1. Run `npm run check` and the normal array renderer browser suite at the exact branch HEAD using the pinned Node/Playwright/Three toolchain.
2. Run `node scripts/array-renderer-regression.mjs --fast-transparent-lod` with a local site server and `WAFERCAD_THREE_DIR` configured. Inspect `quality.png`, `transparent.png`, and `fast-transparent-lod.png` under matched camera/opacity where possible, and record actual vs previous-main frame times and submitted triangles. Fail/repair if no geometry reduction, first-frame hangs or electrical labels/coverage disappear.
3. At near zoom, ROI, Quality and Section Z-collapse, inspect true electrical walls/depth surfaces. Edge-on/dense-via views are necessary; do not accept reduced triangle count by itself as visual/scientific approval.
4. Confirm full camera zoom-out → zoom-in restoration, opacity variant reuse and 20 toggle resource stability. Do not overwrite approved visual baselines to hide an unintended difference.
5. If the visual contract requires the vertical walls at wafer scale, revert this candidate's cap-only approximation and pursue screen-space contour/owned-wall consolidation instead. Do not merge a visually incorrect approximation.

## Continuing performance acceptance policy

For the historical **Persistent Scene v2.1 integration PR #135** and its current Fast-array successor, the **15 s cold-first-frame budget, warm-vs-cold timing ratios and final-opaque-vs-cold ratio remain advisory** until explicitly promoted to blocking. The full-wafer browser test still runs and emits `ARRAY_RENDERER_PERF_WARNING` plus `performanceAcceptance` in its report. It must continue enforcing:

- completed first frames within a generous watchdog (hangs/crashes are blocking);
- correct transparent scene, buried annotations, material ownership and stable physical scene generation;
- cache reuse semantics (variant-build vs variant-swap), geometry/resource counts, no unbounded retained scene growth;
- opacity/border state transitions, interaction/rotation and all existing Kernel, Recipe, History and Native Fig3 regression checks.

**Deferring speed is not deferring correctness.** A slow but correct first transparent frame can pass this phase; missing geometry, leaks, incorrect visibility, unresponsive/hung rendering or other regression failures cannot.
