# Responsive renderer P0/P1 incremental rollout — 2026-10-12

## Scope and status

This is an experimental P0/P1 implementation, not evidence of a 60 FPS interactive renderer, GPU speedup, or completed progressive GPU streaming. The production renderer and all V3/V4 optional geometry policies remain unchanged, and this experimental branch stays Draft.

### Implemented

- During a cold **opaque-to-transparent or transparent-to-opaque scene-variant build**, the previously committed Group remains in the Three.js scene while the replacement Group is assembled invisible.
- A variant build suppresses incomplete assembly-frame submissions. On successful assembly the previous cached Group is detached, the new Group becomes visible, and the original previous Group remains in the bounded cache for reverse switching.
- On a variant-build exception, the existing rollback path restores the previous committed variant; a failed ROI/full scene rebuild remains fail-closed rather than misrepresenting stale geometry as the requested model.
- Two read-only counters expose retained builds and committed swaps for targeted full-wafer browser regression.
- Opt-in `rendererResponsiveModelStage=1` keeps the last committed model on screen during changed-model or ROI construction. A new scene commits only after completion; failures restore previous ownership and show an explicit stale-view label. A newer pending revision can supersede unfinished assembly at the next cooperative yield.
- Opt-in `rendererResponsiveInteraction=1` hides selected costly buried/electrical/implant *presentation* meshes while the camera is manipulated on a full-array transparent view without ROI, then restores exact visibility 180 ms after activity settles. The preview is labeled and explicitly prohibited as a final PNG source.

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
