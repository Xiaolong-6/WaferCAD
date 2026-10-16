# Mobile CSS ownership audit — 2026-10-16

**Status:** Audit complete; CSS cleanup deferred until P2/P3 combined browser acceptance.
No mobile visual changes are authorized beyond the approved bottom navigation. The matching
desktop Restore/Collapse panel glyph is separately approved.

## Ownership

- `mobile-workstation.css`: production compact Shell layout up to 820px. Owns native document
  scrolling, five-button fixed dock, safe areas, keyboard-occlusion presentation, and compact
  `display: contents` flattening of Sidebar/Workspace hosts.
- `desktop-shell.css`: production desktop Sidebar/Workspace layout from 821px upward. No
  mobile fallbacks belong here.
- `workstation-v2.css`: common controls and standalone M2 prototype styling. Legacy A/B/C
  layout rules stay scoped to `body:not([data-workstation])`.
- `view-layout.css`: scientific view geometry, desktop docking, and view-specific responsive
  rules. These remain with the scientific view owner.
- `workstation-preview.css`: isolated embedded read-only preview. Keep it separate from
  production compact styling.

## Cleanup candidates

1. Keep production mobile heights, scrolling, navigation, safe areas, and `data-keyboard`
   rules exclusively in `mobile-workstation.css`.
2. Audit prototype-only 820px blocks in `workstation-v2.css` near lines 1483 and 1523.
   Remove nothing until both standalone M2 and production pages pass comparison.
3. Preserve Mask ROI, Section, 3D camera, ResizeObserver, and view gesture contracts in
   `view-layout.css`. Do not relocate renderer geometry to the mobile Shell.
4. Preserve production and Preview selectors as disjoint scopes.
5. Do not add duplicate navigation hosts, nested document scrollers, new sidebars, or
   unrelated mobile visual changes.

## Verification gates

- At 320/360/390/430/768/820px, the approved five-button dock remains fixed, accessible,
  and free of horizontal overflow.
- At 821/1024/1440px, the true two-column Shell and centered desktop view toolbar remain
  unchanged; Collapse and Restore use matched sidebar glyphs.
- Long Project/Process/History forms retain input drafts and per-domain native scroll state.
- Main/Mask/3D/Section retain original Canvas/GL identity, camera state, and 2D/3D gestures.
- Keyboard occlusion only hides the compact Edit dock when a text field is focused, and
  dismissal restores the dock without remounting scientific views.
- Read-only Welcome Preview and standalone M2 keep their existing chrome and scroll behavior.

## Sequence

- **P4-A:** Complete this audit without modifying production mobile CSS.
- **P4-B:** After P2/P3 acceptance, remove only selectors proven redundant by computed-style
  and screenshot comparison.
- **P4-C:** Compare real Chromium 360/390/430 and 820/821 screenshots; run mobile, docking,
  and Preview regression gates before final Quality/scientific acceptance.

No scientific tolerance changes, project format changes, or Main merge without approval.
