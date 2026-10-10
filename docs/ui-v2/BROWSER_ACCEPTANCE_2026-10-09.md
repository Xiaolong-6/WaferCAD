# UI v2 browser acceptance — 2026-10-09

> Superseded overall disposition: **automated M2.5 shell PASS; actual UI acceptance FAIL / open**. See the [2026-10-10 UI review](UI_ACCEPTANCE_2026-10-10.md) at `5ec5082`. The checks at `af64d67` below remain historical evidence for their named contracts; they do not establish visual or complete UI acceptance, production parity or M4 approval.

## Current M2.5 audit at af64d67

User narrowed the request to whether M2.5 passes; further feature implementation stopped. Tested product commit: `af64d67` on `codex/ui-v2-m2-handoff-2026-10-09`. Windows NT `10.0.26300.0`, Node `v24.16.0`, native Chrome `155.0.8059.40` via CDP. Locked dependencies were installed with `npm ci` earlier in this session (exit 0); no dependency changes followed.

| Command                                                                                                                                                                                                    | Result                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `node scripts/v2/check-m2-shell.mjs` with `$env:WAFERCAD_REVIEW_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe'`                                                                            | Exit 0; 43 named checks passed; page/console errors `[]`.                                                                                 |
| `node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs`                                                                                                                        | Exit 0; 8 passed, 0 failed.                                                                                                               |
| `npm run lint`                                                                                                                                                                                             | Exit 0 on the final product source.                                                                                                       |
| `npx prettier --check site/ui-v2/workstation-v2.js site/ui-v2/workstation-v2.css site/ui-v2/mock-workspace.js site/ui-v2/mock-domain-panels.js site/ui-v2/section-legend.js scripts/v2/check-m2-shell.mjs` | Exit 0; all changed product/test files formatted. This is the focused gate, not a claim that repository-wide format/test checks were run. |
| `git diff --check`                                                                                                                                                                                         | Exit 0.                                                                                                                                   |

The M2.5 criteria pass: registry-defined primary navigation and named slots; shared view chrome; stable four science hosts and five domain hosts; generic adapter lifecycle; production entry excludes mocks; shell excludes domain state; two original sessionStorage keys; responsive 1440/1024/768/390 behavior; shared Dialog/More/Toast lifecycle; direct `file://` boot. Main/3D mock ROI top and bottom deltas are 0 px at 1440 and 1024. A new real mouse-wheel probe reaches the bottom of Manual, Recipe and History at 1440×650; History selection retains scrolling. The History header contains context only, with no duplicated Restore/Edit/Create Variant buttons.

The runner also verifies local Base/Recipe/History draft repairs. These do not enlarge the M2.5 acceptance boundary: real model transactions, History replay/rollback, project IO/recovery/lease, scientific renderers/exports, full legacy parity, and approved platform visual baselines are **not accepted by this result**. The [258-item comparison audit](FULL_PARITY_AUDIT_2026-10-09.md) records those separate gaps; they do not automatically fail the agreed shell-only gate.

Reproducible local evidence: `test-results/ui-v2-acceptance/parity-repairs-official.txt` (ignored; commands and outcome are committed here). In-app browser visual inspection confirmed the independent History scrollbar, branch ⋯ menu and direct Legend color swatch. No approved baseline was replaced. No merge, deployment or manual CI run occurred.

## Final official acceptance at 210a58d

Tested product commit: `210a58d0022f844bef1793fbf26b763effb85e83`, on `codex/ui-v2-m2-handoff-2026-10-09`. Clean checkout fast-forwarded to `11bbac64eca842dee04ae4c2e809968e57727aee`, which applies the official runner repairs. Only the two requested files were then formatted and committed. No product behavior or visual baseline was changed in this final validation round.

Environment: Windows NT `10.0.26300.0`, Node `v24.16.0`, native headless Chrome `155.0.8059.40` via CDP. Installed locked dependencies include Playwright `1.55.1` and Three `0.179.1`; this shell acceptance runner uses neither for scientific execution. Native preview runs at `http://127.0.0.1:4182` with `node scripts/v2/serve-v2.mjs`.

