# Foreground-first renderer: P0 scene continuity

**Status:** Production P0 merged into main via [PR #186](https://github.com/Xiaolong-6/WaferCAD/pull/186), commit `1d091a3`. The extended V3/V4 experiment in #174 uses a reconciled implementation and remains Draft.

## Scope

This is an initial step toward responsive 3D. The existing renderer stays
the sole rendering engine. It does not implement GPU LOD, background WebGL
rendering, interruptible frames, or a complete progressive pipeline.

## Implementation

For an uncached opaque/transparent scene-variant rebuild,
`site/three-view.js` keeps the previous complete scene visible while
the replacement is assembled hidden. After applying the new presentation,
the old group is detached and remains in the scene-variant cache.
On a variant-build failure, the partial scene is disposed and the previous
cached presentation is restored where possible.

Large-array assembly now yields the browser an input macrotask at an approximately
8 ms cooperative time-slice boundary, including during opaque/transparent
variant assembly. This provides opportunities to service other panes and
pointer events but does not preempt an expensive individual synchronous mesh
operation or GPU submission. Variant failure is recorded separately in the
3D host diagnostics; a subsequent build clears the previous failure marker.

On subsequent opacity or view updates, a superseded transparency variant
build now aborts at its next cooperative checkpoint. The partial scene is
disposed, the last completed variant is restored, and the pending request
continues normally. The rollback path does not launch stale Rough Mesh work
while waiting for a newer request. `rendererSupersededBuilds` exposes the cancellation count
for browser verification. Cancellation is not yet available for a general
initial-model rebuild or inside a single long synchronous geometry/GPU call.

Initial model replacement still drops the previous physical scene, and
expensive WebGL frame submissions remain unchanged.
Worker availability alone does not guarantee responsive foreground input.

## Validation

- Branch: `perf/foreground-responsive-rendering-20261012`.
- Source-contract tests cover commit ordering, rollback wiring, and cooperative yielding.
- Unit, lint, formatting, and browser CI need to pass on the new HEAD.
- Focused 625-site opacity supersession and retained-scene browser test is now scripted, with CI evidence required before merge.
- Injected GPU failure and strict real-hardware parity remain pending.
- No FPS, strict-pixel, hardware-GPU, or memory improvement is claimed.
- Scientific geometry, project data, approved visual baselines, and
  experimental renderer defaults remain unchanged.

## Follow-up work

1. Add real input-latency and scene-continuity browser acceptance.
2. Implement revision-aware cancellation and interaction-first scheduling.
3. Prepare and transfer mesh chunks with bounded main-thread GPU uploads.
4. Extend safe presentation-only LOD with exact near/ROI/edge-on restoration.
5. Consider OffscreenCanvas after measuring actual foreground contention.

## Integration with PR #174 — 2026-10-13

The production P0 correctness flow from #186 is reconciled into #174 using its existing single scene-variant cache, `SupersededRendererBuild` cancellation type, bounded yielding policy, and rollback owner. There is no second renderer, extra duplicate build state machine, or global policy change. Read-only compatibility counters (`rendererRetainedCompleteVisible`, `rendererVariantRollbacks`, `rendererSupersededBuilds`) preserve the independent full-array regression semantics. The #174 implementation additionally stages model/ROI rebuilds and has opt-in Worker/preview/rough-assembly/metrics features. All non-production experimental switches remain default-off. The two-parent integration commit requires revision-specific CI evidence; previous PR checks do not certify its combined tree.
