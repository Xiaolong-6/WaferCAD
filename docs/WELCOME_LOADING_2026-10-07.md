# Welcome and native Fig3 loading - 2026-10-07

> **Revision-specific evidence.** This record describes its original date, branch and validation scope. It does not establish current main status. Use the [documentation map](README.md) and [archive index](archive/README.md) for current contracts and later evidence.

Branch: `codex/project-io-geometry-sharing`; baseline product commit `41ff251`. Performance implementation: `51485e5`. Feature pushes use `[skip ci]`; no CI, main merge or deployment is requested.

## Preserved complete examples and smaller previews

The five full files under `site/examples/` remain byte-for-byte unchanged. Their existing catalog paths remain the complete backups and are used by Open example and downloads. Only embedded read-only Welcome cards load the new `site/examples/previews/` assets. Preview files retain the current final model, complete mask layout, annotation volumes, camera, ROI, Section Detail and all display metadata exactly. They contain one final Step, one Variant and no earlier Steps/bookmarks. Scientific polygons are neither simplified nor resampled.

| Example                | Complete bytes | Preview bytes | Complete Steps | Preview Steps |
| ---------------------- | -------------: | ------------: | -------------: | ------------: |
| Photodetectors         |         366336 |         65420 |             32 |             1 |
| PERC                   |         845137 |        408546 |             33 |             1 |
| Tandem                 |         263828 |         58856 |             24 |             1 |
| Microdisk              |          99921 |         57626 |              9 |             1 |
| Native three-tier Fig3 |        1816020 |        491334 |             40 |             1 |

Total preview payload falls from 3391242 to 1081782 bytes, a 68.1% reduction. PERC and native Fig3 retain comparatively large final layouts/geometries; their retained physical structure accounts for the remaining size.

`node scripts/build-example-previews.mjs --write` deterministically rebuilds the final-only files. Without `--write`, it verifies existing bytes, strict native round-trip validation, exact final-model/layout equality and unchanged original source bytes. The report records original SHA-256 values.

## Shared annotation derivation

Main, Section, Detail and 3D previously repeatedly intersected all annotation patches against every material partition, including partitions with no matching host layer or Z overlap. The native three-tier model has 67 electrical patches. Host eligibility and XY bounding boxes now exclude impossible overlaps before booleans; unclipped surviving fragments are shared privately across views for one model revision. ROI clipping remains per request, returned full-view polygons are cloned and revisions/annotation edits invalidate the derived data.

A direct native-example comparison produced exactly equal surface groups, Section bands, full solids and ROI-clipped solids before/after, with derivation time falling from 31532.7 to 2575.0 ms. This isolated Node observation establishes equality and identifies the hot path; browser measurements below are the user-visible measurements. Strict worker and History validation remain enabled. No changes are made to stored models or History.

## Browser measurements and acceptance

Measurements use installed Windows Chrome 154.0.8037.98, Node 24.19.0, Playwright 1.55.1 and pinned Three 0.179.1. Each run uses a new browser context, local static server and local pinned Three route. Baseline geometry is served from the exact `41ff251` module using a test-only route; Welcome baseline uses the original full files. No product profiler/debug hook is introduced.

Three cold-context Welcome runs before/after produced medians of **68.727 seconds -> 9.971 seconds** to load all five Main cards while scrolling through them (85.5% lower, 6.9 times faster). The Welcome shell itself remains below 0.4 seconds in these runs. This is local desktop acceptance, not a network/mobile SLA. Each preview worker returns one Step and zero bookmarks; exactly five preview assets are fetched, with no full-project requests.

A separate installed-Chrome headless acceptance run uses `--check-views --headless` to exercise Main, Mask, 3D and Section on all five cards. Native Fig3 and tandem card screenshots are retained under `test-results/product-review/fast-*.png`. Headful tab inspection stalled while waiting for frame rendering and was interrupted; it is not counted as a passing four-view run. Headful cold Main timing is unaffected by that inspection limitation. No visual baseline is replaced.

The identical complete native Fig3 file (1,816,020 bytes, 40 Steps and five bookmarks) was imported in three cold contexts per condition:

| Native complete import                    | Before median | After median |
| ----------------------------------------- | ------------: | -----------: |
| Opened status (model + History committed) |      58.249 s |     18.701 s |
| Correct model revision ready in 3D        |      70.517 s |     30.986 s |
| Worker parse/strict validation            |       6.649 s |      6.599 s |

3D-ready time falls 56.1%; Opened time falls 67.9%. Worker time is essentially unchanged, consistent with optimizing repeated view derivation rather than skipping validation. Every measured import preserves all 40 Steps and five bookmarks, with no page errors. The complete example keeps all native gate/ILD/CMP geometry and original models. Large History cloning, validation and initial 3D/persistence still incur a cost; this does not claim instantaneous loading.

Raw run summaries are committed in `tests/fixtures/project-io/welcome-loading-windows-chrome.json`, and full-file hashes and final-preview sizes in `final-example-previews.json`. Local CPU profiles, annotation output comparisons, timing logs and screenshots are under `test-results/native-fig3/` and `test-results/product-review/`.

Validation completed at product commit `51485e5`:

- `node --test site/tests/*.test.mjs`: 378/378 pass.
- Full `eslint "site/**/*.{js,mjs}" "scripts/**/*.mjs"`: pass; changed-file Prettier: pass.
- `node scripts/build-example-previews.mjs`: deterministic files, strict round-trip, exact final-model/layout equality and unchanged original full-file bytes pass.
- Installed Chrome 154, `welcome-preview-benchmark.mjs --check-views --headless`: all five cards and all four view tabs pass; only one final Step/zero bookmarks per preview; no full asset fetched and no page errors.
- Pinned Chromium 140 + Three 0.179.1, `node scripts/example-regression.mjs`: pass, including full native Fig3 export and its 40-Step physical contract.
- Same pinned browser, `node scripts/renderer-product-regression.mjs`: pass, 19 captures covering annotations, etch cuts, ROI and rough/Pyramid morphology.
- Same pinned browser, `node scripts/process-geometry-regression.mjs`: pass.

Feature implementation is pushed to `codex/project-io-geometry-sharing`; no CI or deployment was run. Local port 4173 serves this checkout. No approved visual baseline was modified. Complete originals remain available at their existing catalog paths.

Reproduction:

```powershell
$env:WAFERCAD_CHROMIUM = 'C:\Users\liux16\AppData\Local\Google\Chrome\Application\chrome.exe'
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
node scripts/build-example-previews.mjs
node scripts/welcome-preview-benchmark.mjs test-results/welcome-preview.json 3
node scripts/welcome-preview-benchmark.mjs test-results/welcome-views.json 1 --check-views --headless
node scripts/project-import-benchmark.mjs site/examples/three-tier-silicon-jlfets.wafercad test-results/native-import.json 3
npm test
npm run lint
npm run test:ui:examples
npm run test:ui:product:renderer
npm run test:ui:process
```

For a full-file comparison, `--full-originals` makes the Welcome benchmark route a catalog without `previewProject`. `WAFERCAD_BASELINE_VIEW` optionally routes a saved historical `model-view-geometry.js` in either benchmark. Welcome timing stops when all five Main cards are ready; `--check-views` then additionally exercises all four view tabs without including those clicks in the loading measurement. Per-card wait times are sequential waits, not independent cold-load times.
