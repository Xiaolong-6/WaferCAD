# Pre-main audit - 2026-10-07

## Result and scope

No unresolved merge-blocking defect was found after the repairs below. The branch is ready for main integration preparation based on local Windows evidence. This audit did not update main, deploy Pages, open a PR or run CI.

Repository: Xiaolong-6/WaferCAD. Reviewed `codex/project-io-geometry-sharing` at `4fb5c183fa63bd6e7dc95482ad3d056a1a144c6f` against freshly fetched `origin/main` at `467f1a87ea88b35821d44c4b5277f16b6dccf1d5`. Main is the merge base: no upstream divergence; 92 branch commits and 126 changed files were included, covering inherited Z-collapse, History copy-on-write, triangulation, transactional validation and CI policy as well as project IO, native Conformal, Welcome loading and Fast rendering. No geometry or approved visual baseline was rewritten for this audit.

Repairs are in `1e4c4a9`; inherited formatting and acceptance-text repair are in `7440175`. The tested product modules match `7440175`; the remaining snapshot-test formatting and this report/evidence are packaged by the audit handoff commit. All commits stay on the feature branch with `[skip ci]`.

## Findings and repairs

- **P2 - Shared assets bypassed combined workspace budgets.** `validateProjectCore` skipped the entire model/layout visit after seeing the same object in another workspace. A valid small first workspace followed by the same model and 2,999,995 layout points passed batch validation even though independent strict validation rejected the second workspace. Model and layout identity caches now retain validated polygon/ring/point costs and charge them against each workspace's combined budget. Boolean and numeric validation remain reused. The regression first failed with the missing rejection, then passed after repair; a second regression covers a reused large layout paired with a different model. Fresh validation calls do not retain receipts/caches.
- **P2 - New modules lacked narrow browser owners.** Independent changes to `polygon-triangulation.js`, `workspace-storage-worker.js`, `workspace-dirty-domains.js`, `controllers/project-state-controller.js` or `welcome.js` could select only smoke. They now select renderer, persistence or workstation coverage respectively. This branch's aggregate diff already selected the broad inventory; the defect affected future isolated changes. Three planner regressions cover all five paths. Planner evaluation and tests were local; no workflow was dispatched.
- **Cleanup - Full format gate and damaged documentation.** All 13 inherited formatting warnings occurred in files included in the main integration diff. They were normalized without changing scientific assertions. Eight replacement characters in the dated UI acceptance document were repaired to readable units/separators. The final full formatting gate passes.

Strict import receipts, one-call geometry memoization, v1/v2 expansion, worker success/rejection handling, candidate isolation, lease guards, History/Variant clones, native shared-wall ownership, cap triangulation, Fast mesh policies, ROI/Z transforms and Welcome's full-file/preview routing were inspected. No additional unresolved data-safety or geometry blocker was established.

## Current local evidence

Windows, bundled Node 24.19.0, Playwright 1.55.1, installed Chrome 154.0.8037.98, pinned local Three 0.179.1. Servers 4173 and 4174 both served this feature checkout. Browser scenarios used isolated contexts, including real worker computation, import/export, refresh, pointer actions and IndexedDB.

| Check                                                        | Result                                                                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full Node inventory after repairs/formatting                 | 389 passed, zero failures/skips                                                                                                                                                       |
| Focused schema/import/planner inventory                      | 72 passed                                                                                                                                                                             |
| Complete active-JS ESLint                                    | Pass                                                                                                                                                                                  |
| Complete repository Prettier gate and diff whitespace        | Pass                                                                                                                                                                                  |
| Six existing full examples vs exact main baseline            | Physical models, Mask layouts, all bookmark/Step/Variant geometry and lineage equal                                                                                                   |
| Five final-only previews                                     | Deterministic rebuild; exact final model/layout; full originals preserved                                                                                                             |
| Process rejection through historical Apply/Create Variant UI | Correct error, prior model/History/bookmarks unchanged, no empty Variant; next valid Apply succeeds                                                                                   |
| Storage worker                                               | Captured candidate/saved/Recovery digests equal; rejection preserves old data; lost lease does not commit; retry succeeds; 442 frames while packing                                   |
| Native checkpoint to T3                                      | Continuous 22-to-40-Step UI run, no checkpoint resume; three native Conformal gates/two native liners; original prefix preserved; final export/reopen model and History exactly equal |
| Tandem ratios                                                | 1:1, 2:1, 1:2, relock 1:1; physical model unchanged; relocked Section raster and 3D PNG identical                                                                                     |
| Tandem visual review                                         | Actual Section, front/back 3D and ratio captures inspected; different seeds/material stacks retained                                                                                  |
| Welcome thumbnail and on-demand loading                      | Pass; three fresh contexts; first image median 0.280 s, all thumbnails 0.559 s; no initial project/frame fetch; interactions/error/retry covered                                      |
| Fast/Quality current-mode UI                                 | Inspection-only renderer script passes labels/tooltips and Quality after refresh, opaque/transparent ROI, geometry/export/2D invariants                                               |

