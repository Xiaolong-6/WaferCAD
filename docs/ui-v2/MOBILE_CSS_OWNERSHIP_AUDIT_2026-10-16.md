# Mobile CSS ownership audit — 2026-10-16

Status: **Audit complete; CSS cleanup deferred.** No additional mobile visual change is authorized.
The separate desktop Restore/Collapse glyph alignment was approved on 2026-10-16.

## Ownership

- `mobile-workstation.css` (244 lines): the **only production compact Shell layout owner**
  at widths up to 820px. Owns document scrolling, the fixed bottom dock, safe-area allocation,
  the `data-keyboard` state styling, and flattening desktop hosts through `display: contents`.
- `desktop-shell.css` (312 lines before glyph changes): production desktop Sidebar/Workspace
  layout for widths of 821px and above. No compact fallback belongs here.
- `workstation-v2.css` (1835 lines): shared presentation and standalone M2 prototype styling.
  Legacy A/B/C layout rules are scoped to `body:not([data-workstation])`. Do not widen them.
- `view-layout.css` (285 lines): scientific view and docking geometry, including
  view-specific responsive rules. These remain renderer-owned, not mobile Shell CSS.
- `workstation-preview.css` (75 lines): isolated read-only preview behavior.
  Never move preview rules into production compact layout.

## Candidate cleanup after P2/P3 acceptance

1. Keep production mobile sizing, overflow, navigation and keyboard presentation
   exclusively in `mobile-workstation.css`.
2. Audit prototype-only 820px blocks in `workstation-v2.css` around lines 1483 and 1523.
   Remove nothing until both M2 and production pages are browser-tested.
3. Keep responsive scientific geometry in `view-layout.css`; preserve Mask ROI,
   Section, 3D cameras and all ResizeObserver contracts.
4. Retain production and preview selectors as explicit disjoint scopes.
5. Do not introduce duplicate navigation hosts, nested ordinary vertical scrolling,
   extra sidebars or unrelated mobile styling.

## Acceptance invariants

- Compact 320/360/390/430/768/820px: five fixed actions; no horizontal overflow;
  required touch targets at least 44px; identical approved navigation styling.
- Desktop 821/1024/1440px: real two-column Shell, centered dock toolbar, working
  Collapse and Restore with matching sidebar glyphs.
- Edit with long Process/History/Recipe: one native document scroll owner;
  per-domain positions and unsaved drafts survive navigation and resize.
- View with Main/Mask/3D/Section: original Canvas and GL contexts remain stable;
  2D Pan/Zoom and 3D Orbit/Zoom remain unchanged.
- Focus and keyboard: dock hides only for real compact Edit occlusion and returns
  when the keyboard is dismissed.
- Read-only Preview and standalone M2: preserve their independent layout contract.

## Execution gates

- P4-A: this documentation-only audit. No CSS cleanup is part of the audit.
- P4-B: after P2/P3 integration and screenshot parity, remove only proven obsolete rules.
- P4-C: inspect real Chromium screenshots at compact and desktop breakpoints and run
  targeted mobile, docking and Preview gates before full Quality and scientific checks.

No scientific tolerance changes, data-schema changes or Main merge without approval.
