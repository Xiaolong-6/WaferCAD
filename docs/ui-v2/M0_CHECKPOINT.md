# UI v2 M0 Checkpoint — 2026-10-09

Only M0 was performed in this historical round. Pulled `main` at `fbbb2f9f3a585574e20ed706c34653164f13440c` and recorded evidence/generated inventories on `refactor/ui-v2-m0`. Do not proceed to M1 or create a v2 product shell/CSS before user approval.

## Deliverables

- [User-approved r2 execution plan](R2_PLAN.md): phases, gates and prohibited-change scope.
- [DOM contract](CONTRACT.md) / [contract.json](contract.json): static IDs, attributes, consumers, dynamically generated structure/classes/state and unresolved items.
- [Implicit dependencies](IMPLICIT_DEPS.md): 40 items covering startup order, reparenting, ancestor selectors, visibility, event propagation and test coupling.
- [PR #161 postmortem](PR161_POSTMORTEM.md): description/diff/discussion/CI, separating visual rejection from interaction and formatting failures.
- [Risks and estimate](RISKS_AND_ESTIMATE.md): assembly rewrite, DOM adapter domains and work by phase.
- [Issues and decisions](ISSUES.md): storage scope, routing and read-only coupling.
- Generation command: `node scripts/ui-contract-extract.mjs`; check: `node scripts/ui-contract-extract.mjs --check`.
- Independent browser verification: `node scripts/ui-contract-verify.mjs`, comparing actual HTML parsing to the inventory and checking Recipe initialization and duplicate IDs.

Final inventory: **259 static IDs, 205 explicitly identified dynamic class names, one computed class-pattern, 56 dynamic DOM ID declarations/calls and 843 runtime DOM creation/state/structure operations**. Static `data-*` attributes: 39; roles: 15; `aria-controls` targets: 7. No duplicate static IDs or missing static `aria-controls` targets. The source for five unresolvable creation/markup/class expressions is preserved in full; these must not be counted as covered. Forty implicit dependencies are recorded.

## Environment and commands

Windows / PowerShell, Node `v26.7.0`, npm `11.19.0`; pinned Playwright `1.55.1` / Three `0.179.1`. Browser actually tested: local Chrome **155.0.8059.40**, launched with `WAFERCAD_CHROMIUM` in an isolated test profile, not the everyday browser session. Do not describe this as a pass on Playwright's bundled Chromium 140 or infer Linux pixel determinism.

| Command | Recorded result |
| --- | --- |
| `npm ci` (retried in a network-enabled environment) | exit 0; 81 packages; audit found zero vulnerabilities; package files and lockfile unchanged. |
| `npm run lint` (initial and final) | exit 0; product code at baseline; check included new audit scripts. |
| `npm test` | exit 0; 523 passed / 0 failed / 0 skipped; approximately 261 seconds. Product source remained identical to main during the run. |
| `npm run test:ui:fast` (Chrome 155) | exit 0; Smoke, Workstation, View UX v3 and Resilience passed; original entry/expectations unchanged. |
| `node scripts/ui-contract-extract.mjs` / `--check` | exit 0; deterministic and matching inventory. Used pinned ESLint Espree and pinned Prettier, with no added dependencies. |
| `node scripts/ui-contract-verify.mjs` | exit 0; 259 static IDs matched browser elements/attributes exactly; 292 runtime IDs were unique; all 33 Recipe `initMarkup` IDs present; no page exception or native-dialog errors. |
| `npm run docs:check` | exit 0; generated guide/diagrams and internal navigation validated. |
| `npx prettier --check scripts/ui-contract-extract.mjs scripts/ui-contract-verify.mjs "docs/ui-v2/*.md"` | New audit files passed formatting. |
| `npm run format:check` | exit 1; 18 preexisting files had formatting warnings; those files were not reformatted here. |

Browser reproduction settings (first start a read-only local static server):

```powershell
$env:WAFERCAD_URL = 'http://127.0.0.1:4174'
$env:WAFERCAD_CHROMIUM = 'C:\Users\liux16\AppData\Local\Google\Chrome\Application\chrome.exe'
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
npm run test:ui:fast
node scripts/ui-contract-verify.mjs
```

This round served `site/` on 4174 using a read-only Node HTTP server and stopped it afterward. The default WindowsApps Python alias did not work; the bundled Python server on 4173 did not respond and was stopped. On systems with working Python, a future reproduction may use `python -m http.server 4174 --bind 127.0.0.1 --directory site` without product changes.

The initial working tree was clean; the previous branch `feat/process-recipe-v1` at `9e13a16` was preserved. Default git fetch failed because an obsolete refspec targeted the deleted `feat/mask-file-draw` branch. An explicit main refspec succeeded, followed by `git switch -c main --track origin/main` and `git pull --ff-only origin main`. The origin fetch configuration was not changed.

The initial sandbox `npm ci` failed due to registry DNS and left an EPERM cleanup warning; retry in an authorized network environment succeeded. The first `test:ui:fast` could not launch due to a missing Chromium headless executable. `npx playwright install chromium` downloaded bundled 140.0.7339.186/build 1193 but stalled for a long time during extraction; installation was stopped, partial cache retained, and no files removed. Subsequent use of installed Chrome 155 passed the full fast baseline. Bundled Chromium 140 remained unverified; successful testing with an alternate browser does not erase that limit.

Preexisting repository-wide `format:check` warnings affected:
`site/controllers/mask-import-controller.js`, `section-controls-controller.js`, `tool-tabs-controller.js`, `view-maximize-controller.js` (last three also under controllers);
`site/gds.js`, `layout-io.js`, `oasis.js`, `roi-editor.js`, `sample-layouts.js`, `startup-file.js`, `view-interactions.js`;
`site/tests/gds-errors.test.mjs`, `oasis.test.mjs`, `roi-editor.test.mjs`, `view-interactions.test.mjs` (last three under tests);
`scripts/klayout-compat.mjs`, `docs/COMPETITIVE_LANDSCAPE.md`, and `.prettierrc.json`.
Some were explicitly read-only; this checkpoint recorded them without making opportunistic changes. The existing `docs/README.md` table was not reformatted wholesale.

## PR #161 conclusion and remaining work

The layout rejection was substantive: an empty History inspector wasted desktop space, the 1024 px overlay covered the canvas, a 390 px flyout occupied the mobile screen, and Recipe/History information architecture was incomplete. The dedicated acceptance script began with an empty project and missed 768 px and real complex projects. CI additionally demonstrated a 1.7857 px vertical Main/3D ROI offset and formatting failures in five files. See [complete postmortem](PR161_POSTMORTEM.md).

This round did not independently inspect the PR screenshot artifact or reproduce the base/head ROI comparison, so the code root cause of the offset was **not established**. Visual baselines were not run, created or replaced. M1.5/M4 retained per-screen human acceptance. The 17–30 workday estimate excluded time awaiting prototype iterations or user approval.

Identify this checkpoint's commit with `git log -1 -- docs/ui-v2/M0_CHECKPOINT.md`; the audited product baseline is the main SHA above. This checkpoint only added audit scripts/docs and updated the document index. `site/`, existing tests, dependencies, workflows, read-only core files and approved visual baselines had no product diff. The work was committed **locally only**: no push, PR, manual CI, deployment or entry switch occurred at that point.

## Checkpoint decision

M1 light tokens and Gallery require user confirmation of M0. Retain existing sessionStorage keys and semantics based on actual source; [I01](ISSUES.md) records the original plan's inaccurate localStorage wording. Layout and Recipe placement were deferred to per-screen M1.5 prototype review rather than being selected by the agent.