The full generic `npm run test:ui:all` was not repeated in this audit. Earlier History/Persistence/Process/Examples/product acceptance is documented in the subsystem handoffs; current runs above cover the highest-risk integration paths and all audit repairs. Approved platform pixel baselines were not regenerated or run. This is Windows runtime evidence, not Linux browser acceptance or a universal FPS/latency guarantee. The Welcome timing is thumbnail readiness, not completion of an interactive project load. Older releases cannot read new `shared-assets-v2` exports; existing unencoded/v1 files remain readable by this product.

## Reproduction and handoff

From this checkout with locked development dependencies, run the package's full Node, ESLint and Prettier commands. The audit invoked their components directly with the bundled Node executable rather than relying on a shell-installed Node. Browser setup: `WAFERCAD_CHROMIUM` points to installed Chrome; `WAFERCAD_THREE_DIR` points to `node_modules/three`. The native/tandem/transaction scripts default to 4174; other checks default to 4173, or set `WAFERCAD_URL` explicitly.

```text
node --test site/tests/*.test.mjs
node node_modules/eslint/bin/eslint.js "site/**/*.{js,mjs}" "scripts/**/*.mjs"
node node_modules/prettier/bin/prettier.cjs --check "site/**/*.{js,mjs,css,html}" "scripts/**/*.mjs" "docs/**/*.md" README.md THIRD_PARTY_NOTICES.md eslint.config.js package.json .prettierrc.json
node scripts/pre-main-example-audit.mjs 467f1a87ea88b35821d44c4b5277f16b6dccf1d5
node scripts/build-example-previews.mjs
node scripts/three-fast-mode-regression.mjs --inspection-only
node scripts/process-transaction-ui-regression.mjs
node scripts/workspace-storage-worker-regression.mjs
node scripts/fig3-native-process-regression.mjs
node scripts/tandem-visual-acceptance.mjs
node scripts/welcome-thumbnail-regression.mjs
```

Committed scalar evidence: `tests/fixtures/project-io/pre-main-audit-windows-chrome.json`. Local logs: `test-results/pre-main-*.log`. Native captures/exports: `test-results/native-fig3/complete-ui/`; tandem captures: `test-results/ui-acceptance/tandem/`. Local images/exports support the audit but are not a replacement for the committed fixtures and reproducible scripts.

## Authorized full CI follow-up

The user subsequently authorized full pre-main CI and a main fast-forward only after it succeeds. The first Linux run on `1872c61`, [37588608665](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37588608665), passed all 389 Node tests/lint and smoke, workstation, resilience, History, persistence, extended Process Geometry, interaction and example browser suites. It then failed the phone layout assertion that increasing the top collapse bound moves the break upward. Renderer review had not run when the sequential inventory stopped. Main was not pushed after that failure.

The helper read its baseline break pixels immediately after hiding/showing the phone Section dock, before the asynchronous canvas-size/redraw barrier. It now awaits the existing `waitForCanvasSizeSync` before baseline measurement and after the final adjustment; baseline bounds/break/dimensions are read atomically, with dimensions included in any failure. The original upward-movement, equal front/back scales, physical geometry and all other assertions remain unchanged. No product geometry or display math was changed to make the test pass.

The original failing Linux result was not reproduced by three local phone-path runs on pinned Chromium 140.0.7339.186. After the synchronization repair, the complete Windows pinned-Chromium responsive layout suite passed all 109 captures (wide/medium/phone, A/B, units, ROI, imports and six process views); focused ESLint and Prettier passed. These local results do not substitute for the required new full Linux CI run. The Actions run associated with the follow-up commit records that gate's result.
