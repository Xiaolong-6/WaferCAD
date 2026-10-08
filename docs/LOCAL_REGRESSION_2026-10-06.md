# Local regression and autosave fix — 2026-10-06

> **Revision-specific evidence.** This record describes its original date, branch and validation scope. It does not establish current main status. Use the [documentation map](README.md) and [archive index](archive/README.md) for current contracts and later evidence.

Product checkout: `306eb7e5a018cfd236aa494a3888d48023f3b8f5` on `feat/m3d-process-kernel-ops-v2`, followed by the local changes described below. The checkout was clean before testing. The verified local fixes were subsequently committed and pushed to this feature branch before merge review; no deployment was performed.

## Findings and fix

The complete initial local inventory passed ESLint, all 347 Node tests, and nine of ten non-baseline browser suites. Prettier reported 17 files. Persistence failed twice at its camera-drag assertion (`scripts/persistence-regression.mjs`, original line 255), timing out after 8 seconds.

A diagnostic browser run confirmed that the pointer reached the Three.js canvas and the camera interaction completed. However, the full autosave count rose from 2 to 3 while the view count stayed at 1. The preceding project-name edit had already been saved through `input`; clicking the canvas blurred the field and its unconditional `change` handler scheduled another structural save. This duplicate save prevented the test from observing a view-only camera save.

`site/controllers/project-controller.js` now schedules another structural save on blur only when name normalization changes the current name. Actual input edits still schedule structural saves. The original camera regression remains unchanged; an additional browser assertion proves that trimming a project name is saved and survives reload.

The 17 reported files were formatted with pinned Prettier. Comparing HEAD and working files after canonical formatting confirmed that changes outside the project controller and persistence regression are formatting-only.

## Environment

- Windows, UNC network workspace; Node `24.19.0`, Python `3.12.14`.
- Locked dependencies installed with workspace-local npm `10.9.4`: `npm ci --ignore-scripts --no-audit --no-fund`.
- Playwright `1.55.1`; Chromium `140.0.7339.186`, build `1193`; Three `0.179.1`.
- Python served `site/` at `http://127.0.0.1:4173`; browser tests intercepted Three CDN URLs with the local locked package.
- npm and Chromium were installed under ignored `test-results/` because the initial host lacked npm and the Playwright browser. Node invoked the package scripts directly to avoid cmd.exe's UNC working-directory limitation.

## Executed checks

| Check / direct command                                                                                                                                                                                          | Initial result                              | After fix                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| `node node_modules/eslint/bin/eslint.js "site/**/*.{js,mjs}" "scripts/**/*.mjs"`                                                                                                                                | Pass, exit 0                                | Pass, exit 0                                       |
| `node node_modules/prettier/bin/prettier.cjs --check "site/**/*.{js,mjs,css,html}" "scripts/**/*.mjs" "docs/**/*.md" "README.md" "THIRD_PARTY_NOTICES.md" "eslint.config.js" "package.json" ".prettierrc.json"` | Fail, 17 files                              | Pass, exit 0                                       |
| `node --test "site/tests/*.test.mjs"`                                                                                                                                                                           | 347 passed; 0 failed, skipped, or cancelled | 347 passed; 0 failed, skipped, or cancelled        |
| `node scripts/ui-smoke.mjs`                                                                                                                                                                                     | Pass                                        | Pass                                               |
| `node scripts/workstation-regression.mjs`                                                                                                                                                                       | Pass                                        | Not repeated; unaffected behavior                  |
| `node scripts/resilience-regression.mjs`                                                                                                                                                                        | Pass                                        | Not repeated; unaffected behavior                  |
| `node scripts/history-regression.mjs`                                                                                                                                                                           | Pass                                        | Pass                                               |
| `node scripts/persistence-regression.mjs`                                                                                                                                                                       | Fail twice at camera view autosave          | Pass, including normalization/reload assertion     |
| `node scripts/process-geometry-regression.mjs`                                                                                                                                                                  | Pass                                        | Not repeated; geometry changes are formatting-only |
| `node scripts/interaction-regression.mjs`                                                                                                                                                                       | Pass                                        | Not repeated; unaffected behavior                  |
| `node scripts/example-regression.mjs`                                                                                                                                                                           | Pass                                        | Not repeated; unaffected behavior                  |
| `node scripts/product-layout-regression.mjs`                                                                                                                                                                    | Pass, 109 captures                          | Not repeated; unaffected behavior                  |
| `node scripts/renderer-product-regression.mjs`                                                                                                                                                                  | Pass, 18 captures                           | Not repeated; renderer changes are formatting-only |

The direct quality commands expand `npm run check`. All ten suites comprising `npm run test:ui:all` were executed initially, with independent suites continuing after the persistence failure. After the narrow fix, the full quality gate and the affected Persistence, Smoke, and History suites were executed again. This is not a second full browser-inventory run.

## Reproduction and artifacts

With the local server running and normal npm tooling available:

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npx playwright install chromium
$env:WAFERCAD_THREE_DIR = (Resolve-Path 'node_modules/three').ProviderPath
npm run check
npm run test:ui:all
```

For this host, ignored `test-results/run-browser-regressions.ps1` sets the explicit UNC paths and runs the nine suites after Smoke, saving logs and durations to `test-results/local-regression-results.json`. npm remains available through `node test-results/tooling/package/bin/npm-cli.js`.

- Initial logs: `test-results/node-tests.log`, `lint.log`, `format-check.log`, `ui-smoke.log`, and one log per browser suite.
- Reproduction of failure: `test-results/persistence-regression-rerun.log`; diagnostic pointer/count log and screenshot: `persistence-camera-diagnostic.log`, `persistence-camera-failure.png`.
- Final logs: `test-results/lint-fixed.log`, `format-check-fixed.log`, `node-tests-fixed.log`, `ui-smoke-fixed.log`, `history-regression-fixed.log`, and `persistence-regression-fixed.log`.
- Formatting equivalence evidence: `test-results/formatting-only-verification.log`.
- Layout review: `test-results/product-review/index.html` and `report.json` (109 captures).
- Renderer review: `test-results/product-review/renderer/index.html` and `report.json` (18 captures).

These ignored artifacts are local supporting evidence; the tracked tests and this report describe reproduction without transferring a browser profile.

## Limits

The opt-in pixel-baseline suite was not run and no approved reference was replaced. The existing Photodetector Windows reference mismatch remains documented in `docs/STABILIZATION_2026-10-05.md` pending human acceptance. No Linux run, KLayout compatibility sweep, or remote CI run was performed.
