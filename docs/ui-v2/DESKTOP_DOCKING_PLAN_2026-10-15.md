# Desktop View Docking reconstruction — implementation contract (2026-10-15)

**Initial base:** `integrate/legacy-retirement-20261015` at `45bc459c`. Once #256 merged and the integration branch was deleted, GitHub automatically closed #261. Its unchanged feature branch continues in Draft **PR #267 targeting Main**, synchronized with post-integration Main; no Merge without explicit maintainer approval.

## Approved UX
- Production **desktop only**, viewport width > 820px: `Overview | Main | Mask | 3D | Section`. Overview resets to four-view 2×2; four view buttons are independent visibility toggles and accurately reflect displayed views.
- Panel titlebar: toggle maximize/restore, followed by rightmost X close. Restore preserves prior composition. No drag when only one view is visible.
- Snap layout picker from titlebar drag; drop on target panel swaps placement; drop on a preset zone assigns a view to that zone. Minimum-size constraints guard narrow desktop workspaces. Drag is cancellable (Escape/pointercancel), supports keyboard fallback.
- Four-view presets: 2×2, left-main, right-main, top-main, bottom-main, four columns, four rows, corner-main. Three-view presets: left/right/top/bottom-main, three columns, three rows. Two-view presets: equal columns, left/right-weighted columns and equal rows. One view fills stage.
- On production **compact <= 820px**, preserve the existing View/Edit bottom dock, scroll ownership, Welcome route, viewport gestures and the existing single-view behavior. Read-only Welcome previews and standalone M2 shell are outside this redesign.

## Ownership and interfaces
1. `view-layout-model.js`: pure validated desktop layout reducer (visible/order/preset/ratios/maximized/restoration). Must never reference document/window/model or persistence.
2. `view-layout-templates.js`: immutable template registry and minimum-size rules; one centralized template resolver for 1–4 views.
3. `view-layout-storage.js`: versioned preferences (desktop only), safe migration/defaults; never mutate project format, Snapshot/History/Recovery, or scientific geometry.
4. `view-docking-controller.js`: pointer drag, snap preview, drop/swap, cancellation, keyboard path; DOM never owns layout truth.
5. `view-layout.css`: layout renderer; scoped to production desktop stage. Avoid CSS overrides stacked over old mode rules; remove obsolete rules during Stage E.
6. `view-panel.js`: unified stable titlebar controls while retaining scientific stage host identity.
7. `workstation-v2.js`: Shell/presentation only; delegate desktop layout decisions, keep the stable mobile nav implementation introduced by #249.
8. `workstation-entry.js`: routes desktop actions to the controller; production render scheduling separated from scientific invalidation.
9. Main/Mask/Section/3D scientific runtimes: do not recreate canvases, invalidate physical state, reset gestures or refit 3D camera due solely to layout operations.

## Implementation checkpoints
- **A: State/model/templates** — reducer with checked IDs, reversible maximize, deterministic visibility/order, preset fallback, bounded ratios, corrupt storage rejection. Pure Node tests.
- **B: Production desktop presentation** — replace `single/split/section dock` controls with five buttons, titlebar X and maximize/restore; keep mobile and standalone preview branches untouched. Start real Chromium smoke and screenshots before broad CI.
- **C: Docking/Snap** — drag ghost, target highlighting, 1–4 view presets, swap/drop, resize boundaries, cancellation, focus/keyboard. Browser screenshots for each template at 1440/1024/821.
- **D: Scientific integration** — viewport state, Main ROI, Mask ROI, A–B Section, Section Legend/Z Break, 3D camera/context count, 0 scientific model mutation on layout, History/Recovery isolation.
- **E: Retirement/acceptance** — migrate desktop mode tests, remove obsolete production code/CSS, verify 320/360/390/768/820 mobile invariance, Stage C/M4 targeted browser checks, needed scientific suites, final Quality and combined-head CI.

## Acceptance and risk
- Real Chromium screenshots autonomously inspected before wide CI. During development run only relevant unit/contract/browser smoke checks.
- Preserve Panel/Canvas DOM identity, WebGL context and camera orientation through layout changes; use resize notification after settled layout rather than renderer reinitialization.
- Disable docking below 821px even when CSS viewport/pointer inputs differ. `workstation-preview.css` and `mobile-workstation.css` retain their owners.
- Layout preferences are versioned, view-only, safe on unavailable storage; reset to 2×2 on corrupt data. Never written into `.wafercad`, History or Recovery.
- Track every unchecked gate openly; merged `#256` component checks do not prove this stacked PR. No merge to Main without maintainer approval.

The full implementation plan and execution checkpoints are maintained in the Draft PR Conversation comment.
