# M2: Standalone Mock Shell and Live Preview

> Subsequent correction (2026-10-09): M2 mock interfaces and local draft interactions for G01–G08 were completed. The original self-review and 19 checks were superseded by the 25-item review in [M2_GAP_AUDIT.md](M2_GAP_AUDIT.md). Upstream `origin/main` was merged. This update does **not** establish M3 core wiring.

> Handoff update (2026-10-09): The rapid M2 iteration added History row action menus, fixed action bars/internal scrolling, separation of Mask Draw from ROI, and Section Legend preset/random colors, as documented in the [M2 iteration handoff](M2_ITERATION_HANDOFF_2026-10-09.md). That handoff supersedes the original M2 iteration/status below. The UI still uses mocks, without real M3 domain transactions.

Date: 2026-10-09. Branch: `refactor/ui-v2-m0`; HEAD: `c7856da2b81aaea4c088d0d5f7cd4489e8e4d1e2`.
The user approved M2. Rapid iteration initially prohibited committing; a later instruction explicitly allowed a local checkpoint commit. Do not enter M3, connect the scientific core, or push at this historical checkpoint.

## Approved UI decisions

- Layout A: horizontal navigation above the left functional panel, with left panel and right viewing area side by side.
- Primary navigation: Project / Mask / Process / History / Hide; inside Process: Manual / Recipe / Code.
- Font B: local Inter Variable WOFF2 with a system fallback (at the time, Chinese used the system fallback).
- Hide collapses both navigation and panel; Restore panel appears to the left of Single without adding a separate row.
- All view tools share the header row after the title: Fit / Pan / Zoom → view-specific controls → More → Max / Restore. Export belongs exclusively in More.
- More is an anchored popover supporting outside click, Escape, focus return and arrow keys.
- Mask displays Cells/Layers; choosing Mask defaults to maximizing that view.
- History preserves list scroll, panel scroll and page scroll positions.
- Global light theme; body/actions 12–13 px, supporting text ≥11 px; no `!important`, Shadow DOM or new runtime dependency.

## Entry and preview

- Static entry: `site/app-v2.html`. Openable directly with classic scripts; no module fetch or build required.
- Live preview: from repository root run `node scripts/v2/serve-v2.mjs`, then visit `http://127.0.0.1:4182/app-v2.html?live`.
- Listens on localhost only, disables caching, and sends an SSE reload after saving `app-v2.html` or `ui-v2/**`.
- A prior sandbox server was listening but unreachable from the local browser. The task-owned server was restarted in the host environment and returned HTTP 200; a save-generated live reload was verified.
- The page displays both mock status and live-connection status. Reload resets local mock drafts; view mode is retained according to its sessionStorage contract. No project data is written.

## Layering and startup order

1. `view-state.js`: mode/split defaults, deduplication, swapping and sessionStorage keys equivalent to legacy.
2. `view-icons.js` / `native-components.js`: ordinary DOM templates and inline SVG; More owns its positioning and focus behavior.
3. `view-panel.js`: shared Main/Mask/3D/Section template registry; stable panel/content host identities without canvas cloning. `section-legend.js` supplies layer/annotation templates and local UI color drafts, not model state.
4. `workstation-v2.js`: assembles navigation, panel slots, views, top bar, splitters and status; receives domain UI/view content through explicit callbacks and does not read Recipe, History, fixtures or scientific core directly.
5. `mock-data.js`: read-only display data derived offline from existing examples.
6. `mock-domain-panels.js` / `mock-views.js`: mock domain panels and source-based illustrations, without scientific execution or a real renderer.
7. `mock-workspace.js`: M2 mock state, simulated behavior and event bindings; each domain will be replaced by a real M3 adapter, not treated as a second scientific kernel.
8. `shell-preview.js` / `live-preview.js`: independent review controls and optional development preview.

All files load through ordered `defer`. Interactions bind only after the first assembly is finished. The outer Workstation and view content hosts retain object identity across switches, hiding and History updates.

The shell accepts slots through `getProjectName` / `renderEditor` / `renderView`; original services continue to own rendering and transactions when wired in M3. Legacy `app.html`, `app.js`, `workstation-ui.js`, controllers, scientific core, workers and persistence were neither modified nor imported.

