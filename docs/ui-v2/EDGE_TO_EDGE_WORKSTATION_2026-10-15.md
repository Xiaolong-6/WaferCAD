# Production Workstation edge-to-edge viewport — 2026-10-15

## Scope and ownership

Branch: `fix/ui-v2-edge-to-edge-shell-20261015` (based on `main`).

The production `site/app.html` Workstation now uses an edge-to-edge shell, removing the redundant outside card border, radius and margins. The desktop shell occupies `100dvh`, leaving the existing header, stage, optional Section dock, inspector and status bar in the same internal grid. The v2 read-only Welcome preview and standalone M2 review shells retain their separate contracts.

- `site/ui-v2/workstation-v2.css`: production-only `body[data-workstation] .p-workbench` viewport contract; no change to geometry, renderer or prototype shell styling.
- `site/ui-v2/mobile-workstation.css`: no outer margin in edit or view; View is `100dvh`, while Edit still grows with the document and preserves the single-scroller, touch navigation and canvas-host identity contracts.
- `scripts/v2/check-startup.mjs`: desktop 1440×960 and 1024×768 shell edge, chrome and document-overflow assertions.
- `scripts/v2/check-mobile-workstation.mjs`: 360×640, 390×844 and 430×932 View edge assertions plus Edit horizontal-shell checks, while retaining the existing mobile scroll and state assertions.

## CI follow-up

The first complete CI attempt on `c4b6d0a` passed Quality, general Browser, 3D and scientific workflows. Two focused suites failed:

- Stage C `check-m2-live-parity` compared the intentionally inset M2 card width (1416 px) with the now edge-to-edge production shell (1440 px). The updated test asserts the production viewport boundary and continues comparing navigation, inspector, and Manual editor internals.
- Main/Mask/Mobile `check-section-view` passed 1440/1024/768 but timed out at 390 px while clicking a disabled Mask More button during responsive view transition. The updated test waits for the Mask panel and responsive toolbar to settle, then requires the actual target or an enabled overflow entry before proceeding.

These fixes require a complete GitHub Actions run at the updated head. PR #249 also includes the requested portrait navigation refinement: the brand, ellipsized project title and View/Edit toggle share one compact topbar row; the four domain buttons occupy a single equal-width row with no horizontal scrolling, and the redundant mobile Hide navigation action is hidden. The existing DOM/control identities and Edit document-scroll ownership are preserved. `check-mobile-workstation.mjs` now asserts both chrome rows, touch sizes and overflow at 360×640, 390×844 and 430×932, and captures the Edit navigation screenshot.

## Validation and handoff

Implementation commits: `76611cf7`, `76d1c04c`, `028dd5db`, `ada3fcdc`.
The GitHub-only execution environment could not reach GitHub via a local checkout, so no local Node, Prettier or browser test has been executed. Do not interpret the submitted regression assertions as passing evidence.

Run `npm run check`, `node scripts/v2/check-startup.mjs` and `npm run test:ui:mobile` with the documented local server/browser setup. Examine both portrait and desktop viewport screenshots, top and bottom page edges, and canvas resize/fit behavior. CI green is necessary but does not substitute for visual UI acceptance.

Known integration overlap: PR #188 edits the same CSS file around startup placeholders; its patch does not touch this shell rule. Rebase or merge carefully if it lands first. This PR does not include a Pages deployment.
