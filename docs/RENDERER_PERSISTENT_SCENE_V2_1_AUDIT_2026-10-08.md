# Renderer A v2.1 — Persistent Scene audit (2026-10-08)

**Status: integrated into `feat/process-recipe-v1`; 625-site transparency performance debt recorded and temporarily NON-BLOCKING for current PR #135. Functional and scientific correctness gates remain required.** Renderer source branch: `perf/renderer-persistent-scene-v2-1`. Baseline: GPU rough v3 merged at `58b45ee9`. Integration merge: `f51bef35` via [#134](https://github.com/Xiaolong-6/WaferCAD/pull/134); review gate: [#135](https://github.com/Xiaolong-6/WaferCAD/pull/135).

## Scope and verified behavior

- Physical Process Geometry and `.wafercad` schema are unchanged.
- Scene-variant registry separates opaque and transparent presentation.
- Cold transparent variant reuses `physicalSurfacePlan` and builds presentation-specific cap/sidewall/annotation geometry. Warm variant swap should reuse previously constructed scene resources.
- Full-wafer array geometry still relies on instancing. Opacity/border updates within a variant avoid physical topology recalculation.
- CI Quality passed on the diagnostic checkpoints; the array-renderer browser test has **not** passed the required performance threshold.

## Benchmark evidence

The Chromium full-wafer regression uses the 625-site / 1885-instance project. Initial opaque rendering and Fast/Quality transitions succeed.

| CI head | Transparent path | CPU variant assembly | Cold transparent wait | Status |
|---|---|---:|---:|---|
| `045f9820` | 4096-instance groups, pooled materials | ~0.6 s | >45 s timeout | Fail |
| `3840247d` | 64-instance groups, pooled materials | ~0.8 s | >45 s timeout | Fail |
| `264b3f76` | 64-instance groups, private transparent materials | ~0.4 s | 37.8 s | Fail |
| `a5f9abed` | 256-instance groups, private materials, experimental single-pass | ~0.3 s | 27.5 s | **Invalid experiment:** violates verified two-pass transparency contract |

The experimental `forceSinglePass` change was reverted in `faee9138`. Do not reintroduce it without an independently reviewed visual/scientific contract change. The current code preserves the two-pass transparent material behavior and uses 256-instance transparent spatial groups; its resulting browser runtime requires verification.

## Root-cause boundary

The stage logger separates cap bucket construction, sidewall construction, annotations and presentation updates. In failed runs, **CPU assembly completes in less than ~1 second**; the 45-second wait is dominated by the first WebGL transparent frame on the CI software renderer. The problem is *not* a Process Kernel or physical topology operation. Existing scene diagnostic counts show **608 opaque objects** versus roughly **940–2100 transparent objects**, depending on spatial chunking.

## Next implementation direction

1. Stop adjusting only pixel ratio, shader single-pass, or arbitrary instance chunk limits. The bottleneck remains transparent rendering object count / draw submission / blending order.
2. Prototype **transparent mesh consolidation by layer, Z interval, material ownership and spatial tile**. Reduce draw calls without merging incompatible near/far depth-ordering groups; preserve buried-interface and implant/electrical annotation visibility.
3. Instrument first `renderer.render` time, draw calls and triangles. Compare with GPU-v3 baseline under the same Chromium/software WebGL runner.
4. Validate exact screenshots/visibility in opaque and transparent states, including interior annotations and nested caps/sidewalls, then repeat 20 opacity/border toggles and confirm resource stability.
5. **Revised 2026-10-08:** Quality, Browser structural/visual/resource checks and Native Fig3 remain required. The cold transparency <15 s target and warm swap latency are recorded as non-blocking metrics for this integration; their future re-promotion to a performance gate requires a separate decision and validated baseline.

The authoritative long-lived contracts remain `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, and `docs/testing.md`; this note is dated diagnostic evidence only.

## Integrated-branch follow-up (2026-10-08)

The original renderer branch was merged for audit and iteration into the **feature branch only**; it was not accepted for `main`. On integrated SHA `f51bef35`, Quality, Native Fig3, and Process Geometry passed, but Browser failed on the 625-site transparency path. The reported cold 0.67 s was a timing artifact: `renderState=ready` was set before first WebGL frame completion. Warm transparent swap measured **36.77 s** in the CI software renderer despite zero topology/assembly work. The cached scene and low CPU assembly numbers therefore must not be presented as evidence of satisfactory interactive performance.

The follow-up integration branch adds vertex-lit Lambert shading for smooth transparent large-array surfaces (while retaining two-pass DoubleSide transparency), frame completion/draw-call counters, active-and-retained scene resource diagnostics, compositor-aware renderer benchmarking, and 20 opacity/border stress toggles. Scientific material ownership and GLB export remain in the existing Kernel/CPU contracts. **All timing, visual and resource checks must be rerun against the final HEAD**; these changes are not yet proof of acceptance.

A separate application audit also found and addressed the archived-Main HEAD bug when Apply Base is invoked from an earlier History Step. Process Recipe now has a user-visible Start selector: Continue current model (confirmation required if process revisions exist) or Rebuild Base first into a new Main (with existing Keep/Clear history protection). Base HEAD and Recipe execution-state browser/unit tests were added. Product documentation in README, USAGE, ARCHITECTURE, DEVELOPMENT and testing was synchronized.

Acceptance remains blocked by any Quality, Browser functional/scientific/visual/resource, or Native Fig3 failure on the final HEAD; **cold/warm transparency speed thresholds alone are not a blocker for this integration**. Preserve the two-pass transparent inspection and physical geometry contracts. See [the canonical transparency performance roadmap](RENDERER_TRANSPARENCY_ROADMAP.md) for root cause, attempts, phased LOD plan and promotion criteria.

## Temporary non-blocking performance decision (2026-10-08)

User decision: the full-wafer transparency bottleneck is acknowledged and tracked as performance debt. The browser workload still runs to completion and checks scene correctness, annotations, history-independent material topology, scene-cache reuse, resource stability and interaction. **Only the cold-first-frame 15 s goal and timing ratios have become advisory, not the whole Browser suite.** Out-of-budget values print `ARRAY_RENDERER_PERF_WARNING` and are kept in `report.json`; a true timeout, hang, crash, geometry error or leaked resources still fails CI. The staged plan and current empirical evidence live in [RENDERER_TRANSPARENCY_ROADMAP.md](RENDERER_TRANSPARENCY_ROADMAP.md).