These are mock view containers: this checkpoint did not establish coverage of every real control ID. Controller wiring and dynamic controls belong to M3. The full [remaining gap audit](M2_GAP_AUDIT.md) records History tree, Manual parameters and Recipe-builder gaps instead of claiming complete coverage.

## Section Legend completion

At desktop width, Legend sits alongside the section at 180 px; at 768/390 px, it moves beneath the Section canvas without covering it. A Legend button collapses/restores the panel.

The display uses real layer names, original colors, stable IDs and historical-cursor model data. The Photodetector's two current Implant annotations are listed separately; profile and visibility are read-only. Each row offers a preset palette and Random color control, changing only the local UI draft.

Legend and Section plot hosts keep their identities, and the list scrolls. The model source is frozen; choosing a color does not mutate scientific data or invoke/copy a model mutation. Real rename/visibility/color/profile integration remains M3 work.

## Modes and run feedback

Retain the sessionStorage semantics of `wafercad.workstation-view-mode.v1` and `wafercad.workstation-split-views.v1`.

At width ≤820 px use Single; if not previously stored, 821–1120 px defaults to Main and ≥1121 px to Overview. Split uses different views on each side, swapping when selecting the other side's view. Section is an independent dock; narrow-screen access does not introduce another persisted view mode.

Manual illustrates one operation. Recipe illustrates ordering, multi-step progress and locating a failed Step; busy status locks parameters. Code Apply/Format are explicitly mock UI only, with no parser connection and no claim to modify an effective Recipe. Simulated success, failure and cancellation do not change the model, real History, Recovery or project storage.

## Early ROI-specific check

Without core wiring, compare Main and 3D mock ROI `DOMRect` top/bottom boundaries using matching physical-µm `viewBox` coordinates.

At 1440 and 1024 px, the top and bottom deltas were both **0 px**, within the unchanged 0.25 px strict threshold; the 1.7857 px PR #161 error was not normalized away.

Main uses actual source polygons; the 3D pane is an existing final thumbnail with an explicitly mock orthographic ROI overlay. **This is not a real 3D projection-alignment acceptance test.** After M3 connects the actual renderer, pointer paths and physical ROI alignment still require revalidation; this mock check cannot establish that PR #161's actual rendering cause is resolved.

## Verification and environment

Windows, Node `v26.7.0`, native Chrome `155.0.8059.40`. This was not an M4 visual-baseline browser selection.

- `npm ci`: passed in the authorized local permission mode, 81 packages, zero vulnerabilities; initial sandbox EPERM was recorded and retried.
- `node --test scripts/v2/view-state.test.mjs`: 5/5 passed, comparing legacy mode behavior, Split, sessionStorage, rejection of storage and coarse-pointer narrow-width behavior.
- `node scripts/v2/check-m2-shell.mjs`: 19 checks passed; isolated v2 URL and `html[data-ui=v2]` startup guard, navigation, stable slots, Hide, view-mode persistence, Split exchange, Manual/Recipe, Code, History scrolling, menus, four widths, empty History, source Variant counts, font, `file://` startup and Legend. Variant tree relationships had not passed; see gap audit.
- Native Chrome had zero page/console errors; no Playwright, screenshots or baseline creation/replacement.
- ESLint/Prettier checked only new M2 files; the 18 preexisting main formatting failures were intentionally left untouched.
- `node scripts/v2/build-m2-mock-data.mjs` confirmed deterministic fixture generation; no scientific model execution.

## Outstanding decisions / next steps at this checkpoint

- This file preserves the original M2 checkpoint. A subsequent authorized rapid iteration was handed off on a separate branch; see [iteration handoff](M2_ITERATION_HANDOFF_2026-10-09.md) for accurate branch, commit and publication status. Do not trigger CI or change the default entry as part of this original checkpoint.
- `origin/main` advanced to `b81598b7d8f4c5e7d246df250c82b9de4c2d4178`. Workstation view-mode implementation was unchanged relative to the baseline. The previously uncommitted iteration did not create a merge commit or leave a merge in progress; upstream still needed synchronization before real wiring.
- Five unresolved static/dynamic expressions remain for M3 and cannot count as completed contract coverage.
- Ask the user for browser and baseline approval before creating the M4 visual baseline.
