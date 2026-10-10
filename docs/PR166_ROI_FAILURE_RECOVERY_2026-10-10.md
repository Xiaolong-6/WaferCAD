# PR #166 — bounded ROI failure recovery acceptance (2026-10-10)

## Scope and disposition

Follow-up to [PR #166](https://github.com/Xiaolong-6/WaferCAD/pull/166)
and `docs/PR166_ACCEPTANCE_2026-10-10.md`. This handoff is a distinct file
because the Windows acceptance report also has a locally committed, not yet
published `74175fb3` revision. Do not overwrite or discard that local work.

**Validated product head:** `87ffffd72a41514d5b1beda8448a5768e112928d`
on `perf/transparent-renderer-v3-20261009`.

**Partial P0 outcome:** a 625-site Quality ROI exceeding the three-million-point
geometry budget now fails visibly, without an unhandled render promise or
permanent `building` state. Clearing that ROI restores the original complete
3D scene. The budget limit is preserved: the oversized ROI is **not** rendered
and is **not** counted as functional full-size ROI acceptance.

## Reproduced failures and corrections

1. `site/model-array.js` intentionally rejects the oversized resolved array
   with `The requested array area exceeds the bounded geometry point budget`.
   The budget guard is unchanged.
2. `site/three-view.js` previously disposed the last valid scene before
   resolving bounded ROI topology. An exception left `renderState=building`
   and could destroy the scene. The clipped surface plan is now evaluated
   *before* disposing the prior group. An awaited or synchronous rebuild
   failure ends in `renderState=error` / `renderPhase=failed`, with a readable
   error code and message; previous geometry is retained but hidden, never
   misrepresented as a valid clipped ROI. The rendering lock is released.
   Clearing the ROI unhides/reuses the valid scene or rebuilds if needed.
   Existing pending-render scheduling is retained.
3. `site/app.js` previously called an async `threeView.render()` under a
   synchronous try/catch, then eagerly deleted the error attribute. First
   browser CI proved `rendererErrorCode=geometry-point-budget` but showed
   `renderError` was missing. The caller now observes the returned Promise
   and no longer erases diagnostics prematurely.
4. `site/renderer-rebuild-status.js` owns the recoverable error-state contract,
   with Node coverage in `site/tests/renderer-rebuild-status.test.mjs`.
5. `scripts/renderer-roi-recovery-regression.mjs` exercises a real 625-site
   Quality 50%-opacity scene, creates the Main rectangle ROI with real pointer
   input, verifies fail-closed diagnostics, clears ROI and verifies restoration.
   It runs only for the V3 PR in the existing targeted Browser job, with no new
   manual workflow dispatch or extra heavyweight array-stress job.

## CI evidence for exact product head

- [Quality run 38071284230](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38071284230):
  **success**. Executed `npm run check:ci`: ESLint, generated-document
  check, Node **632/632 passing**, zero failed.
- [Browser run 38071284222](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38071284222):
  **success**. The normal targeted regression passed, followed by the new
  explicit 625-site ROI recovery gate. Chromium **140.0.7339.186**.
  Extracted `RENDERER_ROI_RECOVERY` result:

  | Property | Reference | Rejected oversized ROI | Cleared ROI |
  | --- | --- | --- | --- |
  | Render state | ready | error | ready |
  | Render phase | complete | failed | complete |
  | Render error code | absent | geometry-point-budget | absent |
  | Scene generation | 3 | 3 | 3 |
  | Model revision | 61 | 61 | 61 |
  | Process revision | 40 | 40 | 40 |
  | Submitted triangles | 57,040,012 | no accepted ROI frame | 57,040,012 |
  | Frame serial | 13 | 14 | 15 |

  ROI guard message was retained; page errors were **zero**.
  Renderer rejected the geometry limit and successfully restored the complete
  previous draw submissions, without changing physical model/process revision.

The browser job's product-review artifact includes the isolated
`renderer-roi-recovery/report.json`, rejected-view and restored-view PNGs.
The Linux CI Chromium result is **not** a Windows RTX 3060 parity result.
`npm run check:ci` excludes the full Prettier format gate;
`npm run check` and a new Windows hardware rerun were **not** executed
in this follow-up.

## Still blocked / acceptance boundary

- Fresh-context RTX 3060 transparent screenshots can differ despite
  byte-identical no-interaction repeated frames within one context.
  Hardware ON/OFF scientific parity and paired performance remain open.
- The array point budget is unchanged. Display of the oversized ROI requires a
  separate, geometry-preserving streaming/partitioned ROI design and scientific
  tests; silently removing geometry is prohibited.
- Full 625-site 20-toggle, edge-on, Native Fig3, Process and Example Recipe
  heavyweight jobs were not repeated on this Draft head and remain skipped.
- Keep the experimental Electrical planar single-pass flag **default OFF**.
  Maintain Draft status, no merge, no baseline updates or force pushes.
