# P4 Mobile CSS ownership audit — 2026-10-16

**Status:** audit complete; cleanup **not applied** until P2 keyboard/Viewport and P3 render scheduling have passed combined browser validation. This document does not authorize any visual changes. The only additional approved desktop visual delta is the paired Restore/Collapse panel glyph requested on 2026-10-16.

## Current scope and computed ownership

| File | Current scope | Ownership / decision |
| --- | --- | --- |
| `mobile-workstation.css` (244 lines) | `@media (max-width: 820px)` and production/non-preview selector | **Single production compact document-layout owner**: native Edit scroller, View canvas height, fixed 64px + four-tab bottom dock, safe-area, keyboard-hidden dock, sidebar/workspace `display: contents` |
| `desktop-shell.css` (312 lines) | `@media (min-width: 821px)` | Production desktop sidebar, split bar, workspace header; never add mobile fallback rules here |
| `workstation-v2.css` (1835 lines) | Shared typography, controls, scientific sub-elements and M2 prototype layout | Keep common visuals; retired A/B/C shell geometry is scoped to `body:not([data-workstation])`; compact prototype selectors should not override production document scrolling |
| `view-layout.css` (285 lines) | Scientific window/panel geometry, desktop docking and view-specific responsive behaviors | Do not move scientific/renderer layout into mobile shell CSS; targeted geometry checks required |
| `workstation-preview.css` (75 lines) | `[data-preview-mode='true']` | Independently owns embedded read-only preview; must remain isolated |

## Consolidation candidates (safe only with browser parity evidence)

1. Keep production mobile sizing, overflow, fixed dock and `data-keyboard` presentation exclusively in `mobile-workstation.css`. Do **not** copy width/scroll declarations back into `workstation-v2.css` or `desktop-shell.css`.
2. Review prototype-specific compact `@media (max-width: 820px)` blocks at `workstation-v2.css:1483` and `:1523`. Only move or remove a rule after proving exact M2 prototype AND production equivalence. Production mobile must keep a single native document scroller.
3. Treat `view-layout.css` responsive changes as scientific stage ownership, not redundant shell CSS; preserve Mask ROI, 3D camera, Section and ResizeObserver contracts. Avoid cosmetic "cleanup" of these rules.
4. Preserve the existing explicit `body[data-workstation]:not([data-preview-mode])` scope of the compact dock and `body:not([data-workstation])` prototype exemptions; never broaden into the Welcome preview.
5. Avoid adding a second mobile nav host, faux sidebars or extra scroll containers. Remove dead selectors only if rule-by-rule before/after screenshots and computed styles are equal in both modes.

## Risk matrix

| Scenario | Invariant |
| --- | --- |
| 320/360/390/430/768/820 compact widths | Five fixed nav actions; no horizontal overflow; all touch targets >=44px where specified |
| 821/1024/1440 desktop | Genuine two-column Shell retained, centered view controls, working sidebar collapse/restore |
| Mobile Edit, long Process/History/Recipe | `document.scrollingElement` is the sole ordinary vertical scroller; per-domain position and draft input retained |
| Mobile View / Section / Mask / 3D | Stable original DOM canvas/GL identity, no forced refit, 2D pan/zoom and 3D orbit/zoom unchanged |
| Keyboard / visualViewport / focus | Dock hidden only during actual compact Edit occlusion, returns after blur and viewport recovery |
| Read-only preview / standalone M2 | Existing independent chrome/scroll contract unchanged |

## Work order

- **P4-A (this branch):** audit-only documentation. No CSS byte changed; CSS screenshots inherently unchanged.
- **P4-B (after P2/P3):** one focused CSS cleanup commit only for provably obsolete duplicated rules, ideally zero behavioral changes.
- **P4-C:** real Chromium mobile 360/390/430 and breakpoint 820/821 plus desktop 1440 screenshots; existing `npm run test:ui:mobile`, `npm run test:ui:docking`, Preview gate as scoped; pixel parity outside approved nav/restore icons.
- Do not loosen scientific tolerance, change model or project data, run unrelated full CI loops, or merge Main without explicit maintainer authorization.
