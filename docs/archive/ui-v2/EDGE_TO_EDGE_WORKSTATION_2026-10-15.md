# Production Workstation edge-to-edge viewport — 2026-10-15

> **Integration status verified 2026-10-16:** The original full-viewport and compact-navigation work in [PR #249](https://github.com/Xiaolong-6/WaferCAD/pull/249) was merged on 2026-10-15, followed by [integration PR #256](https://github.com/Xiaolong-6/WaferCAD/pull/256). The layout and PR-overlap statements below record the original implementation boundary; the current production Shell is further specified by [Architecture](../../ARCHITECTURE.md) and [Usage](../../USAGE.md).

## Scope and ownership

Branch: `fix/ui-v2-edge-to-edge-shell-20261015` (based on `main`).

The production `site/app.html` Workstation now uses an edge-to-edge shell, removing the redundant outside card border, radius and margins. The desktop shell occupies `100dvh`, leaving the existing header, stage, optional Section dock, inspector and status bar in the same internal grid. The v2 read-only Welcome preview and standalone M2 review shells retain their separate contracts.

- `site/ui-v2/workstation-v2.css`: production-only `body[data-workstation] .p-workbench` viewport contract; no change to geometry, renderer or prototype shell styling.
- `site/ui-v2/mobile-workstation.css`: portrait View reserves a fixed safe-area-aware ~60px bottom dock; Edit grows with one document scroller and reserves bottom padding. All five actions are visible at 360px without horizontal scrolling.
- `scripts/v2/check-startup.mjs`: desktop 1440×960 and 1024×768 shell edge, chrome and document-overflow assertions.
- `scripts/v2/check-mobile-workstation.mjs`: 360×640, 390×844 and 430×932 View edge assertions plus Edit horizontal-shell checks, while retaining the existing mobile scroll and state assertions.

## CI follow-up

The first complete CI attempt on `c4b6d0a` passed Quality, general Browser, 3D and scientific workflows. Two focused suites failed:

- Stage C `check-m2-live-parity` compared the intentionally inset M2 card width (1416 px) with the now edge-to-edge production shell (1440 px). The updated test asserts the production viewport boundary and continues comparing navigation, inspector, and Manual editor internals.
- Main/Mask/Mobile `check-section-view` passed 1440/1024/768 but timed out at 390 px while clicking a disabled Mask More button during responsive view transition. The updated test waits for the Mask panel and responsive toolbar to settle, then requires the actual target or an enabled overflow entry before proceeding.

The first compact-topbar approach did not achieve the intended result on a real portrait device: it preserved several toolbar rows. After user acceptance, it was replaced with **one fixed contextual bottom navigation row** on production `app.html`:

- View: **Edit / Main / Mask / 3D / Section**.
- Edit: **View / Project / Mask / Process / History**.
- The production topbar and mobile viewbar are not shown. Main/Mask/3D/Section keep their own contextual canvas toolbar.
- The single original `.p-nav` host is moved out of document flow with `position: fixed`. Existing domain and view buttons retain their action IDs and DOM identities while moving between hosts; no scientific adapter or control is duplicated. M2 standalone prototypes retain the original topbar switcher.
- View reduces its scientific stage height by the measured safe-area dock allocation; Edit reserves bottom padding so the last form controls remain reachable by ordinary document swipes. The dock hides when `visualViewport` indicates an actual software keyboard covering the editing input.
- `check-mobile-workstation.mjs` asserts five actions, fixed bottom position, safe stage separation, touch hit sizes, horizontal fit, preserved domain scroll/draft/canvas identities, and produces View/Edit screenshots at 360×640, 390×844 and 430×932. Tooltip and M2 live parity scripts follow the same context switching.

A complete new GitHub Actions run and image review remain required before merge.

## Validation and handoff

Implementation commits: `76611cf7`, `76d1c04c`, `028dd5db`, `ada3fcdc`.
The GitHub-only execution environment could not reach GitHub via a local checkout, so no local Node, Prettier or browser test has been executed. Do not interpret the submitted regression assertions as passing evidence.

Run `npm run check`, `node scripts/v2/check-startup.mjs` and `npm run test:ui:mobile` with the documented local server/browser setup. Examine both portrait and desktop viewport screenshots, top and bottom page edges, and canvas resize/fit behavior. CI green is necessary but does not substitute for visual UI acceptance.

Known integration overlap: PR #188 edits the same CSS file around startup placeholders; its patch does not touch this shell rule. Rebase or merge carefully if it lands first. This PR does not include a Pages deployment.
