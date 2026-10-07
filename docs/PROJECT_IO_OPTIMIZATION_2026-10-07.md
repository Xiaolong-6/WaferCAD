# General Process validation and project IO optimization

> **Historical/superseded checkpoint.** This document intentionally describes the earlier v3 project-IO stage before canonical arrays were added. Subsequent `shared-assets-v4` canonical-array work entered `main` through merge commit `61098987d6ed6d90accdadebbad58405249a0ee5`. Keep the v3 measurements and limitations below as historical evidence; use [Development](DEVELOPMENT.md) and [Architecture](ARCHITECTURE.md) for current behavior.

Product commit: `bb54faad05b1021761db89e874e9907c4a8879a2`. Branch: `codex/process-project-io-optimization` (developed on `codex/project-io-geometry-sharing`). Baseline: `de24166a81f65474c73b08bf0a22ac566dedb76a`. Feature branch for review; no main push, deployment or manual remote CI in this round.

## Product behavior

The normal export, Open, autosave and Recovery paths now share an adaptive storage codec. `shared-assets-v3` builds on the v2 geometry/model/layout dictionaries: equal polygon shapes share integer-delta ring templates with translation origins. Decoding restores ordinary canonical polygon arrays before migration, strict validation, Process, Main, Section or 3D. This is storage compression, not another geometry kernel or an approximate renderer. Ring order, winding, holes, closure, material stacks, annotations, History Steps, bookmarks and Variant HEADs remain intact. Export retains the existing 0.1 nm precision contract. Lossless workspace packing uses raw fallback for sub-grid values and distinguishes negative zero even between otherwise equal raw templates.

V3 is selected only if the geometry dictionary saves at least 2 KB and 15%; small/non-repetitive projects keep v2. This threshold applies to geometry bytes, not the whole file. Existing unencoded/v1/v2 projects remain readable. Older deployed applications cannot read v3 until upgraded. The published examples/previews/thumbnails are unchanged; preview generation explicitly retains v2 so introducing this codec does not change their hashes.

Before allocating translated point arrays, the v3 reader checks every template/reference and preflights the unique expansion cost (maximum 12 million points). It rejects malformed origins, unsafe integer deltas and coordinate overflow. The original schema's logical point/polygon budgets still apply after expansion, including repeated references and History states. Compression cannot authorize an oversized model.

Strict validation avoids unnecessary Boolean operations with two exact broad-phase proofs: four-corner axis-aligned boundaries can contain geometry by exact bounds; polygon components that cannot intersect by bounds are excluded from the region intersection kernel. All other boundary shapes retain robust differences. Remaining overlap components are intersected together, preserving the original aggregate area tolerance. Dimensions, finite coordinates, layer/stack ownership, annotation checks, the 0.1 nm robust retry and transactional worker commit remain enforced. Caches live only within one validation call.

These improvements are generic: actual Process candidate validation uses the same strict validator, and newly generated projects use the same codec. Process geometric computation and 3D tessellation are unchanged.

## Measurements

Windows, Node 24.19.0, Playwright 1.55.1, installed headful Chrome 154.0.8037.98 and pinned Three 0.179.1. Three fresh browser contexts per condition, 1440×960 viewport, default Fast/ROI settings, no concurrent full-test/browser benchmark workloads. The source is the complete native three-tier JLFET project: 40 Steps, five bookmarks, SHA-256 `728e2615a4258c12ea2127e8c6a05b9ce4bbe9e7aa87020642a12d0d5a567c9e`.

The before condition routes baseline `project-io.js` and `project-schema.js` into the real worker URLs. The after condition opens the exact v3 round-trip of the same physical project. Each run waits for Open success and correct-revision 3D readiness, then clicks Export and waits for the download to complete. Live Orbit camera metadata accounts for the small difference between input and re-export bytes.

| Metric (three-run median)   |      Before |     After |   Improvement |
| --------------------------- | ----------: | --------: | ------------: |
| Complete project input      | 1,816,020 B | 995,140 B | 45.2% smaller |
| Opened status               |    12.021 s |   8.333 s |  30.7% faster |
| Correct-revision 3D ready   |    15.772 s |  10.960 s |  30.5% faster |
| Import worker               |     7.194 s |   3.475 s |  51.7% faster |
| UI export/download complete |    18.190 s |  10.608 s |  41.7% faster |
| Export worker               |    14.871 s |   8.556 s |  42.5% faster |
| UI re-export bytes          | 1,816,273 B | 995,384 B | 45.2% smaller |

Raw runs, environment and file matrix are committed in `tests/fixtures/project-io/generic-io-windows-chrome.json`. These are local measurements, not universal loading guarantees or a full-wafer FPS benchmark.

