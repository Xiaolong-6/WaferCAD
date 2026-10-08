# Complete example open latency — 2026-10-08 (branch follow-up)

> Revision-specific work-in-progress on `perf/example-load-latency-20261008`, based on `main`. This note does not establish current-main performance, deployment or CI acceptance.

## Scope and changes

The October 7 profile isolated the remaining complete-import costs: full Worker validation, History preparation and first 3D readiness. The preceding optimization already reduced native Fig3 Opened / 3D-ready medians to 12.245 / 16.002 seconds in one Windows Chrome setup; those are historical figures, **not** measurements of this branch.

This follow-up targets avoidable **fetch and buffer overhead**, without changing the physical model or historical states:

1. The editor previously fetched every complete bundled example with `cache: 'no-store'`. It now uses the normal HTTP cache with an asset URL keyed by the deployed build commit (`?v=<build>`). Assets from different builds have different URLs; a successful hover-prefetch and the editor request the same URL.
2. Welcome prefetches a **single complete project only on user intent** (keyboard focus or 180 ms of title/summary link hover). Plain scrolling, card display and preview frames do not prefetch complete project files. Data-saver connections are exempt; failed prefetches do not prevent normal opening.
3. The fetched `ArrayBuffer` is passed directly to project IO using a minimal File-compatible handle. The former `new File([arrayBuffer])` path made a redundant copy before the transfer to `project-worker.js`.
4. Worker parsing, geometry expansion, strict validation, pre-replacement Recovery checkpoint, snapshot/variant import and initial views are unchanged. A warm cache **does not** mean the Worker or 3D computation is skipped; no geometry, history, recipe, mask, view fidelity or safety behavior is intentionally reduced.

## Acceptance and measurement

- Unit: `node --test site/tests/example-asset.test.mjs` tests deployment-scoped cache URLs and ArrayBuffer identity/text fallback.
- Existing contracts: `npm run check:ci`, `npm run test:ui:examples`, `node scripts/welcome-thumbnail-regression.mjs test-results/welcome-thumbnails.json 1 --check-interaction --headless`.
- Cold versus intent-prefetched full opening: `node scripts/example-open-benchmark.mjs three-tier-silicon-jlfets 3 --headless`. Repeat for `m3d-selfpowered-heterogeneous-ic` and at least one small example. Set `WAFERCAD_URL`, `WAFERCAD_CHROMIUM`, `WAFERCAD_THREE_DIR` as described in [the previous benchmark record](WELCOME_LOADING_2026-10-07.md). The new benchmark checks complete Step counts, page errors and correct-revision 3D readiness; it records cold/warm medians and worker time separately.
- Verify one complete-asset request per intentional hover/focus, no complete-asset requests on ordinary Welcome scroll, and new asset URL after a build commit change. Inspect transferred bytes and HTTP cache headers: a static server sending `no-store` may negate warm-cache benefit despite code changes.
- Compare under the same browser/hardware and fresh contexts. **No new wall-clock improvement is claimed until the browser benchmark is actually run.** Cold, never-visited direct links still pay full strict validation and geometry render time.

## Follow-up outside this patch

Meaningful additional **cold-start CPU** reductions require measured worker-schema and renderer profiling, with strict before/after model equality and full History/Recovery/3D acceptance. Do not weaken validation or replace full examples with final-only previews to manufacture a faster metric.
