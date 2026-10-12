# UI v2 Main / Mask acceptance and decision review — 2026-10-11

The subsequent [Stage A checkpoint](../../ui-v2/STAGE_A_ACCEPTANCE_2026-10-11.md) records shared-runtime and Section integration; it does not replace the four-view final acceptance.

Repository: Xiaolong-6/WaferCAD. Branch: `codex/ui-v2-main-wip`. Tested product commit: `1664405ef7835a3e974a8551f19c8879186255bf`, identical to the fetched remote HEAD and Draft PR #177 at takeover. The working tree was clean before installation and edits. No branch was created, no merge or manual workflow was dispatched.

This checkpoint completes takeover steps 0 and 1. It supersedes the Main/Mask failure and pause status in the older handoff. **Stages A/B/C are not complete.** The user requested a concrete comparison page before deciding Section Detail and export control differences, then approved real Detail, a single Section Export dropdown with SVG and disabled pending PNG, and a single 3D Export dropdown with cancellation only in the task panel.

## Environment and actual gates

Windows; Node 24.16.0; npm 11.17.0; locked Playwright 1.55.1, Chromium 140.0.7339.186 (`chromium-1193`); Three 0.179.1. `npm ci` succeeded with 81 packages installed, zero reported vulnerabilities. Sandbox installation restrictions were resolved by running the same command with host access; lockfiles were not modified. Existing host Chromium was verified rather than reinstalled.

Legacy server: `python -m http.server 4174 --bind 127.0.0.1 --directory site`. UI v2 server: `node scripts/v2/serve-v2.mjs` on 4182; an already-running instance was reused after verifying the route. Set the two environment variables before browser gates:

```powershell
$env:WAFERCAD_URL = 'http://127.0.0.1:4174'
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
```

| Command                               | Actual result                                                                 | Local supporting evidence                                                               |
| ------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm ci`                              | PASS, exit 0                                                                  | Console installation output                                                             |
| `npm run check`                       | PASS, exit 0; ESLint, Prettier, docs; 612/612 Node tests, zero failures/skips | `test-results/ui-v2-integration/check.log`                                              |
| `npm run test:ui:smoke`               | PASS, exit 0                                                                  | `test-results/ui-v2-integration/initial-smoke.log`                                      |
| `npm run test:ui:workstation`         | PASS, exit 0, including View UX v3                                            | `test-results/ui-v2-integration/initial-workstation.log`                                |
| `npm run test:ui:interaction`         | PASS, exit 0                                                                  | `test-results/ui-v2-integration/interaction.log`                                        |
| `npm run test:ui:product:layout`      | PASS, exit 0, 109 captures                                                    | `test-results/ui-v2-integration/product-layout.log`                                     |
| `node scripts/v2/check-main-view.mjs` | PASS, exit 0; 1440/1024/768/390 and touch                                     | `test-results/ui-v2-main-review/report.json`; `test-results/ui-v2-integration/main.log` |
| `node scripts/v2/check-mask-view.mjs` | PASS, exit 0; 1440/1024/768/390 and touch                                     | `test-results/ui-v2-mask-review/report.json`; `test-results/ui-v2-integration/mask.log` |

Existing tests and 0.25 px assertions were unchanged. Reports bind both Main and Mask to the tested commit above and retain the M3D SHA-256 `31f07d85c32d44685ef7f49485e432c2b73f713550dd981998376c61de46995b`. Main/Mask scientific model equality, no legacy app boot, duplicate-ID/overflow isolation, real user operations, floating controls and touch scenarios passed. Touch is Chromium emulation, not physical touchscreen acceptance. This checkpoint does not establish integrated Section/3D behavior or GPU rendering acceptance.

The first `npm run check` failed only on Prettier in the three existing dated audit documents. The user explicitly approved formatting those documents. Their Markdown ASTs, with source locations/raw formatting metadata excluded, were equal before/after; no content or decisions were changed. The subsequent complete check passed.

## Current CI and available Pages preview

At this product HEAD, the relevant checks were successful:

- [Main and Mask browser gates](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38131633893/job/114446992830).
- [Quality](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38131633917/job/114446992737).
- [Chromium targeted regression](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38131633900/job/114447015055).
- [Process geometry regression](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38131633900/job/114447015137).
- [D1 Section/native views, software WebGL](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38131633906/job/114446992914). This is D1 evidence, not the future independent shared runtime.
- [Production-root-preserving Pages preview](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38131631682/job/114446986581).

The deployed preview build-info at `https://xiaolong-6.github.io/WaferCAD/preview/build-info.json` was fetched successfully and matched `1664405ef7835a3e974a8551f19c8879186255bf`. Main preview (`https://xiaolong-6.github.io/WaferCAD/preview/app-v2-main.html`) and Mask preview (`https://xiaolong-6.github.io/WaferCAD/preview/app-v2-mask.html`) are still separate acceptance routes, not the final four-view workstation. These deployment paths are written as URL text because the repository documentation checker maps Pages links to source paths, while `preview/` exists only in the assembled deployment. Current check status must be refreshed for later commits; the CI URLs above record this tested revision.

