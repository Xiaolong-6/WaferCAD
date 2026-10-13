# Interactive renderer scheduling — first implementation (2026-10-12)

## Scope and boundary

First incremental change on the sole experimental renderer branch, PR #174. The baseline renderer remains `site/three-view.js`; V3/V4 Index/Caps and optional quality policies remain default-off. There is no change to canonical Process geometry, History, material layering, exported geometry, MSAA, or accepted visual baselines.

## Implementation

- Heavy array scene assembly now checks an 8 ms cooperative deadline between existing geometry units, instead of the prior 32 ms deadline. This is a scheduling hint, **not** a hard task execution bound.
- After yielding, the assembly resumes in a separate browser task following an animation-frame callback. Previously the `requestAnimationFrame` Promise could resume in a microtask _before paint_ and resume assembly without giving the browser a paint/input opportunity.
- Both fresh and opaque/transparent variant assembly use the revised scheduling path. Unit tests cover the deadline decision and the frame-to-task ordering.
- Rough mesh Worker, process Worker, Fast far-view LOD, renderer resource lifecycle, opacity sorting and scientific precision rules are left unchanged.

## Critical limits

This does **not** split or preempt `renderer.render()`, WebGL buffer uploads, triangulation inside one geometry unit, or large synchronous `buildRenderSurfacePlan()`. It does not yet provide a retained old-scene/final-scene atomic swap or a complete interactive LOD state machine. Do not claim that front-end input latency, 60 FPS, first-pixel delay or hardware GPU throughput has improved without browser evidence.

## Acceptance

1. Run `npm run check` on this branch, including `site/tests/renderer-interaction-scheduler.test.mjs`.
2. On an actual browser, compare before/after 625-site transparent scene assembly for Long Tasks, P95 input latency, frame completion and time to exact scene.
3. Check opacity toggles, ROI, Section Z, rough material and repeated load/unload; verify identical final scientific geometry and no resource growth.
4. Before production promotion implement retained old-scene rendering, stale work cancellation and chunked GPU uploads; test interactive preview separately from exact scientific-frame pixel parity.

The confirmed lifecycle corrections remain on main via PR #183. This commit does not attempt to resolve the separate RTX 3060 MSAA cross-context strict pixel issue.
