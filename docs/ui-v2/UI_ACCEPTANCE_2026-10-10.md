# UI v2 actual UI acceptance — 2026-10-10

**Result: FAIL / UI acceptance remains open. Automated M2.5 shell checks pass.**

Product revision: `5ec5082` on `codex/ui-v2-m2-handoff-2026-10-09`. This review supersedes the blanket “M2.5 passed” wording in the previous [browser acceptance report](BROWSER_ACCEPTANCE_2026-10-09.md). Automated architecture and interaction probes are evidence for their named contracts, not proof of acceptable visual hierarchy, copy or every toolbar fitting its view.

## Scope and environment

The user requested actual visual/interaction acceptance and then specified that Fit, Pan and Zoom should show icons only, with other toolbar controls unchanged. This round removes those three visible labels in all four mock views, retains their `title`, accessible names and existing action bindings, and removes the specifically reported Legend developer footer. Other controls, layout and domain behavior are retained for review. Prettier also normalizes existing formatting in `mock-views.js`.

No shell/domain ownership changes, M3 wiring, scientific geometry changes, persistence changes or approved visual baseline changes. Base remains the explicitly requested physical-size **mock draft**. A mock boundary remains necessary; development vocabulary repeated inside ordinary workspace controls is a separate UI defect.

Visual review used the Codex in-app browser at `http://127.0.0.1:4182/app-v2.html?live` and a temporary non-live tab to avoid source-save reloads resetting interactions. Windows NT `10.0.26300.0`, Node `v24.16.0`; the automated CDP runner used native Chrome `155.0.8059.40`. Locked dependencies were installed earlier with `npm ci`; no dependency changes followed. In-app browser screenshots are human-review evidence, not approved Chrome pixel references.

## Actual review coverage

Dimensions below are measured browser viewport dimensions, not inferred from filenames. This is a targeted review, not all 258 rows of the [source parity audit](FULL_PARITY_AUDIT_2026-10-09.md).

| Surface / scenario                | Actual viewport                     | Observation                                                                                                                                                                |
| --------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M3D Overview / Manual             | 1440×900 and initial normal preview | Fit/Pan/Zoom labels absent; other toolbar labels retained. Apply hierarchy still poor.                                                                                     |
| Project / Base                    | 1440×900; Base dialog at 1280×720   | Width edit to 75 µm and Keep confirmation work as a draft. Remaining copy is developer-facing.                                                                             |
| Recipe / Code / Diagnostics       | 1280×720                            | Recipe Add/Operation arrangement improved by earlier repairs. Code heading/copy is verbose; Diagnostics exposes M3 implementation language.                                |
| Manual Apply simulation           | 1280×720                            | Busy fields lock; explicit Complete simulation finishes. Undo/Redo remain disabled without field edits. This is mock draft editing, not result History undo.               |
| Manual field Undo                 | 1440×650                            | Coverage change enables Undo, which restores Direct and enables Redo. Actual typed Layer name edit also enables Undo and restores its prior value.                         |
| History M3D                       | 1280×720                            | Real wheel reaches final Step 36: scrollTop 2313, clientHeight 435, scrollHeight 2749 (rounding within 1 px of bottom).                                                    |
| History Photodetector             | 1280×720                            | Variant ellipsis → Rename → type `UI review branch` → Enter succeeds. Menu absent after save. Dialog visual spacing remains poor.                                          |
| Mask maximized / More             | 1280×720                            | More exports visible; Escape closes menu and restores trigger focus. Fit/Pan/Zoom buttons click through existing mock feedback; pointer geometry remains an M3 boundary.   |
| Overview Photodetector            | 1024×768                            | Section title bar overflows; Mask floating toolbar scrolls horizontally.                                                                                                   |
| Manual normal-flow compact editor | 768×900, 390×844                    | No document horizontal overflow; controls remain reachable through scrolling. Apply/Undo/Redo composition remains awkward.                                                 |
| Section / Legend                  | 390×844                             | Legend below plot; clicking color square opens an in-viewport palette; choosing `#D6A85F` updates the swatch and closes it. Section More/Max require horizontal scrolling. |
| Recipe short window               | 1440×650                            | Real wheel reaches last Recipe Step 35.                                                                                                                                    |

Production-safe placeholder entry and direct `file://` boot were covered by the automated runner, not accepted as a completed production UI by this visual review. Scientific execution, actual renderer manipulation, saved project recovery and every operation-specific form were not reviewed here.

## Findings and disposition

