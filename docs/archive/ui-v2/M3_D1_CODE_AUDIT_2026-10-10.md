# M3 D1 code audit — 2026-10-10

**Reviewed product revision:** `c63d403acc67d08ec10af1a06dd297ec033cb6c8` on `codex/ui-v2-m3-main-audit-20261010`.  
**Last independently browser/Node-accepted input:** `840835280fc4d4d6fffbb89fcc1873f7aebbbc51`.  
**Decision: BLOCK D1 acceptance and main merge.** This is a **read-only product-code audit**, with a documentation-only report; it is not a browser acceptance or proof of any CI run on `c63d403`.

## Scope and evidence

Reviewed all **13 changed paths** in the 22 commits after `8408352` and inspected the original Section Detail ROI, Z Break, View Popover, Project State, Workspace Persistence and v2 Workstation owners. Re-parsed **nine actual fetched JS/MJS source files** as stripped module/script bodies in V8; 9/9 parsed. Executed the **actual fetched** `site/section-view-viewport.js` mapping functions for nontrivial pan/zoom/cursor anchors: the double-precision anchor error was `[0, 0]` CSS pixels for the tested input. This tests mapping algebra, **not** actual Section compositor pixels.

Also executed the **actual fetched** `site/ui-v2/overlay-manager.js` in V8 with a minimal in-memory native-details stub: after `adoptNativeViews([panel])`, calling the manager's public `close('popover')` left the adopted native menu `open === true`. This reproduces a real API ownership gap without a browser. Source inspection confirms the unpersisted viewport state below.

The container cannot resolve `github.com` for `git ls-remote`; DevSpace workspace attempts did not open the checkout. Therefore **no fresh npm ci, Node suite, lint, Prettier, docs check, Chromium, hardware GPU or screenshot comparison** was executed at this revision. GitHub commit-status API returned no statuses; the PR-workflow lookup returned no PR workflow runs. Neither is evidence of a green gate.

## Confirmed findings (review priority order)

### D1-AUDIT-01 — P1: Section view changes schedule saves but are omitted from project/recovery state

- `site/app.js`: v2-only `bridge.setSectionViewport` mutates the independent `sectionViewport`, calls `renderSection()`, and **unconditionally calls** `markViewDirty()` for every gesture update.
- `site/controllers/workspace-persistence-controller.js`: `scheduleView()` marks view state dirty and schedules `persistNow()` when write access is available.
- `site/app.js`'s project-state `getState`, `applyState` and `site/controllers/project-state-controller.js`'s `buildProjectSnapshot`, `loadProjectSnapshot`, `resetProjectState` **do not include/reset** `sectionViewport`, unlike `planViews` and `threeCamera`.

**Deterministic effect:** Section Pan/Zoom does not survive project serialization/recovery; after switching/importing a project or resetting Base, the previous project's in-memory Section zoom/pan may incorrectly carry into the new geometry. Meanwhile each drag schedules view persistence of snapshots containing no corresponding viewport change. This is a correctness/recovery-contract defect, with a potential performance cost for complex examples.

**Reproduction on a real browser:** Open real v2; set Section Pan ≠0 and Zoom ≠1; export/save and reload/restore; compare viewport. Without page reload, open another project or create a new Base; confirm the old pan/zoom is still applied. Use an imported M3D project for the autosave-cost check. No schema modification is pre-authorized by this audit.

**Required repair:** Specify one consistent Section view persistence policy, ideally matching Main/3D view state. Add backwards-compatible project snapshot/validation/restore and explicit reset on project reset/new import; or intentionally make Section ephemeral, reset it on project transition, and remove the misleading `scheduleView` path. Include all recovery and migration tests.

### D1-AUDIT-02 — P1: native overlays are not members of the shared overlay state machine

- `site/ui-v2/overlay-manager.js` maintains `active` for `mount`, `close`, and `adoptPopover`.
- New `adoptNativeViews(panels)` only stores original `details` and `[data-view-popover-panel]` in **another local `owners` map**. It never registers them with `active`, and its `sync` method only closes panels on invisibility. Custom dialogs do **not** signal cross-view exclusivity when opened; toggle listeners are installed on `details` only.
- `site/ui-v2/real-view-bridge.js` wires `nativeOverlayOwners = shell.overlays.adoptNativeViews(...)` after app bootstrap. The shell's public `overlays.close('popover')` cannot close those adopted original native details.

