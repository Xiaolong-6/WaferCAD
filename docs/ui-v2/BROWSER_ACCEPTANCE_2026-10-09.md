# UI v2 browser acceptance — 2026-10-09

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
