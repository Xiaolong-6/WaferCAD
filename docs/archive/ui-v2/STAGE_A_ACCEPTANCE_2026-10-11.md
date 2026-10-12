# UI v2 Stage A — shared runtime and physical Section

Branch: `codex/ui-v2-main-wip`, Draft PR [#177](https://github.com/Xiaolong-6/WaferCAD/pull/177). Stage A follows the accepted [Main/Mask checkpoint](MAIN_MASK_ACCEPTANCE_2026-10-11.md). The takeover base remains `1664405ef7835a3e974a8551f19c8879186255bf` for cumulative legacy accounting. Product commit and current CI evidence will be recorded after the normal push. No manual workflow or merge is authorized or required.

## Implemented behavior

`site/app-v2-workstation.html` mounts Main, Mask and Section in one approved M2 shell. `workstation-runtime.js` owns one parsed, validated full M3D project and one actual model reference. Existing Main/Mask modules expose factories while retaining their standalone acceptance routes. Per-view gesture state stays separate; Main inspection ROI, Mask process ROI and Section Detail ROI use different state fields. The shared scheduler detects actual Main Slice changes and reslices Section; canvas navigation never rewrites the model.

Section consumes the existing `plan-renderers.js` physical compositor, viewport functions, Detail controller and Z-collapse controller. Detail uses the user-approved normalized rectangle/circle, direct drag and real inset. Z Break top/bottom remain physical µm; linked/unlinked Front/Back scales, snapping and ruler handles use existing controller algorithms. The Section layer legend operates on stable model IDs and existing visibility/palette setters. Export has one entry, working SVG download and visibly disabled pending PNG. The user requested “CVG”; this is interpreted as SVG, the existing format.

There is no `app.js` startup, legacy DOM clone, surrogate Section image, replacement compositor, or modified science/IO/worker/schema. Stage B (3D) and Stage C (Process/History/Recovery and comprehensive synchronization) remain incomplete; this three-view checkpoint is not the final four-view deliverable.

## Files and accounting

- Shared page: `site/app-v2-workstation.html`, `site/ui-v2/workstation-entry.js`, `workstation-runtime.js`, `workstation-views.css`.
- View adapters: `site/ui-v2/main-view.js`, `mask-view.js`, new `section-view.js`; shared `view-kit/plan-gestures.js` adds opt-in drag zoom for Section.
- Browser owner: `scripts/v2/check-section-view.mjs`; the existing Main/Mask CI job also runs it and uploads its evidence.
- Only legacy change: `site/controllers/section-collapse-controller.js`, **8 additions, 0 deletions** exposing existing functions. Cumulative A/B/C legacy budget used: **8/100**. Main/Mask indentation changes come from factory extraction and count as v2, not legacy.

## Actual local verification

Environment remains Windows, Node 24.16.0, Playwright 1.55.1 / Chromium 140.0.7339.186, Three 0.179.1. Both HTTP servers and environment variables are reproduced in the Main/Mask checkpoint.

| Command                                  | Actual result                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `npm run check`                          | PASS; lint, formatting, documentation and 612 tests, zero failures/skips    |
| `npm run test:ui:smoke`                  | PASS                                                                        |
| `npm run test:ui:workstation`            | PASS, workstation and View UX v3                                            |
| `npm run test:ui:interaction`            | PASS                                                                        |
| `npm run test:ui:product:layout`         | PASS, 109 captures                                                          |
| `node scripts/v2/check-main-view.mjs`    | PASS, 1440/1024/768/390 and touch; original 0.25 px assertions retained     |
| `node scripts/v2/check-mask-view.mjs`    | PASS, 1440/1024/768/390 and touch                                           |
| `node scripts/v2/check-section-view.mjs` | PASS, 1440/1024/768/390 and touch, including integrated Mask floating Apply |

Section acceptance checks actual 27-layer/551-region model identity; edits Main A/B through real controls and checks the physical Section span; observes Z Break pixel changes; performs wheel/drag zoom, pan and Fit; draws rectangle Detail, switches to circle and checks the actual inset; downloads SVG; compares the full scientific model before/after navigation and inspection; verifies no page errors/overflow. Touch uses actual CDP touch dispatch for pan and two-finger zoom. No baseline or precision assertion changed. Integrated Mask coverage also uses real Square drag, typed size and Apply and verifies Main ROI independence.

Local supporting artifacts are ignored: `test-results/ui-v2-section-review/report.json` and `section-{1440,1024,768,390}.png`; Main/Mask retain their established review directories. Command logs are under `test-results/ui-v2-integration/stage-a-*.log`. These are supporting evidence, not portable baselines.

Local review URL: `http://127.0.0.1:4182/app-v2-workstation.html`. Pages candidate: `https://xiaolong-6.github.io/WaferCAD/preview/app-v2-workstation.html`. Validate deployment revision before treating Pages as evidence. CI green does not constitute human product acceptance.
