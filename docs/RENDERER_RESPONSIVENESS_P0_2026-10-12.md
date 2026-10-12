# Responsive renderer P0/P1 incremental rollout — 2026-10-12

## Scope and status

This is a first, narrowly scoped **P0 staging improvement**, not a completed progressive-rendering implementation or evidence of a frame-rate gain. The production renderer and all V3/V4 optional geometry policies remain unchanged, and this experimental branch stays Draft.

### Implemented

- During a cold **opaque-to-transparent or transparent-to-opaque scene-variant build**, the previously committed Group remains in the Three.js scene while the replacement Group is assembled invisible.
- A variant build suppresses incomplete assembly-frame submissions. On successful assembly the previous cached Group is detached, the new Group becomes visible, and the original previous Group remains in the bounded cache for reverse switching.
- On a variant-build exception, the existing rollback path restores the previous committed variant; a failed ROI/full scene rebuild remains fail-closed rather than misrepresenting stale geometry as the requested model.
- Two read-only counters expose retained builds and committed swaps for targeted full-wafer browser regression.

### Not implemented by this patch

- Full-scene transactional staging for changed model / ROI revisions.
- Camera-interaction preview LOD beyond the existing Fast far-array LOD and dynamic DPR mechanisms.
- Worker-side complete scene assembly, GPU upload time slicing, OffscreenCanvas renderer isolation or preemptible WebGL submission.
- A guaranteed continuous visible frame across every browser's WebGL buffer presentation during a long synchronous draw.
- New exact-rendered output, hardware performance gains or visual-baseline changes.

## Validation

The existing `scripts/renderer-v4-r5-dual-variant-browser.mjs` now requires the first 625-site opacity transition to record a retained previous group and a committed atomic scene swap; it continues to assert bounded retained CPU geometries/materials and repeated cached reversals.

Automatic Quality, Browser regression, and owning UI v2 checks run on the branch push. Their presence or success does **not** substitute for running the targeted full-wafer dual-variant script. Repeat the targeted browser test, opacity reversion, WebGL loss/recovery, ROI rejection, and repeated switching before promotion.

## Next prioritized engineering work

1. **P0:** stage changed-model/ROI rebuilding transactionally; keep old view visibly labeled as stale while new model computes, never label it valid scientific output. Use a generation token to reject superseded builds.
2. **P1:** provide an explicit lightweight interactive scene tier and restore exact detail after input settles. Measure input-to-present latency, not only assembly duration.
3. **P2:** isolate CPU mesh preparation in workers and split WebGL upload on a bounded frame budget; profile GPU contention on at least one verified hardware adapter.
4. Preserve exact scientific geometry, transparent sorting and pixel-baseline acceptance for final Quality. Preview uses its own declared display-only error contract.
