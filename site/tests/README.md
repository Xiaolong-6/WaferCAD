# Test structure and discovery

- `site/tests/*.test.mjs` — stable Node test discovery for `npm test`; most existing scientific, IO, Renderer and UI component tests are still flat.
- `site/tests/documentation/` — Documentation, Wiki and Process Guide tests; discovered by `site/tests/documentation-suite.test.mjs`.
- `site/tests/history/` — grouped native History scientific and transaction tests; discovered by `site/tests/history-suite.test.mjs`.
- `scripts/*-regression.mjs`, `scripts/v2/` — executable browser test owners and scientific acceptance entrypoints; not Node test discovery directories.
- `tests/fixtures/` — immutable/scientifically attributable input datasets and expected values.
- `tests/visual-baselines/` — approved platform-specific pixel references, not transient screenshots.

**Migration contract:** Do not move a test because its filename looks related. Confirm all relative module imports, direct CI paths, package scripts, browser-owner test inventories and documentation references; preserve test count and scientific invariants. Never conceal a failed or undiscovered test by modifying `npm test` to skip it. New nested owners must be reached automatically from the original root glob, and explicit workflows must be updated to their new paths. Execute the focused test group and complete Node Quality for that exact HEAD; retain specialized science and Recovery gates where relevant.
