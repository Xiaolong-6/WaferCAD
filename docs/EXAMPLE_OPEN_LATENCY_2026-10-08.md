# Complete example open latency — 2026-10-08 (branch follow-up)

> Revision-specific work-in-progress on `perf/example-load-latency-20261008`, based on `main`. This note does not establish current-main performance, deployment or CI acceptance.

## Scope and changes

The October 7 profile isolated the remaining complete-import costs: full Worker validation, History preparation and first 3D readiness. The preceding optimization already reduced native Fig3 Opened / 3D-ready medians to 12.245 / 16.002 seconds in one Windows Chrome setup; those are historical figures, **not** measurements of this branch.

This follow-up targets avoidable **fetch and buffer overhead**, without changing the physical model or historical states:

1. The editor previously fetched every complete bundled example with `cache: 'no-store'`. It now uses the normal HTTP cache with an asset URL keyed by the deployed build commit (`?v=<build>`). Assets from different builds have different URLs; a successful hover-prefetch and the editor request the same URL. When `build-info.json` is unavailable in a local preview, both Welcome and App now use the same stable `local` version key instead of unrelated `Date.now()` values; the static server remains responsible for HTTP freshness.
2. Welcome prefetches a **single complete project only on user intent** (keyboard focus or 180 ms of title/summary link hover). Plain scrolling, card display and preview frames do not prefetch complete project files. Data-saver connections are exempt; failed prefetches do not prevent normal opening.
3. The fetched `ArrayBuffer` is passed directly to project IO using a minimal File-compatible handle. The former `new File([arrayBuffer])` path made a redundant copy before the transfer to `project-worker.js`.
4. Worker parsing, geometry expansion, strict validation, pre-replacement Recovery checkpoint, snapshot/variant import and initial views are unchanged. A warm cache **does not** mean the Worker or 3D computation is skipped; no geometry, history, recipe, mask, view fidelity or safety behavior is intentionally reduced.

## Acceptance and measurement

- Unit: `node --test site/tests/example-asset.test.mjs` tests deployment-scoped cache URLs and ArrayBuffer identity/text fallback.
- Existing contracts: `npm run check:ci`, `npm run test:ui:examples`, `node scripts/welcome-thumbnail-regression.mjs test-results/welcome-thumbnails.json 1 --check-interaction --headless`.
- Cold versus intent-prefetched full opening: `node scripts/example-open-benchmark.mjs three-tier-silicon-jlfets 3 --headless`. Repeat for `m3d-selfpowered-heterogeneous-ic` and at least one small example. Set `WAFERCAD_URL` and `WAFERCAD_CHROMIUM` as described in [the previous benchmark record](WELCOME_LOADING_2026-10-07.md). This cache benchmark deliberately avoids Playwright `context.route()` (including the pinned Three route), because enabling request interception disables Chromium's HTTP cache; the other regression suites still pin Three. Its CI runner must therefore reach the published Three.js CDN. The new benchmark checks complete Step counts, page errors, correct-revision 3D readiness **and actual cached payload reuse**; it records cold/warm medians and worker time separately. A dedicated change-scoped `Example opening acceptance` GitHub Actions workflow runs one complete browser sample and uploads timing diagnostics.
- Verify one complete-asset request per intentional hover/focus, no complete-asset requests on ordinary Welcome scroll, and new asset URL after a build commit change. Inspect transferred bytes and HTTP cache headers: a static server sending `no-store` may negate warm-cache benefit despite code changes.
- The first dedicated CI sample exposed inconsistent local version keys (`Date.now()` across Welcome and App), so a successful prefetch fetched the full payload again; the fallback and a cache-byte assertion were added before acceptance. Compare under the same browser/hardware and fresh contexts. **No reproducible wall-clock improvement is claimed based on one unpaired CI run.** Cold, never-visited direct links still pay full strict validation and geometry render time.


## Verified browser cache acceptance — 2026-10-09

The [change-scoped CI browser run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37874576606) verified complete Project opening, History step-count and 3D model-revision readiness with no page errors. Under its cacheable local server, Chromium reported:

| Single sample     | Opened (ms) | 3D ready (ms) | Project transfer bytes |
| ----------------- | ----------- | ------------- | ---------------------- |
| Cold              | 1365        | 1542          | 691075                 |
| Intent-prefetched | 1319        | 1498          | 0                      |

The transferred-byte reduction validates the design; a one-run timing difference is **not** a statistically defensible speedup claim. The benchmark uses no Playwright request interception because it disables HTTP caching. Its test server explicitly sends `Cache-Control: public, max-age=600` for `.wafercad`, comparable to a cacheable production response; actual deployment cache headers still govern the production benefit.

## Follow-up outside this patch

Meaningful additional **cold-start CPU** reductions require measured worker-schema and renderer profiling, with strict before/after model equality and full History/Recovery/3D acceptance. Do not weaken validation or replace full examples with final-only previews to manufacture a faster metric.