**Executed source-level reproduction:** With a native `details.open=true`, after `adoptNativeViews`, `close('popover')` leaves the menu open. This means the “unified portal” is still a partial lifecycle wrapper; it cannot guarantee one exclusive active overlay or a single focus/escape/backdrop contract. In overview/split, an inline Section Z Break dialog opened after a different view's More may coexist with it. This second scenario must be checked in a real browser; it was not run.

**Required repair:** Unify native-menu/dialog ownership with the existing manager **without cloning original nodes or breaking controller-owned Z Break modal reparenting**, and retain original `closest('.view-panel')`, event listeners, Escape, focus return and `aria-expanded` semantics. Tests must cover original More↔ROI↔Z Break transitions across visible simultaneous views and hidden views, including temporary `document.body` modal placement.

## Additional risks and acceptance holes

### D1-AUDIT-03 — P2: Pan/Zoom vs Section Detail drawing modes are not exclusive in the toolbar

`site/ui-v2/real-section-controls.js` bypasses its gestures while `#sectionCanvas.section-detail-drawing` is active, but leaves the Pan/Zoom `aria-pressed=true` state displayed. The Section Detail ROI controller switches drawing state without resetting Pan/Zoom. Upon finishing Detail drawing, a subsequent canvas drag may immediately act as Pan/Zoom. This is an **independently visible state-design discrepancy from source**; reproduce at 390/768/1440px and settle an explicit single active tool state. Avoid a second editor/renderer.

### D1-AUDIT-04 — P1 acceptance gap: added Section browser tests rely mostly on compositor-owned metrics

`scripts/v2/check-d1-extended.mjs` checks `sectionViewportZoom`, `sectionPlotLeft`, `sectionFrameTop`, `xPxPerUm` and `zPxPerUm` written by the same `renderSection` that it is testing. This establishes internal transform consistency, not necessarily physical material-geometry registration. It does preserve the older **independent Base uncollapsed 1:1 X:Z check at 0.25px** when viewport is reset and physically compares ROI DOM rectangles.

**Required gate extension:** independently calculate expected pixel positions from Slice endpoints, Base thickness and imported model boundaries after **nonidentity** Pan/Zoom; assert actual contour/axis registration, Z Break on/off, Section Detail inset crop, rotated Mask/Slice and physical M3D sidewall features. Do not replace M1.5 reference screenshots or relax the 0.25px assertion. Check real drag frame cost when the Detail inset is open, as each `setSectionViewport` synchronously redraws Section and `sectionDetailRoiController.sync()` may also redraw the inset.

### D1-AUDIT-05 — Gate blocker, not a code defect: no new full UX / pixel / GPU acceptance

No validated Chromium result exists for `c63d403`, and no Windows-approved M1.5 screenshots or real hardware GPU samples have been produced for this revision. The older **36 browser cases, 586/586 Node tests and SwiftShader results belong to `8408352`** only. PR workflow absence is **unknown status**, not passing.

## Required closure order — do not start D2

1. Fix and test **AUDIT-01** recovery/project transitions first, preserving schema migration and µm storage.
2. Fix and test **AUDIT-02** original-node portal ownership, Escape/focus, Main/Mask/Section/3D menu transitions, and modal/inline cases; settle **AUDIT-03** tool-mode semantics.
3. Execute `npm ci`, full `npm test`, lint, changed-file Prettier, docs/contract generation checks, legacy smoke/workstation/View UX and all **Base/Photodetector/M3D × three D1 runners × four widths**. Additional nonidentity projection browser checks from AUDIT-04 must pass.
4. Inspect actual four-width M1.5 real UI screens against approved references and repeat hardware GPU evidence on Windows. Distinguish ANGLE SwiftShader from physical RTX GPU; never invent timings or pixel PASS.
5. Only after independently passing all gates request explicit D1 handoff/route-convergence review. No main merge, no baseline replacement, no D2 and no unnecessary PR/CI workflow dispatch.

This audit did **not** edit product source, test tolerances, CI configuration, fixture geometry, approved baselines, or production routing.
