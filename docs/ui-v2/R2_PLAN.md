# WaferCAD UI v2 Refactoring Plan r2 (Agent Execution Version)

> Changes from r1: an M1.5 UX prototype hard gate; explicit Workstation assembly rewrite; separate legacy/v2 testing tracks; a globally light theme; user selection of Recipe placement after prototype comparisons; no legacy entry migration in M5; and a three-part completion standard covering function, visuals and workflow.

## 0. Goals, scope and rules

**Goal:** deliver a consistent, usable WaferCAD interface (new design system and workspace layout), functionally equivalent to the existing product, and switch the default entry only after acceptance. The objective is a usable product interface, not merely cleaner CSS.

**Follow `AGENTS.md`:**

- Geometry is stored in µm; display scaling, ROI and morphology must not change canonical stored geometry.
- Preserve project migration, worker transactions, History restore and browser recovery contracts.
- Never change visual baselines to conceal failures. **Keep the existing baseline unchanged**; create a separate new one only after human review and approval.
- Run `npm ci`; report commands, results, commit and environment. Do not force-push or trigger expensive manual CI.

**Prohibited changes (read-only dependencies):** `site/model*.js`, `process-*.js`, `project-*.js`, `workspace-snapshots.js`, `workspace-persistence*.js`, `three-view.js`, `plan-renderers.js`, `oasis.js`, `gds.js`, `*-worker.js`, and `vendor/`. If a change is needed, document it in `docs/ui-v2/ISSUES.md` and report to the user first.

**Explicitly allowed to rewrite:** the UI assembly portion of `site/workstation-ui.js` (`createRail / createTopbarControls / createViewbar / createViewStage / setupToolFlyout`), workstation startup self-checks in `app.js` (around line 1667 at this revision), `welcome.js` entry navigation within the v2 channel, and controller DOM bindings/class names. **Preserve** single/overview/split behavioral contracts and the historically named storage keys (`wafercad.workstation-view-mode.v1`, `wafercad.workstation-split-views.v1`). Verify the actual storage scope from source rather than trusting the original plan's `localStorage` wording.

**Strategy:** run old and new entries in parallel. Keep legacy `app.html` and its assets at their original paths to avoid breaking relative assets, Worker URLs and hardcoded `welcome.js` routes. Create the new entry at `site/app-v2.html`, with assets under `site/ui-v2/`.

**Completion rule:** finished components, 100% ID inventory coverage, reduced CSS size and green CI are each necessary evidence, but none alone is sufficient. Every workspace must pass all three criteria: (1) correct functionality, (2) fidelity to the approved prototype, and (3) a usable real interaction flow verified against §4.

## 1. Known problems to address