| Command                                                                                                                           | Final result                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `npm ci`                                                                                                                          | Exit 0; 81 packages, 0 vulnerabilities.                          |
| `npx prettier --write site/ui-v2/workstation-v2.js scripts/v2/check-m2-shell.mjs`                                                 | Exit 0; both files formatted.                                    |
| `npx prettier --check site/ui-v2/workstation-v2.js scripts/v2/check-m2-shell.mjs`                                                 | Exit 0; both files pass.                                         |
| `node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs`                                               | Exit 0; 8 passed, 0 failed.                                      |
| `npm run lint`                                                                                                                    | Exit 0.                                                          |
| `git diff --check`                                                                                                                | Exit 0.                                                          |
| `node scripts/v2/check-m2-shell.mjs` with `$env:WAFERCAD_REVIEW_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'` | Exit 0; **36 checks passed**, zero captured page/console errors. |

The official runner covers the same shell/navigation/lifecycle/interaction and responsive contracts listed in the re-acceptance section below, including both entries at four widths and direct `file://` startup. Mock Main/3D ROI top and bottom deltas are both **0 px** at 1440 and 1024. Local official output is retained at ignored `test-results/ui-v2-acceptance/official-final-output.txt`; the committed summary and checked-in runner provide shared reproducibility.

The user's specified M2.5 formal gate is now complete. This result covers the isolated shell: M3 production domain/renderer wiring, real scientific rendering/geometry, full legacy application regression and M4 visual-baseline approval remain outside this acceptance. The final round did not create or replace screenshots/baselines, merge, deploy or dispatch manual CI. Formatting and this handoff are published to the same previously authorized branch; the preview remains on port 4182.

## Re-acceptance at abde1d8

Tested product commit: `abde1d84e578bba730a48c40efbfa07d918ec140`. Clean checkout fast-forwarded from `d0eec02`; upstream added the native DOM spread fix and the eight mock/production navigation checks. Environment remains Windows NT `10.0.26300.0`, Node `v24.16.0`, Chrome `155.0.8059.40`, locked Playwright `1.55.1` and Three `0.179.1` (unused by this CDP shell suite).

- `npm ci`: exit 0, 81 packages, 0 vulnerabilities.
- `node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs`: exit 0, 8/8 passed.
- `npm run lint`: exit 0.
- `git diff --check`: exit 0.
- `node scripts/v2/check-m2-shell.mjs` with the native Chrome override: exit 1 at line 211, `SyntaxError: Invalid or unexpected token`. Its evaluated stage selector is missing closing quote/bracket syntax. The eight new navigation checks pass before this failure.
- `npx prettier --check site/ui-v2/workstation-v2.js scripts/v2/check-m2-shell.mjs`: exit 1, both files require formatting.
- `node test-results/ui-v2-acceptance/reacceptance-diagnostic.mjs`: exit 0, **36/36 checks**, zero captured page/console errors. The diagnostic copy changes tests only; product code and the checked-in runner remain unchanged.
- Supplemental two-entry/four-width capture: exit 0. Eight screenshots refreshed; wide mock screenshot visually reviewed and all four navigation buttons are now present. No approved baselines changed.

The diagnostic copy fixes the malformed selector, selects pointer targets with nonempty client rectangles, checks Hide/empty Inspector using `.hidden` rather than expecting stable hosts to be removed, and scopes Restore to `.p-viewbar` rather than the retained hidden empty-strip button. It also prints each completed check. Exact test-only changes are preserved in [the diagnostic patch](REACCEPTANCE_DIAGNOSTIC_2026-10-09.patch). This patch is review material, not applied source code.

Coverage that passed includes both-entry navigation at 1440/1024/768/390, stable view/domain mounts through navigation, unit drafts, Legend palette, Mask maximization, Manual fields, Hide/Restore, Dialog focus/Escape and Toast lifecycle, Recipe edits/failure/completion, Code, History scroll/tree/Variants, More menus, Split swapping, mode reload, responsive editor/Legend flow, frozen fixtures, and direct `file://` startup. Mock Main/3D ROI top/bottom deltas remain **0 px** at 1440 and 1024. This does not establish real-renderer ROI alignment or scientific execution.

Acceptance disposition: the original product navigation blocker is resolved and the diagnostic shell run passes. **The repository's official acceptance command remains failing** until its malformed expression and stale DOM assumptions are corrected and the unchanged command is rerun. Formatting also remains outstanding. No M3 wiring, scientific tests, M4 baseline acceptance, merge, deployment or manual CI is implied.

Local evidence: `test-results/ui-v2-acceptance/reacceptance-diagnostic-output.txt`, diagnostic runner, updated `report.json` and entry/width PNGs. To repeat the diagnostic against this exact revision, copy the checked-in runner to the ignored diagnostic path and reproduce the changes in the linked patch, then run it with the Chrome override in the reproduction section below. Retain the official failing result separately.