## Concrete decision review

Open [the review HTML](../../../site/ui-v2/reviews/contract-decisions.html), or serve `site/` and navigate to `/ui-v2/reviews/contract-decisions.html`. It is separate from the production adapters and approved M2/design baselines. Its left column reproduces current M2 controls; its right column presents the proposed scope:

1. Section Detail: real normalized rectangle/circle ROI, drag/resize and draggable inset. The mock sketch uses the existing `createSectionDetailRoiController`, clearly identifies its illustrative bands, and makes no M3D scientific claim. Physical µm/reference/rotation/ring fields are shown only in the current-M2 comparison.
2. Section export: existing SVG versus M2's SVG/PNG entries. A disabled pending PNG entry or a newly implemented PNG remains a user decision.
3. 3D export: existing PNG/GLB menu, with cancellation in the task panel, versus a dedicated Cancel export item. The task panel is explicitly a frozen mock, not a running exporter. Keeping a dedicated menu item can instead forward to the same existing task cancellation callback if chosen and verified.

No scientific semantics or production controls have been removed at this checkpoint. The user's approved choices are real rectangle/circle Detail; one Section Export entry with SVG and disabled pending PNG; one 3D Export entry with PNG/GLB and task-panel Abort only. The comparison page now reflects those choices.

Reproduce the review captures with `node scripts/v2/capture-contract-review.mjs` against the v2 server. Four widths passed layout checks before/after a real Detail drag and circle toggle; the task mock open/Abort behavior and zero page errors passed. Captures are `test-results/ui-v2-contract-review/decisions-{1440,1024,768,390}.png`. They are review evidence, not approved visual baselines.

## Changes and next steps

Changed files at this checkpoint: three audit Markdown files (format only), the older handoff's current-status link, this acceptance note, three files under `site/ui-v2/reviews/`, and the review capture script. **Legacy product changes: 0 added + 0 deleted.** Review v2 files are counted separately. The A/B/C budget base is `1664405ef7835a3e974a8551f19c8879186255bf`; total legacy additions plus deletions may not exceed 100.

Remain on `codex/ui-v2-main-wip`, retain Draft PR #177, and preserve the audit branch and design baselines. Implement Stage A with the approved decisions, one independent shared runtime and the real Section compositor; validate it before Stage B and then Stage C. Do not treat this comparison page or independent Main/Mask routes as integrated acceptance. No costly manual Actions, merge or production-root update is authorized.

Find the checkpoint containing this note with `git log -1 --format=%H -- docs/ui-v2/MAIN_MASK_ACCEPTANCE_2026-10-11.md`. Refresh GitHub checks and deployed build-info after pushing before using the new review's Pages URL.
