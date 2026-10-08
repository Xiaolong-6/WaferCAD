# Renderer A v2.1 — Persistent Scene audit (2026-10-08)

**Status: draft / not accepted / do not merge.** Source branch: `perf/renderer-persistent-scene-v2-1`. Baseline: GPU rough v3 merged at `58b45ee9`. PR: [#134](https://github.com/Xiaolong-6/WaferCAD/pull/134).

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
5. Required acceptance: Quality + Browser green, cold transparency <15 s as a first gate, then evaluate warm swap against the sub-second v2.1 goal. No merge until these are achieved.

The authoritative long-lived contracts remain `docs/ARCHITECTURE.md`, `docs/DEVELOPMENT.md`, and `docs/testing.md`; this note is dated diagnostic evidence only.
