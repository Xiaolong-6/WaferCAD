# Recovery / Project Open / Welcome Import safety audit — 2026-10-09

## Scope and baseline

Source: `main` at `fbbb2f9f3a585574e20ed706c34653164f13440c`. Isolated fix: `fix/recovery-open-startup-safety-20261009`.
Review covers in-workspace Project Open, Mask GDS/OAS import, Welcome staged project/layout import, bundled Welcome examples, local Recovery checkpoint failure, startup restore ordering, and cross-tab autosave ownership. Kernel, renderer, project schema, persistent format and examples are unchanged.

**Finding P1 (confirmed by source tracing): fail-open in-workspace replacements.**

- `project-controller.js::openProjectFile` awaited `checkpointBeforeReplace('pre-open-project')` without checking its `false` result. `checkpointCurrent` explicitly returns `false` if persistence is not ready, a different tab owns autosave, a visible task is busy, or checkpoint creation fails. The current project, History and Recipe could be replaced in memory despite the UI promising a recovery point.
- `app.js::importLayoutBuffer` likewise awaited `checkpointWorkspace('pre-import-layout')` without checking the return value before replacing Mask layout/cell/selection. Failed GDS/OAS parsing was already non-mutating; the bug was at the _post-parse pre-replace_ guard.
- A thrown checkpoint error generally stopped Project Open, but the ordinary `false` path silently continued. The post-confirmation in-workspace open did not enforce a successful checkpoint.
- A failed checkpoint also cleared a queued autosave timer before returning false, potentially leaving existing unsaved edits without a follow-up save attempt. The persistence controller now rearms a pending dirty/view autosave on refusal while write ownership is retained.
- The original checkpoint path checked the tab's autosave lease only before async worker packing/IndexedDB commit. A second tab could take over during the await, after which the first tab incorrectly treated a completed checkpoint as permission to replace its live workspace. The final response now also verifies the live lease and refuses replacement after ownership loss.

## Startup boundary: why a naive guard would break Welcome

`workspace-persistence-controller.js::initializePersistedWorkspace` owns startup protection. For `?start=...` it loads the persisted state and, when a saved state and write lease exist, creates `pre-welcome-start` **before** calling `initializeWorkspaceStart`. If that creation throws, it restores the saved project and cancels startup. If the import returns false it restores the existing saved workspace. The persistence controller is intentionally **not ready** until that startup flow finishes, so calling `checkpointCurrent` again inside Project Open/Mask Import would always reject a normal Welcome load.

The startup controller therefore now marks only its `openProjectFile`, `openLayoutFile` and `openBundledExample` calls as `startupProtected: true`. Normal in-workspace calls default to false, require an explicit successful checkpoint before replacing anything and leave the working project/mask unchanged if the guard fails. Preview startup, which has no owned persisted working state, uses the same bootstrap exception.

**Do not route direct Project Open, Mask import or sample-mask import through `startupProtected`.** The startup coordinator, not the individual import functions, owns the pre-start checkpoint contract.

## Threat matrix

| Path                                                   | Baseline behavior                                           | Expected fixed behavior                                   |
| ------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------- |
| Workspace Open valid project, checkpoint returns false | Replaces project anyway                                     | Returns failure, no Project/History mutation              |
| Workspace Open valid project, checkpoint throws        | Catch prevents replacement                                  | Catch prevents replacement                                |
| Workspace Open valid project, checkpoint true          | Imports normally                                            | Imports normally                                          |
| Workspace GDS/OAS valid layout, checkpoint false       | Replaces mask anyway                                        | Throws guard error before `applyImportedLayout`           |
| Workspace sample mask import, checkpoint false         | Replaces mask anyway                                        | Same fail-closed guard                                    |
| Welcome staged project/layout; no previous saved state | Not-ready checkpoint returns false; ignored                 | Authorized startup-only bypass; import works              |
| Welcome start with prior saved owner workspace         | `pre-welcome-start` protects it before import               | Keeps that protection and does not redundantly checkpoint |
| Welcome start with failed `pre-welcome-start`          | Restores existing saved workspace, aborts                   | Unchanged                                                 |
| Welcome invalid/staged file import failure             | Restores previous saved workspace when present              | Unchanged                                                 |
| Read-only secondary tab opens project in workspace     | May replace volatile working state despite checkpoint false | Rejects, does not modify owner autosave                   |

## Tests and acceptance

Added/adjusted Node tests in `site/tests/project-controller-recovery.test.mjs` and `site/tests/controllers.test.mjs`:

- false / rejected checkpoint must block in-workspace project replacement;
- true checkpoint permits replacement in the correct order;
- protected Welcome open bypasses the not-ready second checkpoint;
- startup controller explicitly passes protected context for staged project, staged layout and example;
- layout open passes the context to the same import pipeline (ordinary default remains false).
- a simulated lease takeover during an otherwise successful asynchronous Recovery task fails closed; unchanged lease still permits the normal path.

The Chromium `scripts/persistence-regression.mjs` suite now also injects a real IndexedDB-open failure after an owned workspace is initialized, attempts confirmed Project Open and an actual OAS Mask import, and compares the exported current model, Mask layout and snapshots before/after. It also starts with a dirty project name, restores IndexedDB availability, verifies the pending autosave completes, and reloads to prove the edit survived. It asserts both visible failure statuses and no uncaught page errors. This tests the real import worker/controller/UI/Recovery pipeline, rather than relying only on source assertions.

Required CI on final branch head: Quality (lint, format, docs, Node), Chromium browser persistence + History + Welcome/startup + real mask/project import, and visual spot-check of failed-open status. **Tests written are not passing evidence until a run completes.**

## Out-of-scope issues observed (not claimed fixed)

- `takeStartupFile` removes the staged IndexedDB entry before the import is proven successful. A failed import requires reselecting the original file; it does not delete the user's original local file.
- `restoreSelectedRecovery` and `takeOverWorkspace` are separate transactions and merit their own interruption/lease-race audit. This fix does not assert cross-tab atomicity across two unrelated IndexedDB stores.
- Startup source contains no automatic Recovery checkpoint when a second tab does not own the autosave lease; that tab's writes remain paused, and the owner copy should remain untouched. A two-tab browser acceptance should verify this, especially following takeover.
- If navigation occurs before the prior pagehide autosave finishes, the startup protection covers the _last persisted_ state, not necessarily an unflushed volatile state from the previous page. This is a navigation flush/timing follow-up, not evidence of reproducible current data loss.

## Release rule

Keep this branch separate from main until the exact-head CI tests are green and the startup Project/Mask import path works with both clean and previously saved workspaces. Failures in Recovery creation must never silently be treated as success. Do not relax backup guards or overwrite approved scientific baselines to pass tests.
