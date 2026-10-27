# Production Workstation contract

**Current product shell and interaction ownership**, reviewed against
`main@90fb168` (2026-10-24). This is the maintained shell contract.
The former M0 DOM inventory is
[historical evidence](../archive/ui-v2/CONTRACT.md), not the current
set of selectors.

## Shell and stable ownership

`site/app.html` boots `site/ui-v2/workstation-entry.js` and the
M2.5 presentation shell in `site/ui-v2/workstation-v2.js`. The
shell constructs layout, stable hosts, navigation, popover/dialog/toast
portals and status presentation. It **does not** own canonical physics,
Mask geometry, Process mutation, History graph or persistence transactions;
those responsibilities remain with the runtime, controllers and Workers.
Domain adapters and the presentation API feed it state. Domain state must
not be fabricated or duplicated inside CSS/view components.

Stable shell hosts include `topbar.project`,
`navigation.primary`, `panel.{project,base,mask,process,history}`,
`panel.process.{step,recipe,code,diagnostics}`,
`portal.{popover,dialog,toast}` and
`status.{message,save,version}`. Scientific panels use the
`view.{main,mask,three,section}.{header,actions,stage,readout,overlays}`
slot family. Producers must mount into these named hosts rather than
replacing the shell root or assuming an old Legacy DOM ID. The
`site/ui-v2/view-kit/` components own shared view chrome and controls.
Specific slots are resolved by `getSlot`; downstream modules own their
actual content and cleanup.

## Desktop, compact UI and inspection

Production desktop uses the Project/workflow sidebar and four
scientific view hosts. **Overview** restores the shared arrangement;
individual Main, Mask, 3D and Section controls change visible
panels without changing process geometry. Desktop docking, resizing,
maximize/restore and saved layout state belong to the dedicated
`view-layout-*` and docking/resizer controllers, not global CSS hacks.

On compact screens the shell reuses stable navigation controls in
the fixed bottom Edit/View dock; it must not instantiate a second
independent editor or lose focus and panel state on reparenting.
Preview mode remains read-only and must not take Workspace writer
ownership or reset the editable project's state. Fit/pan/zoom and
display preferences are **view state**, not material operations.

Main and Mask are synchronized where they share XY inspection inputs,
but their roles differ: **Mask ROI** participates in Process/Mask area
selection while **Main ROI** crops 3D visualization/export. Section
uses A–B; a 3D ROI does not define that line. The 3D Display settings
(opacity, continuous vertical scale, Show Origin and Border) are
presentation-only; see the
[Renderer contract](../renderer/RENDERER_CONTRACT.md).

## Process, History and transactions

`site/controllers/process-panel-controller.js` assembles Manual
operations; Recipe text is parsed by `site/process-recipe.js`
and preflighted before any canonical Worker mutation.
`site/controllers/history-mutation-controller.js` implements
Step editing/insertion and checkpoints Recovery before destructive
timeline rewriting. A successful Apply records an atomic Step; a
failed, stopped, aborted or no-change operation must not leave an
invented physical Step. The Process Worker computes a candidate and
validates it before commit.

History begins at the editable **Step 0 · Starting Wafer**. A later
Step carries an exact restorable state and, where supported, a
versioned replay descriptor. Restoring/inspecting a historical Step
does not itself mutate the current Variant HEAD. Applying from an
older Step either takes an explicit branch or the authorized
continuation transaction; dependent Variants are protected through
copy-on-write. Normal Undo/Redo must follow the same History graph as
History-panel navigation. Changes to display/camera/ROI do not
become new physical Process Steps. For user actions see
[History, Variants and Recovery](../wiki/History-Variants-and-Recovery.md).

`site/controllers/workspace-persistence-controller.js` separates
browser-local Save/Recovery checkpoints and view-state persistence
from portable `.wafercad` Export. Cross-tab lease ownership must
block stale writers after takeover; reload, failure recovery and
transaction rollback may never silently throw away a validated
workspace. `workspace-session-controller.js` owns session writer
leases. The shell's status and dialogs reflect these outcomes; do
not implement independent persistence from a view component.

## Tests, revisions and limitations

- Local shell/slot and docking contracts: corresponding
  `site/tests/` unit owners and real
  `scripts/v2/check-*` workstation, docking and mobile captures.
- History/Recovery: `npm run test:ui:state` plus required
  scientific/transaction/Worker fault owners.
- UI/Renderer/Example changes: examine **real native Chromium**
  results and the actual painted frame, never substitute mock
  screenshots or source-only SVG diagrams.
- Manual state/Worker Open/History/IndexedDB acceptance needs a
  **normal Origin**. Headed null-Origin 3D diagnostics are useful
  but do not prove full Workstation readiness.
- The old [M0 DOM snapshot](../archive/ui-v2/CONTRACT.md),
  [Main extraction audit](../archive/ui-v2/MAIN_ARCHITECTURE_HEALTH_2026-10-11.md)
  and [progressive startup PR #188](../archive/ui-v2/PROGRESSIVE_STARTUP_2026-10-13.md)
  are retained verbatim as dated evidence, not editable production
  ownership lists.

Use [Architecture](../ARCHITECTURE.md) for module boundaries and
[CI](../CI.md) for mandatory source-bound verification.
