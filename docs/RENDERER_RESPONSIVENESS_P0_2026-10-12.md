# Responsive renderer P0/P1 incremental rollout — 2026-10-12

## Scope and status

This is an experimental P0/P1 implementation, not evidence of a 60 FPS interactive renderer, GPU speedup, or completed progressive GPU streaming. The production renderer and all V3/V4 optional geometry policies remain unchanged, and this experimental branch stays Draft.

### Implemented

- During a cold **opaque-to-transparent or transparent-to-opaque scene-variant build**, the previously committed Group remains in the Three.js scene while the replacement Group is assembled invisible.
- A variant build suppresses incomplete assembly-frame submissions. On successful assembly the previous cached Group is detached, the new Group becomes visible, and the original previous Group remains in the bounded cache for reverse switching.
- On a variant-build exception, the existing rollback path restores the previous committed variant; a failed ROI/full scene rebuild remains fail-closed rather than misrepresenting stale geometry as the requested model.
- Two read-only counters expose retained builds and committed swaps for targeted full-wafer browser regression.
- Opt-in `rendererResponsiveModelStage=1` keeps the last committed model on screen during changed-model or ROI construction. A new scene commits only after completion; failures restore previous ownership and show an explicit stale-view label. A newer pending revision can supersede unfinished assembly at the next cooperative yield.
- Opt-in `rendererResponsiveInteraction=1` hides selected costly buried/electrical/implant _presentation_ meshes while the camera is manipulated on a full-array transparent view without ROI, then restores exact visibility 180 ms after activity settles. The preview is labeled and explicitly prohibited as a final PNG source.

### Not implemented by this patch

- Default enablement of the experimental model/ROI staging and interaction preview policies.
- Worker-side complete scene assembly, GPU upload time slicing, OffscreenCanvas renderer isolation or preemptible WebGL submission.
- A guaranteed continuous visible frame across every browser's WebGL buffer presentation during a long synchronous draw.
- New exact-rendered output, hardware performance gains or visual-baseline changes.

## Validation

`scripts/renderer-responsive-browser.mjs` checks a real project reload with staging enabled, retained/committed model swaps, completed frames, and bounded retired resources. The separate existing `scripts/renderer-v4-r5-dual-variant-browser.mjs` checks full-wafer variant caching, and now exercises the opt-in interaction preview, submitted-triangle reduction and return to exact display.

Automatic Quality, Browser regression, and owning UI v2 checks run on the branch push. Their presence or success does **not** substitute for running the targeted full-wafer dual-variant script. Repeat the targeted browser test, opacity reversion, WebGL loss/recovery, ROI rejection, and repeated switching before promotion.

## Next prioritized engineering work

1. Finish the ROI rejection/recovery and 625-site gesture browser gates; do not promote the opt-in policies until these pass at the exact latest commit.
2. Record input-to-present latency and jank under repeated camera/opacity/model changes, beyond submitted-triangle measurements.
3. Isolate more CPU mesh preparation in workers and split WebGL upload on a bounded frame budget; profile GPU contention on at least one verified hardware adapter.
4. Preserve exact scientific geometry, transparent sorting and pixel-baseline acceptance for final Quality. Preview uses its own declared display-only error contract.

## 2026-10-13 software-browser checkpoint

The scoped transactional-reload browser workflow completed successfully at `b9ed473`. The original 625-site R5 dual-variant browser test at `fdb1984` exercised `rendererResponsiveInteraction=1` on ANGLE SwiftShader: **16,906,262 submitted triangles** in the exact transparent view, **5,080,012** during pointer interaction with **291 internal display meshes** temporarily hidden, and **16,906,262** after settling. Its two cached scene variants retained **32,181,984 CPU TypedArray bytes** across repeated opacity switches, with no browser errors. These are software-backend geometry-submission and resource-census observations, not measured user input latency, GPU VRAM, or a guarantee of physical-GPU FPS.

The default scene policy remains unchanged. Model/ROI staging, stale labels, and interaction preview require the opt-in query flags. Do not merge or default-enable #174 until independent ROI failure/recovery, context loss, and hardware interactive-latency gates are reviewed.

