# UI v2 visual polish — 2026-10-09

Product commit: `fa02530777edd16be1f6ca4b9b4127b480bf65c1`, branch `codex/ui-v2-m2-handoff-2026-10-09`, repository `Xiaolong-6/WaferCAD`. User requested visual adjustment after formal M2.5 acceptance, with architecture preserved.

## Changes and ownership

- `workstation-v2.css` owns navigation, toolbar and panel presentation. Primary navigation stays on one row; Hide is an accessible icon button. Process mode tabs stay on one row. Quiet toolbar controls use transparent borders; active controls retain a visible blue background. Draw controls retain 40 px targets.
- Persistent adapter content leaves now have explicit spacing. The previous `.p-panel-content:has(.p-history-workspace)` rule also matched hidden History retained in the DOM, accidentally removing padding from other editors. It now matches only a visible domain host. Named hosts, their ancestors, science stages and adapter mount/show/hide/refresh/destroy behavior remain unchanged.
- Section Legend uses a bounded responsive side width and two-line labels, retaining full source text and existing title tooltips. Palette actions remain available with quieter borders. Narrow-screen Legend remains below the plot.
- History titles are limited visually to two lines; full text remains in the DOM/accessibility name and the existing selected-Step summary. Tree ancestry, IDs, HEAD/cursor, menus and scroll behavior are preserved.
- `mock-domain-panels.js` owns the shortened mock-only field/summary text. The explicit global mock notices remain; no domain knowledge was added to the shell. Formatting of these touched files accounts for part of the diff.
- `workstation-v2.js` changes only the Hide button's visible label, retaining its existing accessible name and action. Production-safe placeholder entry uses the same presentation rules without mock imports.

No renderer-owned scaling, canonical geometry, model/controller/worker, transaction, History mutation, persistence or migration code changed. The existing 3D thumbnail and schematic Section content are still mock material; this iteration does not crop/scale scientific data to fill whitespace or start M3 wiring.

## Verification

Windows NT `10.0.26300.0`, Node `v24.16.0`, native Chrome `155.0.8059.40`. Locked Playwright `1.55.1` and Three `0.179.1` installed but unused by this shell CDP suite.

| Command                                                                                                                                                                                     | Result                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `npm ci`                                                                                                                                                                                    | Exit 0; 81 packages, 0 vulnerabilities.                         |
| `npx prettier --write site/ui-v2/workstation-v2.css site/ui-v2/workstation-v2.js site/ui-v2/mock-domain-panels.js scripts/v2/check-m2-shell.mjs` (files formatted during the edit sequence) | Exit 0.                                                         |
| `npx prettier --check site/ui-v2/workstation-v2.css site/ui-v2/workstation-v2.js site/ui-v2/mock-domain-panels.js scripts/v2/check-m2-shell.mjs`                                            | Exit 0.                                                         |
| `node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs`                                                                                                         | Exit 0; 8/8.                                                    |
| `npm run lint`                                                                                                                                                                              | Exit 0.                                                         |
| `git diff --check`                                                                                                                                                                          | Exit 0.                                                         |
| `node scripts/v2/check-m2-shell.mjs` with native Chrome override                                                                                                                            | Exit 0; all 36 named checks, zero captured page/console errors. |

The existing owning browser suite adds assertions that primary navigation remains one row in both entries at 1440/1024/768/390, that Project/Process retain padding after navigation through persistent History, and that all four Process modes fit on one row. Stable-host, Hide/Restore, Legend, History scroll/tree, dialogs, file startup, responsive layout and mock ROI checks remain intact. Main/3D ROI top/bottom deltas remain 0 px at 1440 and 1024.

In-app browser visual review covered Process and History at 1440 × 1000 and Process at 390 × 844; initial Project/Process/History review preceded the changes. Temporary viewport overrides were reset. Local ignored evidence: `test-results/ui-v2-acceptance/visual-polish-wide.jpg`, `visual-polish-phone.jpg`, and `visual-polish-official.txt`. Screenshots are review artifacts, not approved baselines. Existing platform baselines were unchanged.

## Reproduce

```powershell
npm ci
node scripts/v2/serve-v2.mjs
```

In another terminal:

```powershell
$env:WAFERCAD_REVIEW_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node scripts/v2/check-m2-shell.mjs
```

Open `http://127.0.0.1:4182/app-v2.html?live`. The same branch is used for publication under the existing push authorization; no merge, deployment or manual CI is performed. M2.5 remains formally passing; these visual changes await the user's aesthetic review, not M3/M4 approval.
