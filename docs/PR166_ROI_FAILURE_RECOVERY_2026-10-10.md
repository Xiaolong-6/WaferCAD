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

## Exact-camera / alpha state controls (2026-10-10 follow-up)

The existing [PR acceptance report](PR166_ACCEPTANCE_2026-10-10.md)
remains the source for Windows RTX 3060 evidence; that unpushed local
`74175fb3` must not be overwritten. The subsequent automatic browser
measurements here used **Linux Chromium software WebGL**.

The standalone script
`scripts/renderer-electrical-same-context-ab.mjs` builds a 625-site
Quality 50%-opacity Electrical single-pass scene **once**, then changes
only `material.forceSinglePass` through a test-only
`Object3D.onBeforeRender` interceptor. It collects native WebGL
submitted triangles, draw calls, exact PNG pixels, camera world and
projection matrices, and presentation object order. It is an **experimental
material hot-switch**; the product normally selects the candidate on page
creation, and does not execute this hot-switch sequence.

- [Six-frame test before camera fix, run 38073677978](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38073677978):
  ON/ON/OFF/OFF/ON/ON used 54,066,262 / 57,040,012 actual triangles,
  and 1,291 / 1,408 real native WebGL calls. The first four images
  matched pixel-for-pixel; the last two ON frames differed at
  (301,138–139), one red channel count each, on 2 of 146,025 pixels.
  Order hashes matched, but camera matrices already differed from the
  first frame on trial 2.
- `site/three-view.js` now skips redundant
  `OrbitControls.update()` on idle exact transparent frames with damping
  disabled, while preserving updates during interaction, damping and
  damping-mode transitions. It avoids repeated floating-point conversions
  of an otherwise unchanged camera pose.
- [Six-frame test with frozen idle camera, run 38074260560](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38074260560):
  **all six camera matrices and all six object-order traces were identical**;
  actual native submissions remained correct. Images 1–4 were still exactly
  equal, while both restored ON frames still differed by the same two
  1/255 red-channel pixels. This isolates the remaining difference to the
  test-only material-policy transition or raster/driver state; it does **not**
  establish that the application's ordinary no-hot-switch render path
  changes pixels. Strict parity **failed**; no tolerance was added.
- `?rendererV3RoiTrace=1` now also records the completed camera
  world and projection matrices. The existing 625-site
  `renderer-roi-recovery-regression.mjs` checks a same-policy idle redraw
  preserves both matrices exactly, alongside bounded ROI error recovery.
  The expensive six-frame hot-switch experiment stays standalone; it was
  removed from automatic Browser CI after obtaining the diagnostic evidence
  because it deliberately exercises a nonproduct material lifecycle and
  does not establish production ON/OFF acceptance.

**Current scientific decision:** The oversized array ROI point-budget
limit remains enforced, and its failure/clear recovery was previously
browser-verified. The camera-drift fix is separately under the normal
targeted-browser regression. Full oversized ROI rendering is not implemented.
Hardware fresh-context 625-site pixel parity remains **FAIL/unaccepted**,
the Electrical candidate remains default OFF, and PR #166 remains Draft,
unmerged, with unchanged visual baselines.
