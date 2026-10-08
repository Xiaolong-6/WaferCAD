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


## 2026-10-08 isolated fast-array LOD candidate

Branch: `perf/transparent-array-lod-20261008` (based on `main` at `be2f6af`). **Development-only, not merged; browser/visual benchmarks pending.** This entry documents implementation scope rather than claiming a measured speedup.

- `site/transparent-array-lod.js` quantizes the projected XY pixel footprint into bounded, camera-dependent far tiers (maximum 0.85 pixel simplification error per tier). Transparent full-array LOD is eligible only in **Fast**, with at least 64 translated instances and **no ROI**; **Quality**, opaque inspection and local/near inspection retain the original exact presentation path.
- In eligible distant transparent arrays, `electrical-internal` repeated bodies retain their two true top/bottom caps, material colors, owner/depth Z and instance transforms but skip the many side triangles. This is a **far-field display approximation**: it can underrepresent vertical annotation boundaries in edge-on views. The exterior Electrical surface remains separately rendered. No physical/annotation source model, Process, History, project storage or GLB path is modified. Implant gradient bodies, rough-electrical profiles and cut/partially collapsed annotation volumes deliberately retain their full walls.
- The camera LOD tier participates in scene-signature invalidation independently of Opacity, so an opaque/transparent scene variant swap can still reuse its physical plan. At tier changes on orbit-end, fit, restored view or resize, the renderer rebuilds the correct near/far meshes rather than retaining stale simplification. Retained variant diagnostics report the actual restored tier and count.
- `site/tests/transparent-array-lod.test.mjs` covers eligibility, thresholds, cap preservation, source immutability and Z-collapse fallback. These source tests are committed; they are **not claimed executed** in the GitHub-connector-only session.
- Existing `scripts/array-renderer-regression.mjs` continues its established default quality/resource correctness gate. An **opt-in** `--fast-transparent-lod` run checks the far-field triangle count versus exact transparent Quality, materials/array ownership, full-frame success, and saves a full-resolution screenshot under `test-results/array-renderer/`. It does not weaken an existing performance or geometry assertion.

### Acceptance before merging this candidate

1. Run `npm run check` and the normal array renderer browser suite at the exact branch HEAD using the pinned Node/Playwright/Three toolchain.
2. Run `node scripts/array-renderer-regression.mjs --fast-transparent-lod` with a local site server and `WAFERCAD_THREE_DIR` configured. Inspect `quality.png`, `transparent.png`, and `fast-transparent-lod.png` under matched camera/opacity where possible, and record actual vs previous-main frame times and submitted triangles. Fail/repair if no geometry reduction, first-frame hangs or electrical labels/coverage disappear.
3. At near zoom, ROI, Quality and Section Z-collapse, inspect true electrical walls/depth surfaces. Edge-on/dense-via views are necessary; do not accept reduced triangle count by itself as visual/scientific approval.
4. Confirm full camera zoom-out → zoom-in restoration, opacity variant reuse and 20 toggle resource stability. Do not overwrite approved visual baselines to hide an unintended difference.
5. If the visual contract requires the vertical walls at wafer scale, revert this candidate's cap-only approximation and pursue screen-space contour/owned-wall consolidation instead. Do not merge a visually incorrect approximation.

## Current acceptance decision

For **the current integration PR #135**, the **15 s cold-first-frame budget, warm-vs-cold timing ratios and final-opaque-vs-cold ratio are advisory**. The full-wafer browser test still runs and emits `ARRAY_RENDERER_PERF_WARNING` plus `performanceAcceptance` in its report. It must continue enforcing:

- completed first frames within a generous watchdog (hangs/crashes are blocking);
- correct transparent scene, buried annotations, material ownership and stable physical scene generation;
- cache reuse semantics (variant-build vs variant-swap), geometry/resource counts, no unbounded retained scene growth;
- opacity/border state transitions, interaction/rotation and all existing Kernel, Recipe, History and Native Fig3 regression checks.

**Deferring speed is not deferring correctness.** A slow but correct first transparent frame can pass this phase; missing geometry, leaks, incorrect visibility, unresponsive/hung rendering or other regression failures cannot.
