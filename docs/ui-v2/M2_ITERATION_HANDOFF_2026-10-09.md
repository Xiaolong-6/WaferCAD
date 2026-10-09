# UI v2 M2 iteration handoff — 2026-10-09

## Handoff state

- Repository: `Xiaolong-6/WaferCAD`.
- Branch: `codex/ui-v2-m2-handoff-2026-10-09` (created from the approved M2 integration branch `refactor/ui-v2-m0`).
- Product checkpoint: `0d5fb4e` (`fix(ui-v2): refine M2 mask legend and history controls`).
- Publication: pushed to the user-confirmed origin `https://github.com/Xiaolong-6/WaferCAD.git` as `origin/codex/ui-v2-m2-handoff-2026-10-09`; the branch includes the product checkpoint and subsequent documentation updates.
- Integration base: `b81598b` (`perf(renderer): single-pass smooth transparent material caps (#164)`) is included in this branch. Publication-time refresh successfully fetched main at `fbbc261c02836a2c15f9c13b2951ea0ff2a4c7aa`. Its two newer commits, `21b2318` (baseline formatting) and `fbbc261` (transactional Lift-off), have not been merged into this M2 handoff. Their changed paths do not include `site/ui-v2/` or `scripts/v2/`; the Process/Recipe contracts and documentation do change.
- Fetch note: the local default fetch configuration includes the deleted `feat/mask-file-draw` branch, so ordinary `git fetch origin` fails. The main refresh used `git fetch origin refs/heads/main:refs/remotes/origin/main`. No local fetch configuration was changed.

## Scope delivered

This is still the M2 isolated v2 shell: native DOM templates and local mock drafts only. It does not connect or mutate the production scientific model, History, Recipe transaction, project persistence, renderer, or import/export implementation. Legacy `app.html`, controllers, workers, and scientific modules are untouched.

- Project owns XYZ display units; Manual Undo/Redo sits under Apply. Unit display and input conversions are covered by the shell check.
- Mask Draw controls live in one canvas floating toolbar and appear only when the Mask source is Draw. ROI visibility and ROI/alignment settings remain independent controls in that same canvas toolbar/floating settings panel. Draw actions use distinct inline SVG icons; icon size is 16px and controls retain 40px targets.
- Section Legend rows have a palette button with 12 preset colors and a Random color action. These update only the local UI color draft; the source project remains frozen and no material/render mutation is performed.
- History is a compact Step-first tree. The selected-step summary/actions stay fixed while the tree/bookmarks scroll independently; selecting a Step retains the list position. Every Step has an anchored `⋯` menu for Select as cursor, Restore from here, Edit from here, and Create Variant from here. These are labeled prototype walkthroughs, not production History transactions.
- Main/3D mock ROI alignment remains exactly 0px at 1440px and 1024px in the existing registration-plane probe. This does not establish the real-renderer cause behind PR #161 as fixed.

## Main implementation files

- `site/ui-v2/mock-domain-panels.js` — Project unit control, Process controls, compact History tree and per-Step menu.
- `site/ui-v2/mock-views.js` / `site/ui-v2/mock-workspace.js` — Mask source-dependent Draw controls, independent ROI, local draft behavior, palette/History actions.
- `site/ui-v2/section-legend.js` / `site/ui-v2/view-icons.js` — Legend preset/random palette and inline SVG icon.
- `site/ui-v2/workstation-v2.css` / `site/ui-v2/workstation-v2.js` — floating toolbar styling, fixed History actions, independently scrolling tree, scroll retention.
- `scripts/v2/check-m2-shell.mjs` — DOM/interaction checks for these decisions plus prior M2 shell contracts.
- `docs/ui-v2/M2_GAP_AUDIT.md` — superseding scope audit and exact validation summary.

## Reproduce and validate

Start the save-triggered local preview from the repository root:

```powershell
node scripts/v2/serve-v2.mjs
```

Open `http://127.0.0.1:4182/app-v2.html?live`. It serves only localhost, disables caching, and reloads connected tabs after changes under `site/app-v2.html` or `site/ui-v2/**`. Current preview was probed with HTTP 200. A live reload discards mock draft values; sessionStorage-backed view mode is retained.

Checks run on Windows, Node `v26.7.0`, native Chrome `155.0.8059.40`:

- `npm run lint` — passed.
- `node --test scripts/v2/view-state.test.mjs` — 5/5 passed.
- `node scripts/v2/check-m2-shell.mjs` — 25 checks passed, no page/console errors; includes 1440/1024 ROI probe, 768/390 flow, Draw-vs-File visibility with independent ROI, preset and random Legend colors, History action menu and retained scroll, and frozen real fixtures.
- `git diff --check` — passed.
- No Playwright and no screenshots were used for this quick iteration; this was not an M4 visual-baseline run.

## Next work / boundaries

- M3 starts only after explicit user approval. Integrate the existing shell with production controller/service ownership incrementally; do not promote `mock-workspace.js` to a second domain core.
- Re-run the Main/3D ROI alignment and pointer-path acceptance against real renderers before declaring PR #161 resolved.
- Track the five unresolved dynamic expressions individually in M3; they are not covered by this M2 check.
- Confirm the browser with the user before producing M4 visual baselines.
- Re-fetch and inspect latest `origin/main` before further integration. Reconcile the newly shipped Lift-off operation with v2 Process/Recipe controls and the M0 control inventory when M3 is approved; the current mock operation list does not include Lift-off.
- No default-entry switch, deployment, manual CI, or force-push is authorized by this handoff.

## Revision

- Product code commit: `0d5fb4e`.
- Handoff commit: recorded in Git history after publication.