## Initial acceptance at 084bc50 (historical)

Result: **FAIL / blocked by primary navigation**. This review does not modify product code or approve M3 integration.

## Revision and environment

- Repository: `Xiaolong-6/WaferCAD`.
- Branch: `codex/ui-v2-m2-handoff-2026-10-09`, tracking the same origin branch.
- Tested product commit: `084bc50b2c76d297e6918b6d2a22f74bf572bd35`.
- Initial checkout was clean at `fb7c402a72187955f4f5ebcd1ba7caa0ba701198`; fetched origin and switched to the requested branch without merging other branches.
- Windows NT `10.0.26300.0`; Node `v24.16.0`; native headless Chrome `155.0.8059.40` via CDP.
- Locked dependencies: Playwright `1.55.1`, Three `0.179.1`. Neither participates in this isolated shell browser probe; no real scientific renderer or process execution was tested.

## Blocking finding

`site/ui-v2/workstation-v2.js:106` calls native `navHost.replaceChildren` with an unspread array from `registry.primaryNav.map(...)`. Native DOM insertion converts that array to text instead of inserting its buttons. The navigation contains `[object HTMLButtonElement]` four times and only the Hide button. Project, Mask, Process and History primary navigation buttons are absent.

Reproduced on both `app-v2.html` (mock) and `ui-v2/app.html` (production-safe placeholder), at widths 1440, 1024, 768 and 390, height 1000. Screenshot review confirms the visible text defect. The existing browser suite stops at `scripts/v2/check-m2-shell.mjs:177`, attempting to click `[data-action="domain:project"]`, with `Error: Missing button`.

Suggested correction for a separately authorized implementation: spread the mapped button array into native `replaceChildren`, and add runtime coverage that the registry's primary navigation entries exist as clickable buttons in both entries. Re-run the complete shell suite afterwards; subsequent checks are currently unverified.

## Executed checks

| Command                                                                                                                                                                                                           | Result                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                                                                                                                                                          | Exit 0; 81 packages installed, 0 vulnerabilities. Sandbox attempt failed with registry DNS `ENOTFOUND`; native environment retry passed. |
| `node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs`                                                                                                                               | Exit 0; 8 passed, 0 failed.                                                                                                              |
| `npm run lint`                                                                                                                                                                                                    | Exit 0.                                                                                                                                  |
| `git diff --check`                                                                                                                                                                                                | Exit 0 before adding this report.                                                                                                        |
| `node scripts/v2/check-m2-shell.mjs` with Chrome override below                                                                                                                                                   | Exit 1; missing primary Project navigation button.                                                                                       |
| `npx prettier --check site/ui-v2/workstation-v2.js site/ui-v2/production-workspace.js site/ui-v2/domain-adapters.js site/ui-v2/view-panel.js site/ui-v2/shell-registry.js scripts/v2/m25-shell-contract.test.mjs` | Exit 1; all six files have formatting differences. No formatting rewrite performed.                                                      |

A supplemental diagnostic copy of the CDP runner visited both entries at the four widths and captured eight review screenshots. Exit 0 means the observations were captured, not that acceptance passed. It found 37 named slots and four stage hosts per entry, no document-level horizontal overflow, no captured page/console errors, and an installed SVG sprite. The production-safe entry exposed no mock fixture global. Nested toolbar overflow and later interactions have not been accepted.

Ignored local evidence: `test-results/ui-v2-acceptance/report.json`, `layout-probe.mjs`, `diagnostic.mjs`, `layout-probe-output.json`, and eight entry/width PNGs. These artifacts are supporting evidence, not approved visual baselines. No baseline was created or replaced.

## Reproduction

Run the preview in a native environment accessible to Chrome:

```powershell
npm ci
node scripts/v2/serve-v2.mjs
```

In a second terminal at the repository root:

```powershell
$env:WAFERCAD_REVIEW_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs
node scripts/v2/check-m2-shell.mjs
```

Open `http://127.0.0.1:4182/app-v2.html` or `http://127.0.0.1:4182/ui-v2/app.html` to observe the missing navigation. The initial sandbox Chrome launch could not produce its debug endpoint; running Chrome outside the sandbox against a sandbox server then timed out at boot. Starting both server and browser in the native environment resolved those infrastructure failures and exposed the product defect.

Publication state: acceptance report retained locally; no push, merge, deployment, manual CI, M3 wiring or product changes performed. The local preview remains available on port 4182.
