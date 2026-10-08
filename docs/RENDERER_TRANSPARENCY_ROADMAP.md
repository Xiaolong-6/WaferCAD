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

## Current acceptance decision

For **the current integration PR #135**, the **15 s cold-first-frame budget, warm-vs-cold timing ratios and final-opaque-vs-cold ratio are advisory**. The full-wafer browser test still runs and emits `ARRAY_RENDERER_PERF_WARNING` plus `performanceAcceptance` in its report. It must continue enforcing:

- completed first frames within a generous watchdog (hangs/crashes are blocking);
- correct transparent scene, buried annotations, material ownership and stable physical scene generation;
- cache reuse semantics (variant-build vs variant-swap), geometry/resource counts, no unbounded retained scene growth;
- opacity/border state transitions, interaction/rotation and all existing Kernel, Recipe, History and Native Fig3 regression checks.

**Deferring speed is not deferring correctness.** A slow but correct first transparent frame can pass this phase; missing geometry, leaks, incorrect visibility, unresponsive/hung rendering or other regression failures cannot.