- Two token families (`--bg…` and `--wc-*`), 483 distinct color values, and mixed 3–7 px radii.
- More than 11 font sizes between 7.5 and 12 px, with many below 10 px.
- 94 `!important` uses and more than 20 discrete z-index values.
- Eight button variants; copied `view-head` HTML across four views.
- `style.css` (5,758 lines) plus `workstation.css` (2,078 lines) relying on late overrides.
- Five right-panel tabs containing nested tabs and several popover variants.
- The failed prior refactor (PR #161): **M0 must establish the root causes first**.

## 2. Phases and checkpoints

**Stop and report at each checkpoint. Do not enter the next phase until the user explicitly approves. Do not silently run multiple phases together.** This is the historical r2 plan; later separately authorized work is recorded in subsequent handoffs.

### M0 — Baseline, contracts, implicit dependencies (complete this only, then stop)

1. `npm ci`; record baseline `lint`, `npm test`, `test:ui:fast` results and note any unavailable browser.
2. Investigate PR #161: read description, diff, comments and CI; record specific causes (layout, assembly, tests) in `docs/ui-v2/PR161_POSTMORTEM.md`. If records cannot be retrieved, state the limitation and request them.
3. Run `scripts/ui-contract-extract.mjs` to generate `docs/ui-v2/CONTRACT.md` and `contract.json`:
   - Every `app.html` ID, `data-*`, role and `aria-controls` target;
   - each ID's caller (`site/**`, `scripts/**`) and element type;
   - dynamically generated markup/classes/structure from `innerHTML`, `createElement`, `classList.add/toggle` and `dataset`.
4. Produce the **implicit DOM dependencies** list `docs/ui-v2/IMPLICIT_DEPS.md`, the most important M0 output:
   - DOM moved, created or reparented by `workstation-ui.js`;
   - `app.js` startup self-checks and creation/binding order;
   - parent/sibling/closest-selector requirements, delegated/bubbling events, `hidden`/`:visible` semantics, CSS-as-state (`.active`, `aria-selected`, `workstation-ui-v2`, `workstation-boot`);
   - test assertions against legacy DOM (`.workstation-rail`, for example).
5. Write the risk register and effort estimates, including assembly rewrite and controller adaptation scope.

**M0 checkpoint report:** static ID total, dynamic class count, implicit dependency count, PR #161 failure causes, risks and estimate.

### M1 — Design system and component gallery

`site/ui-v2/tokens.css` must be the single source of design tokens:

- Approximately 20 semantic colors (surface, border, text, accent, success, warning, danger).
- **Global light theme.** Use surfaces, boundaries and weight to establish hierarchy; no dark global top bar. Scientific canvases may retain independent display themes. Reserve a `[data-theme]` hook, but ship only the light theme in this phase.
- Body/form/action text **12–13 px**, support text **at least 11 px**, titles 15/18 px. No text below 11 px.
- 4 px spacing grid, 4/8 px radii, two shadow levels, documented z-index layers: canvas 0, toolbar 10, panel 20, popover 30, dialog 40, toast 50.

In `site/ui-v2/components.css` define each component once, **without `!important`**: Button (primary/secondary/ghost/icon × sm/md), Field (label/input/unit), Select, Segmented, Tabs, collapsible Section, Popover, Dialog, Toast/Status, Tooltip, Badge, Tree item, Readout.

Use native template functions and ordinary DOM: no Shadow DOM or new framework. Create components **before** controllers bind events. Deliver `site/ui-v2/gallery.html` showing hover, active, disabled, focus and error states.

**M1 checkpoint:** user approval of colors, fonts and control states.

### M1.5 — Complete workspace UX prototypes (hard gate; no M2 without approval)

Show a **realistic complete workspace** using static or semi-static prototypes without connecting the scientific core. Data must reflect the complexity of **M3D and Photodetector** (many layers, long step lists, multiple Variants), not a blank project.

**Mandatory layout comparison:** present at least two or three options, for example (A) left icon rail plus dockable panel, (B) top navigation plus contextual right panel, and (C) left workflow navigator plus bottom History drawer. Describe tradeoffs and avoid the PR #161 failure pattern based on the M0 postmortem. Compare **Recipe as a primary workspace** versus **a Process mode** in the prototypes. The user decides placement; the agent must not decide unilaterally.

Prototype screens and flows must cover:

- Project: new, open, save and Recovery.
- Mask: File/Draw, Cells/Layers, ROI and export.
- Process: operation, parameters, Apply, busy and error.
- Recipe: list, edit, Run All, failed-step location and continue/rebuild.
- History: restore, editing earlier Steps, Variant tree.
- Main/Mask/3D/Section: shared toolbar, Single/Overview/Split, Maximize, Section Z-break and Section ROI.

Review and capture screenshots at **1440 / 1024 / 768 / 390 px**.

**M1.5 checkpoint:** human review of each screen. Iterate if rejected; **do not proceed to M2**.

### M2 — New shell and assembly (layout and interaction only; no scientific wiring)

- Create `site/app-v2.html` and `site/ui-v2/**`.
- Rewrite the v2 Workstation assembly in `site/ui-v2/workstation-v2.js` or equivalent, preserving single/overview/split behavior and storage keys. **Leave legacy `workstation-ui.js` in place for legacy entry users.**
- Instantiate Main/Mask/3D/Section from a shared view-panel template; define common title, More, Export, Maximize and readout once, injecting view-specific tools through named slots.
- Responsive behavior: Single view at width ≤820 px; phone, tablet and desktop must remain operable.
- Mark the document `<html data-ui="v2">` for reliable test routing.

**M2 checkpoint:** demonstrate navigation, view-mode switching, panels and responsiveness with mock data.

### M3 — Controller migration and real wiring (dual acceptance per domain)

Order: view toolbars → Mask → Project/Export → Process → Recipe → History → Section → 3D → Welcome/status bar.

After each domain, require **functional and visual acceptance** against the M1.5 prototype before moving to the next.

- Handle dynamically generated classes from `CONTRACT.md` first. Prefer updating DOM generators to new component classes. Temporary compatibility rules, if unavoidable, belong to `ui-v2/legacy-bridge.css` with TODO markers and must eventually reach zero. Special attention: History/Variant tree, layer legend, Recipe Step list, Mask browser, Welcome cards/thumbnails, Confirmation and process-task dialogs.
- Provide shared Popover/Dialog semantics for Escape, outside click, focus management and `aria-expanded`.
- Route v2 Welcome to `app-v2.html` through a v2-specific entry/parameter, without changing legacy behavior.

**M3 checkpoint:** short per-domain report and final summary covering ID contract, console errors and domain acceptance scenarios.

### M4 — Real-project flows and full regression

**Dual-track testing:**

| Track | Scope | Requirement |
| --- | --- | --- |
| Legacy | All existing scripts against `app.html` | Keep original results and assertions; prove legacy remains intact. |
| UI v2 | `scripts/v2/*.mjs` plus helpers against `app-v2.html` | Every script starts by asserting both `html[data-ui="v2"]` and the v2 URL, preventing false green runs against legacy. |

The v2 track must cover smoke, workstation/navigation/views, History, persistence/Recovery, process geometry, project IO, arrays, examples, interactions and resilience. Reuse geometry/History/storage assertions from legacy, **changing entry/locator adapters only and never weakening assertions**.

Walk through the complete §4 scenarios on M3D, Photodetector and one large-array example.

Maintain an **independent v2 visual baseline directory**, isolated from legacy; **ask the user before creating or updating** any visual baseline.

**M4 checkpoint:** dual-track matrix, failures, manually checked `docs/ui-v2/MANUAL_CHECKLIST.md`, and a decision on approving the v2 baseline.

### M5 — Isolated preview, switching and cleanup

1. Deploy an isolated Preview, without overwriting the existing Pages entry, for user review.
2. Switch the default entry (`index.html` / Welcome route) **only after explicit approval**. Keep legacy `app.html` and its assets at the same path for at least one release cycle for rollback.
3. Remove unused mappings in `legacy-bridge.css`; target v2 CSS under 3,000 lines, ≤5 `!important` directives, colors sourced only from tokens and text ≥11 px.
4. Update `docs/ARCHITECTURE.md` (UI layer) and `docs/testing.md`; add `docs/ui-v2/README.md` for tokens, components, new control workflow and dual-track tests, plus handoff.

## 3. Definition of Done

- [ ] Every workspace meets all three: function, prototype visual fidelity and workflow (§4).
- [ ] Contract IDs exist and behave correctly in the v2 shell (necessary, not sufficient).
- [ ] Legacy tests match their baseline and the v2 track passes (visual baselines follow M4 separately).
- [ ] Prohibited core files have an empty `git diff`, except minimal changes explicitly approved by the user.
- [ ] All §4 scenarios work at 1440 / 1024 / 768 / 390 px.
- [ ] The old entry is available for immediate rollback.

## 4. Required hands-on workspace acceptance scenarios

- **Recipe:** open existing Recipe → change parameter → Run All → locate failing Step → repair and continue/rebuild → inspect Main/3D/Section.
- **Process:** choose operation → enter parameters → Apply → busy state → verify error rollback/model unchanged → verify all three views after success.
- **History:** return to an old Step → edit and create Variant → switch Variants → restore.
- **Mask:** import GDS/OASIS → choose Cell/Layer → draw a Draw Mask → set ROI → export SVG/GDS/OASIS.
- **Project:** new → save/export → import → refresh and Recovery → open example.
- **Views:** switch and remember Single/Overview/Split; Maximize; Section Z-break and detail ROI; 3D Fast/Quality and GLB/PNG export.

## 5. Report format and agent constraints

- Each report: one-sentence status → changed files → exact commands/results → unresolved items → questions needing user decisions. Include branch and commit SHA.
- Put key decisions under `docs/ui-v2/`, not solely in chat.
- **Carry out M0 and stop first**; do not prematurely write CSS or create the new sidebar.
- Document unanticipated coupling or prohibited-file changes in `ISSUES.md` and report before proceeding.
- Do not split modules to reduce line count or rename core exports.
- Do not declare success based only on completed components, coverage percentage, line count or green CI.
- For long multi-step coding or generation tasks, obtain user authorization before moving beyond the next checkpoint.