All five complete examples also pass entire normalized project equality against the previous codec, with their complete History/bookmarks and original source bytes preserved:

| Complete example        | V2 re-export bytes | V3 re-export bytes |
| ----------------------- | -----------------: | -----------------: |
| Photodetector           |            366,345 |            286,456 |
| PERC                    |            845,146 |            576,089 |
| Fully textured tandem   |            263,837 |            253,360 |
| Suspended microdisk     |             87,993 |             69,917 |
| Native three-tier JLFET |          1,816,029 |            995,140 |

This comparison uses the same existing export normalization/quantization on both sides. It does not attribute unrelated legacy normalization savings to v3.

## Runtime acceptance and checks

The new `scripts/project-io-runtime-regression.mjs` starts with only a base and 400 actual masks, then drives the UI through Directional deposit, native 10 nm Conformal, export, Open and continued directional Etch. It verifies finite-height native walls at all 400 sites, exact physical model/recorded History after round-trip, unchanged prior Steps, one appended Step per successful Apply, and preserved metal/opened top coating at every site. Live HEAD camera restoration permits only 1e-8 coordinate roundoff from OrbitControls; all other HEAD values remain exact. Installed Chrome and pinned Chromium both passed; the pinned run reports zero camera difference and no page errors. The original installed Chrome run reports only 2.73e-12 camera roundoff.

Executed:

- Full Node suite via `node --test site/tests/*.test.mjs`: 398 passed, zero failures.
- Full ESLint and Prettier inventories via their locked Node CLI entry points: passed (equivalent to the `npm run check` lint/format/Node gates; npm itself is unavailable in this shell).
- `node scripts/build-example-previews.mjs` without `--write`: all five previews deterministic; full source hashes and final geometry/layout preserved.
- All ten standard browser owners plus the new IO case via their direct Node entry points: smoke, workstation, resilience, History, persistence, extended Process geometry, IO runtime, interaction, examples, product layout (109 captures) and renderer (19 captures) passed on pinned Chromium 140.0.7339.186.
- `node scripts/workspace-storage-worker-regression.mjs`: passed with 220 animation frames during full native History packing, matching complete-project SHA-256 after packing/autosave/rejection/lease loss/Recovery, successful retry, 40 Steps and five bookmarks.
- `node scripts/process-transaction-ui-regression.mjs`: actual worker rejection reports overlapping material owners, preserves model/History/bookmarks, creates no empty Variant and accepts the next normal Apply.
- CI planner rechecked after adding IO to Process ownership: 22 passed. IO/schema/template changes now select smoke, persistence and the real Process/IO browser owner.
- `git diff --check`: passed. Published source and preview bytes remain unchanged.

The retry/cache unit fixtures add a collinear boundary point to exercise the general robust Boolean path despite the new rectangle proof. Their original retry/count and rejection assertions remain in force. Additional tests cover holed/concave containment rejection, disjoint components with overlapping whole bounds, and two individually sub-tolerance overlaps whose aggregate must reject.

## Reproduction

Serve `site/` at port 4173 and set `WAFERCAD_URL`, `WAFERCAD_CHROMIUM` (installed Chrome) and `WAFERCAD_THREE_DIR` (`node_modules/three`). Create an ignored output directory first. To benchmark export as well as import:

```bash
WAFERCAD_BENCHMARK_EXPORT=1 node scripts/project-import-benchmark.mjs path/to/project.wafercad test-results/io-benchmark.json 3
```

For the before condition, extract `site/project-io.js` and `site/project-schema.js` from baseline `de24166` into an ignored directory, preserving those file names, and set `WAFERCAD_BASELINE_GEOMETRY_DIR` to that directory. Unset the override for the after condition. For a precise file-size comparison, re-export the source through the current `serializeProject`, then benchmark that v3 file; do not strip its History or bookmarks.

```bash
npm run test:ui:io
npm run test:ui:process
npm run test:ui:all
node scripts/workspace-storage-worker-regression.mjs
node scripts/process-transaction-ui-regression.mjs
```

## Remaining full-wafer limitation

This patch does not introduce canonical model array instances or lazy expansion. The native 625-site JLFET array still exceeds the current logical point budget when eagerly expanded; it has not been promoted as a complete example. Full-wafer process replay, memory scaling and render scalability remain separate acceptance work. This round improves real process validation and real project IO without removing nanometre geometry, History or strict safety limits.

The subsequent in-progress canonical array and idle preparation work is tracked separately in [625-site checkpoint](ARRAY_PROCESS_PREWARM_2026-10-07.md); the measurements above describe the earlier ordinary-model IO implementation.