## P2.1 — Smooth-sidewall CPU Worker (experimental)

`?rendererResponsiveSmoothWorker=1` moves the exact unindexed smooth-sidewall triangle and normal preparation for eligible large groups to a dedicated CPU Worker. Geometry uses the existing collinear-merging algorithm and the original triangle winding, normal normalization, and Float32 buffers; buffers transfer back without a deep copy. The existing Three.js renderer still owns BufferGeometry construction, materials, transparent sorting, and WebGL submission. Roughness, Electrical/Implant depth annotations, indexed geometry and approximate far LOD are excluded, retaining their existing behavior.

A Worker error falls back to the original synchronous geometry builder; a superseded model request is checked on return. The Worker is terminated at the end of scene assembly. Read-only `rendererSmoothWorkerJobs`, `rendererSmoothWorkerFallbacks`, and `rendererSmoothWorkerWallMs` counters identify whether the experimental path actually ran. Node data-contract tests and a real Chromium Worker smoke are separate from full-wafer integration and hardware performance acceptance. This work does **not** make GPU uploads or `renderer.render()` preemptible.

## P2.2A — foreground-aware rough assembly and latency telemetry (2026-10-13)

Two additional opt-in flags are intentionally **off by default**:

- `rendererResponsiveRoughBudget=1`: after the existing Rough Mesh Worker returns at least eight detailed results, the main thread converts and attaches them in batches of at most eight geometry units and nominal 8 ms cooperative slices. The scheduler yields across a browser frame plus task boundary and pauses new units during active camera interaction. Newly assembled rough objects remain hidden until the exact final presentation state is applied. A scene-generation or Worker-generation supersession aborts obsolete batches. Existing synchronous paths, including fallback and small result sets, remain unchanged. Counters: `rendererRoughAssemblyUnits`, `rendererRoughAssemblyYields`, `rendererRoughAssemblyMaxUnitMs`, `rendererRoughAssemblyWallMs`, `rendererRoughAssemblyCancelled`.
- `rendererResponsiveMetrics=1`: track earliest unserved OrbitControls input event to the completion of the next synchronous `renderer.render()` call. Counters: `rendererInputSamples`, `rendererInputToSubmitP95Ms`, `rendererInputToSubmitMaxMs`, `rendererInputToSubmitLastMs`, `rendererFrameSubmitP95Ms`, `rendererFrameSubmitMaxMs`. These are **JS event-to-WebGL-submission metrics**; they are not GPU completion, compositor presentation, user-perceived end-to-end latency, or proof of a refresh rate.

The budget applies **between complete geometry objects**, not to individual expensive triangulation, instancing, `renderer.render()` or GPU buffer uploads. Strict final geometry and screenshots remain unchanged in the default path. Unit tests cover ordering, budget boundaries, foreground pause, supersession and telemetry distributions. Browser UI gesture tests verify finite live samples; full 625-site interaction and pixel parity remain acceptance requirements before enabling by default. The larger P2.2 goal of truly budgeted WebGL uploads is still open.

## P2.3 — Main-thread long-task telemetry (opt-in)

With `rendererResponsiveMetrics=1`, the runtime now records native `PerformanceObserver` long-task entries (typically 50 ms and above) separately from event-to-WebGL-submit timing. The read-only counters are `rendererLongTaskSupported`, `rendererLongTaskCount`, `rendererLongTaskP95Ms`, `rendererLongTaskMaxMs`, and `rendererMainThreadBlockingMs` (sum of observed durations exceeding the 50 ms threshold). Capability absence is explicitly reported without aborting rendering. The probe is disabled by default and does not claim GPU or compositor timing.

The responsive Chromium acceptance requires that the instrumentation reports its capability honestly and produces finite values, while bounded Node tests verify sample statistics and history eviction. Future controlled A/B comparisons should report both input-to-submit and main-thread blocking distributions for the same physical GPU, project, camera path and capture policy; isolated software-WebGL timings alone cannot establish a native performance win.
