# Project storage and import optimization — 2026-10-06

Branch: `codex/project-io-geometry-sharing`. Starting baseline: `origin/fix/z-collapse-front-back-scale` at `1104a4b`.

The goal is a smaller exported `.wafercad` file and faster import while retaining all physical geometry, restorable Steps, Variant HEADs and bookmarks. The reference scenario is the locally reconstructed Fig. 3 wafer: 67,315,148 bytes, 41 Steps, five bookmarks, 1,875 devices. A measurement-only geometry dictionary reduced it to 3,211,041 bytes with exact field restoration; this is not yet a supported file.

Implementation will add a versioned geometry dictionary to shared asset storage, retain legacy readers, remove redundant cloning during packing, and reuse geometry-only validation work within a single validation call. Layer/stack, dimensional and annotation checks must remain state-specific. Imported geometry must not allow edits to change other historical states.

Acceptance: exported reference at most 5 MB; measured import median at least 50% lower than baseline in the same Chrome environment; exact round trips for all Steps and bookmarks; malformed-reference rejection; historical edit isolation; persistence and History browser regressions. Timing results and any unmet target will be reported rather than inferred from file size.

Only local checks are authorized. Milestone commits use `[skip ci]` and are pushed to this feature branch; no PR, main merge, deployment or manual CI dispatch is requested. Validation and reproducible commands will be appended as milestones complete.

## Implementation milestone

Supported v2 export: 3,015,859 bytes, down from 67,315,148 bytes. The complete normalized project is deep-equal after native export/read, including 41 Steps, five bookmarks and all Variant HEADs. No geometry precision or History retention was reduced. A separate Node timing measured 22.54 s export and 4.81 s import; these do not substitute for Chrome UI timing.

Local focused project/History checks: 56 passed. Complete Node inventory: 367 passed, zero failures/skips. ESLint passed. Changed-file formatting passed. The full repository format inventory reported 11 pre-existing warnings in unchanged baseline files; these are not silently reformatted in this feature.

Chrome baseline on the exact starting product: three visible installed Chrome 154.0.8037.98 runs, 1440 × 960 viewport, pinned Playwright 1.55.1 / Three 0.179.1. Input selection includes the normal Open confirmation. Median Open status: 148.59 s; median matching-model 3D ready: 148.83 s; median import worker: 72.90 s. Page errors: none. Optimized browser and persistence/History validation remain in progress at this milestone.

## Baseline integration

The requested baseline advanced during implementation. A normal merge retains its latest process-worker validation and lazy robust polygon boolean implementation from `e9abb1583b553159789e133f039dcf0b17d59dd9`, without rewriting the already-pushed feature commits. IO validation caches call the shared robust operations, and `validateProcessModel` uses a fresh geometry validation context with full budgets. Focused integration: 71 tests passed; complete merged inventory: 372 tests passed; lint passed. Final browser checks and a fresh comparison against this exact advanced baseline are pending at this merge milestone.

## Final validation on the updated baseline

Final product commit: `ebcc04aa2177c4abacc0335f024a2aba63f6c06e`; exact comparison baseline: `e9abb1583b553159789e133f039dcf0b17d59dd9`. Subsequent commits contain scientific regression reader fixes and this report. All feature commits were pushed with `[skip ci]`; no manual CI was dispatched.

| Measurement                     |   Baseline | Optimized |
| ------------------------------- | ---------: | --------: |
| Native project JSON bytes       | 67,315,148 | 3,015,859 |
| Chrome Open status, median      |   147.04 s |   13.26 s |
| Matching-model 3D ready, median |   147.28 s |   13.51 s |
| Import worker, median           |    70.88 s |    4.04 s |

This is a 95.52% file-size reduction and a 10.90-fold improvement in complete UI import time (90.83% less time). The ready-time runs were 148.49/145.91/147.28 s on the baseline and 14.26/13.51/13.30 s on the optimized product. All six runs restored 41 Steps and five bookmarks with no page errors. These are local measurements on this Windows machine, not a universal latency guarantee. Chrome 154.0.8037.98, Node 24.19.0, Playwright 1.55.1, Three 0.179.1 and a 1440 × 960 viewport were held constant. Raw measurements are committed in `tests/fixtures/project-io/validation-windows-chrome.json`.

The storage benchmark asserts deep equality of the entire normalized project, including all models, Steps, bookmarks and Variant HEADs. Fifteen distinct geometry entries replace repeated coordinates. The exported file remains native JSON `.wafercad` and needs no unpacking. No history was removed and the existing 0.1 nm export quantization was retained. Old v1/unencoded project files remain readable; new v2 files require this updated frontend.

Local checks: `node --test site/tests/*.test.mjs` passed all 372 tests, with zero failures/skips. ESLint passed. History, Persistence, Examples and the complete Process geometry browser regressions passed against the merged frontend. Scientific export assertions expand the v2 references before checking the original geometry and History invariants. Changed-file formatting passed. The full format inventory still reports 13 warnings in inherited, untouched baseline files; approved pixel baselines were not regenerated or run.

Reproduction commands, after `npm ci --ignore-scripts --no-audit --no-fund` and starting a local static server for each exact product:

```powershell
node scripts/project-storage-benchmark.mjs tests/fixtures/project-io/nature2026-fig3-wafer-legacy.wafercad.br test-results/project-io/reference-v2.wafercad test-results/project-io/storage-benchmark.json test-results/project-io/reference-legacy.wafercad
# Set WAFERCAD_URL, WAFERCAD_CHROMIUM and WAFERCAD_THREE_DIR to the local server, installed Chrome and locked Three package.
node scripts/project-import-benchmark.mjs test-results/project-io/reference-legacy.wafercad test-results/project-io/baseline-chrome.json 3
# Switch WAFERCAD_URL to the optimized frontend before the v2 run.
node scripts/project-import-benchmark.mjs test-results/project-io/reference-v2.wafercad test-results/project-io/optimized-chrome.json 3
node --test site/tests/*.test.mjs
node scripts/history-regression.mjs
node scripts/persistence-regression.mjs
node scripts/example-regression.mjs
node scripts/process-geometry-regression.mjs
```
