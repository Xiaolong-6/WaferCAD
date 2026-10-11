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

## WebGL framebuffer versus screenshot readback (2026-10-11)

The six-frame test-only ON/ON/OFF/OFF/ON/ON material hot-switch
was repeated with **mapped WebGL framebuffer readbacks**, rather than
assuming a screenshot pixel shares coordinates with the WebGL backing
buffer. This test is intentionally **not** an automatic CI acceptance gate
because hot-changing `material.forceSinglePass` within
`Object3D.onBeforeRender` is not a product interaction.

- [Quality CI 38115626125](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38115626125):
  **success, 635/635 Node tests passing**, including bounded opt-in
  readback, vertical flip, and fractional-resolution mapping.
- [Diagnostic Browser CI 38115626178](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38115626178):
  normal product/ROI steps passed; the standalone strict scientific
  hot-switch diagnostic **FAILED as expected**, preserving all frames.
  [Artifact 11693527978](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38115626178/artifacts/11693527978)
  includes PNGs, frame traces and
  `electrical-same-context/report.json`.
- Chromium 140 on Linux software WebGL produced a **530 × 273**
  `gl.drawingBuffer`, while Playwright's canvas PNG was **531 × 275**.
  A screenshot coordinate must be mapped by pixel center into the
  smaller backing buffer; coordinates cannot be assumed equal.
- Six frames retained **identical camera world/projection matrices**
  and **identical presentation object draw-order hashes**. OFF and ON
  had the expected native 1,408 / 1,291 draw calls and
  57,040,012 / 54,066,262 triangles respectively. No GL errors.
- ON (frames 1 and 2), OFF (3 and 4) were byte/pixel identical.
  Restored ON (5 and 6) changed **two PNG pixels**, (301,138) and
  (301,139), by +1 red channel level, with no green, blue or alpha
  differences. The changed PNG appearance remained stable on frame 6.
- Mapped raw GL readback confirms the change **already exists before
  browser screenshot composition**. The native framebuffer sample at
  `(x=300, top-y=137)` changed from
  **RGBA (66,108,126,255) to (67,108,126,255)**, while the
  neighboring native sample remained unchanged. PNG scaling from the
  530 × 273 backing store to 531 × 275 spreads that red-channel
  difference into two displayed pixels. Accordingly, this is not
  solely a screenshot-tool artifact.
- Transparent blend parameters in the diagnostic remained constant:
  `BLEND=true`, RGB factors `SRC_ALPHA=770` and
  `ONE_MINUS_SRC_ALPHA=771`, `FUNC_ADD=32774`, `DITHER=true`,
  `DEPTH_TEST=true`. The first Electrical draw had
  `DEPTH_WRITEMASK=false` in both policies. The expected culling
  policy differs: single-pass first Electrical draw
  `CULL_FACE=false`, double-pass `CULL_FACE=true`. The restored
  single-pass matches the initial single-pass state in the recorded
  fields, so these snapshots do not isolate the shader/driver cause
  of the 1-level difference.

**Interpretation and limit:** The discrepancy belongs to the WebGL
draw/material lifecycle under **test-only hot-switching**. Its
occurrence on a settled, equal-camera/equal-order frame rules out
camera drift or object sorting as the sole cause of this controlled
difference. No evidence here establishes that production does this
hot-switch; the real Windows RTX 3060 **fresh-context** ON/OFF
and same-policy checks remain separate and blocked. Exact PNG parity
has **not** been relaxed, and no approved visual baseline or
scientific/physical model was changed.

The short opt-in framebuffer inspection helper remains available in
`scripts/test-helpers/webgl-frame-probe.mjs`, with focused Node coverage
in `site/tests/webgl-frame-probe.test.mjs`. The expensive one-time
hot-switch diagnostic CI step has been removed again from
`.github/workflows/browser-regression.yml`; the existing real
625-site ROI error/clear/restore browser gate remains active.

**Next technical hypothesis to test in isolation:** compare the
*normal product path* in fresh identical hardware WebGL contexts with
explicitly recorded (a) backing store versus capture dimensions,
(b) same-camera raw GL sample neighborhoods, (c) shader/material
program configuration, and (d) alpha/dither state. Never qualify
hardware image parity from software WebGL evidence.

## Fresh WebGL context, normal product policy — no material hot-switch (2026-10-11)

This follow-up addresses the earlier experiment's scientific confounder: changing
`forceSinglePass` on an already initialized Three.js material is **not** an
application user flow. The new
`scripts/renderer-electrical-fresh-context-ab.mjs` selects the existing
default-OFF Electrical cap optimization **only at fresh page boot**, then loads
the same 625-site fixture, selects Quality 50% transparency, fits with the
public 3D toolbar and captures one fully completed native WebGL frame per
fresh browser context.

[Linux Chromium CI 38117286875](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38117286875)
ran the exact production OFF/OFF/ON/ON path with the **SwiftShader Vulkan
software adapter**, Chromium 140; [artifact](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38117286875)
contains four per-frame PNGs, full trace JSON and strict
`electrical-fresh-context/report.json`.
The comparison checked **entire raw WebGL framebuffer SHA-256** as well as
exact PNG bytes and decoded pixel data, camera matrices, presentation draw
order, presentation material descriptors, CSS/canvas/PNG dimensions,
model/process revision and native WebGL submissions.

| Verification | Fresh OFF/OFF | Fresh ON/ON | Fresh OFF/ON |
| --- | --- | --- | --- |
| PNG pixel difference | **0** | **0** | **0** |
| PNG bytes identical | yes | yes | yes |
| Complete GL framebuffer SHA-256 identical | yes | yes | yes |
| Exact camera world/projection and draw order | yes | yes | yes |
| Viewport/canvas/GL backing size | identical | identical | identical |

All four native GL framebuffers had a **530 × 273** backing store while
the canvas screenshot was **531 × 275**; this difference does not produce
cross-arm pixel mismatches when geometry and view are controlled. All four
readbacks had zero GL errors and the same framebuffer hash
`569ca9411a8245951ddd917092650b4bb6e695dac01e8d9d8662fa0028e4ee0d`.
Normal OFF submitted **1,408 draw calls / 57,040,012 triangles**;
experimental ON submitted **1,291 / 54,066,262**, consistent with the
original software-WebGL A/B reduction. The material-policy descriptor hash
legitimately differs between ON and OFF; each same-policy pair matched.

This **passes the controlled software-WebGL strict pixel gate**. It is
separate from the six-frame test-only material hot-switch, whose previously
recorded 1/255 WebGL difference remains a valid observation about that
non-product sequence, but must not be projected onto production behavior.

**Hard acceptance limit:** SwiftShader is a software rasterizer.
The earlier RTX 3060 fresh-context tests showed strict pixel differences,
including same-policy controls. This Linux result neither repairs nor
supersedes those hardware findings. PR #166 remains **Draft, default OFF
and unmerged**; no approved visual baselines were replaced and no
geometry/physics or renderer shading decisions were changed in this
follow-up. Browser CI used `--report-only` solely to collect all four arms;
that flag never promotes a failed scientific criterion.

The one-time CI diagnostic step was removed after the evidence was saved.
The opt-in script remains available for controlled future tests. The new
bounded framebuffer capture is test-tool-only, and its mock fixture was
updated to emulate full 2D `readPixels` rather than only 1×1 samples.
The last repository Quality+Browser CI head still needs to confirm the
mock repair and removal of the one-time workflow step.