| ID    | Priority | Status            | Reproduction / evidence                                                                                                                                                                                   | Required outcome                                                                                                                                             |
| ----- | -------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-01 | P2       | Fixed / rechecked | All four view headers previously repeated Fit/Pan/Zoom text.                                                                                                                                              | Icons only; retain names, hover hints and actions. Other tools unchanged.                                                                                    |
| UI-02 | P1       | Fixed / rechecked | Legend footer exposed `源标签只读 · 调色仅作用于本地 UI draft`.                                                                                                                                           | Remove this footer. Color square/palette interaction still works.                                                                                            |
| UI-03 | P1       | Open              | Photodetector Overview at 1024×768; Section at 390×844. Section header has a horizontal scrollbar and More/Max outside its initially visible area.                                                        | Keep important header actions discoverable and reachable without horizontal hunting. Preserve the user's other tool labels.                                  |
| UI-04 | P2       | Open              | Mask floating Draw toolbar in Overview, especially 1024×768: clientWidth 321 vs scrollWidth 519. Rightmost settings/actions need horizontal scrolling.                                                    | Define compact toolbar overflow behavior rather than squeezing the full floating strip into each small plot.                                                 |
| UI-05 | P1       | Open              | Manual at desktop and phone: full-width Apply, then two small outlined Undo/Redo, then a large “Review before applying” block. Apply simulation alone leaves Undo/Redo disabled; field edits enable them. | Make the group visually coherent and clarify draft-edit undo versus operation History. This finding does not authorize real M3 process undo.                 |
| UI-06 | P1       | Open              | Project Recovery mentions IndexedDB/writer lease; Diagnostics mentions named slots/M3; dialogs say draft; footer repeats no core connection/persistence/autosave; readouts expose cursor IDs and `um`.    | Use ordinary user-facing language and one clear preview limitation. Retain truthful limits without exposing implementation details throughout the workspace. |
| UI-07 | P2       | Open              | Variant rename dialog at 1280×720: action row touches the input/focus outline. Branch menu remains visible in the dimmed background while the dialog is open.                                             | Add deliberate content/action spacing; dismiss the initiating menu when transitioning into a dialog.                                                         |
| UI-08 | P2       | Open              | Code at 1280×720: long fixture/Recipe name wraps into a large heading, followed by a prominent implementation disclaimer and a separately scrolling editor.                                               | Reduce introductory copy and heading height so editing gets the primary space.                                                                               |

Open items are recorded rather than silently declared acceptable. This round preserves other controls as requested; it does not mark the above issues fixed. Repeat the relevant viewport/scenario after each repair before closing its row.

## Automated verification on the final product source

| Exact command                                                                                                             | Result                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `$env:WAFERCAD_REVIEW_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe'; node scripts/v2/check-m2-shell.mjs` | Exit 0; 44 named checks, captured errors `[]`. Adds a 12-button icon/name/title assertion and absence of the Legend footer. |
| `node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs`                                       | Exit 0; 8 passed, 0 failed.                                                                                                 |
| `npm run lint`                                                                                                            | Exit 0.                                                                                                                     |
| `npx prettier --check site/ui-v2/mock-views.js site/ui-v2/section-legend.js scripts/v2/check-m2-shell.mjs`                | Exit 0.                                                                                                                     |
| `git diff --check`                                                                                                        | Exit 0.                                                                                                                     |

Formatting used `npx prettier --write site/ui-v2/mock-views.js site/ui-v2/section-legend.js` and `npx prettier --write scripts/v2/check-m2-shell.mjs`, both exit 0. The full legacy browser suite and M4 visual comparator were not run. No baselines were replaced, merge/deployment performed or manual CI dispatched.

`npm run docs:check`: final exit 0 (112 Markdown files, 415 internal links, 92 reachable docs). The first run failed because the existing `VISUAL_POLISH_2026-10-09.md` was unreachable from `docs/README.md`; adding its historical navigation link resolved that failure. Focused Prettier checks on all four changed documentation files also passed.

## Reproduction and evidence

Serve the exact product revision with `node scripts/v2/serve-v2.mjs` (port 4182), open `app-v2.html`, select M3D or Photodetector as listed, use the primary domain buttons and Process mode tabs, and set the measured viewport. At 1024 use Overview; at 390 choose Section in Single mode. Use actual wheel input inside the relevant editor/tree, not setting scrollTop programmatically. For History rename use the Variant ellipsis, not the Step ellipsis.

Supporting screenshots are ignored local files under `test-results/ui-v2-acceptance/`:

- `ui-before-2026-10-10.png`, `ui-icons-final-2026-10-10.png`.
- `ui-project-1440.png`, `ui-base-dialog-1280.png`.
- `ui-recipe-1280.png` (captured while Manual simulation was still busy), `ui-code-1280.png`, `ui-diagnostics-1280.png`.
- `ui-history-bottom-1280.png`, `ui-history-rename-1280.png`, `ui-mask-1280.png`.
- `ui-overview-1024.png`, `ui-manual-768.png`, `ui-manual-390.png`, `ui-section-390.png`, `ui-legend-palette-390.png`, `ui-recipe-bottom-1440x650.png`.

The committed findings and reproduction steps are the shared handoff; local screenshots alone are not. Product and this report are pushed to the previously authorized feature branch. **Automated shell PASS remains valid; overall UI acceptance is FAIL / open until the open findings are repaired and visually rechecked.**
