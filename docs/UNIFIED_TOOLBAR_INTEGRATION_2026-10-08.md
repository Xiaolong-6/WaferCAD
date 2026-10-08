# Unified toolbar integration — 2026-10-08

> Revision-specific evidence. This report records the desktop audit and integration scope below; current product contracts remain in the documentation map.

## Revisions and scope

- Product baseline: main `82c35a845946835451fd7da9fcbe92be47593e7f`.
- Documentation architecture audit: `52d83c2b2b6925cb1fe758dd87dd322f4818d7a3`; see [the documentation audit](DOCUMENTATION_AUDIT_2026-10-08.md).
- Requested UI branch: `fix/unified-toolbar-state-20261008`, fetched at `8d9f7a4f3bd561a0bf2974ba0ae878ce37b2e47c`.
- Conflict-free integration merge: `0bde3c1816b6bda339be9fa3f551d2826e4b5c12`.
- Tested UI repair: `14d8a3f2eba604b9c183b79c44ec9ad6ffcf50a3`.

The user authorized merging this UI branch after the documentation audit. A clean isolated desktop checkout was reused; the user's original feature working tree and uncommitted changes remain untouched. No geometry/renderer algorithm or approved platform baseline changed.

## Audit findings and repairs

The branch removes the 3D ON/OFF badge, keeps an accessible Border checkbox and centralizes header selected/hover colors. File/Draw, Fast/Quality and Auto/1:1 emphasize the currently named mode; popovers emphasize their open state.

Real computed-style coverage found a remaining P2 inconsistency: `#mainPanBtn` still had a legacy ID-specific palette, which overrode the unified dark header selection. The repair removes that rule so Pan consumes the shared palette. The full Node gate also found an obsolete test requiring the removed ON/OFF caption; its updated contract retains accessible checkbox/focus and buried-edge rendering checks.

`interaction-regression.mjs` now checks both states of the three mode buttons, selected/unselected Border/Pan/Detail, common selected hover colors, expanded ROI/Opacity colors and keyboard Space toggling of the 3D checkbox. Clicks exercise the current workstation; light fallback palettes are sampled by temporarily removing the theme class for CSS inspection, rather than claiming an end-user theme-switch workflow. Palette comparisons suppress the short color transition while sampling and restore normal transitions afterward.

The owning current visual contract is in [Development](DEVELOPMENT.md), with user-facing states in [Workspace and Views](wiki/Workspace-and-Views.md). The existing Product Review evidence retains the branch's visual-spec addition.

## Validation

Environment: Windows 10.0.19045, PowerShell, Node 24.19.0, Playwright 1.55.1, Chromium 140.0.7339.186 and pinned local Three 0.179.1. Existing locked `npm ci` dependencies were retained. The local `site/` server used `http://127.0.0.1:4173`; `WAFERCAD_THREE_DIR` pointed to this checkout's `node_modules/three`.

- `npm run format`: passed; also repaired the branch's two Prettier failures.
- `npm run check`: passed lint, format, generated docs/link checks and 508/508 Node tests, with 0 failed and 0 skipped.
- `node scripts/workstation-regression.mjs`: passed.
- `node scripts/m3d-welcome-regression.mjs`: passed, including 36 History nodes and actual Border state colors/click restoration.
- `node scripts/interaction-regression.mjs`: passed the new computed-palette/keyboard cases and existing interaction/export cases.
- `node scripts/m3d-visual-acceptance.mjs`: passed all four Border × Opacity cases, 36 History nodes, 27 bookmarks, historical restore without extra Recovery, lossless Export and exact model round-trip/reimport. No page errors. Four 3D screenshots were inspected.
- `node scripts/product-layout-regression.mjs`, with `WAFERCAD_EXTENDED_REVIEW=0` and `WAFERCAD_REVIEW_DIR=test-results/toolbar-state/product-layout`: passed wide/phone interaction and layout scenarios plus 600/601 px breakpoint checks, with 48 captures and no page errors. Phone workspace/Process and breakpoint screenshots were inspected. The extended layout inventory was not run.
- `npm run docs:check` and `npm run format:check`: final handoff/navigation formatting checks passed after the documentation-only provenance update.

No unresolved P0/P1 finding remains in the combined audited scope.

Ignored desktop artifacts: `test-results/pre-main-audit/toolbar-*.log`, `test-results/toolbar-state/`, `test-results/m3d/welcome/` and `test-results/m3d/visual-acceptance/`. These support this committed result summary; another environment reproduces the checks from source.

## Delivery and limits

Delivery target: main, through a normal fast-forward update retaining the requested branch history. Remote refresh confirmed main remained at `82c35a8` and the requested UI branch at `8d9f7a4`, both ancestors of the combined history; the user authorized publication after these checks. No costly manual CI was dispatched. A normal main push can trigger the repository's existing automated jobs; local success does not certify their completion or live Wiki/Pages delivery. Windows screenshot review does not accept or replace Linux/Windows approved pixel baselines.
