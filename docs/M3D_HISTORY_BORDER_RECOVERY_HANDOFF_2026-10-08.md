# M3D / History / Border — desktop Agent handoff (2026-10-08)

> **Status: CODE WRITTEN; FINAL REGRESSION DEFERRED BY USER.**
> This is branch-local evidence and an execution checklist, **not** a validated product contract or a claim that CI is green. The user explicitly requested that no more regression validation be performed in this session and that desktop Agent perform it instead. Do not treat this document as permission to merge.
>
> Working branch: `test/m3d-full-replay-20261008`. Relevant implementation commits: `8b99e7b0e9fea3d816ea8ec43df9ce89b061d302`, `75a987b877000be8f541d04e2ad15ee6e7e1b8a6`, `c1dcb07a93702081064186732ae3d4a1d63d1f7a`.
> Intended downstream integration: `feat/process-recipe-v1`. **Do not touch `main` or other example families in this handoff.**

## What changed (not yet signed off)

### A. History navigation and unnecessary Recovery checkpoints

- User symptom: switching M3D History steps with no Apply / mask changes repeatedly shows **"Creating Recovery checkpoint…"**, sometimes for tens of seconds.
- Call chain: `site/controllers/project-controller.js` → `prepareHistoryReplacement()` → `snapshotManager.hasHistoricalWorkingEdits()` → `checkpointBeforeReplace()` → `site/controllers/workspace-persistence-controller.js::checkpointCurrent()`.
- Root cause found: imported M3D `node.state` / `headState` can contain the persisted project `name`, but live `buildProjectSnapshot(false)` in `site/controllers/project-state-controller.js` omits it; `processStateEqual` treated the metadata-only mismatch as an edit.
- Patch: `site/workspace-snapshots.js` excludes `name` from comparison alongside inspection-only keys, without discarding actual `model`, `drawMask`, `maskSourceMode` or `processRecipe` changes.
- Added unit scenario: `site/tests/snapshots.test.mjs`: restoring historical M3D stage with name drift, verifying no changes detected after read-only selection/Section movement, then verifying Draw Mask mutation is still detected.
- **Unverified:** real-browser History navigation in a multi-megabyte M3D workspace, behavior of all UI-editable fields, per-click latency and Recovery record count. Also ensure that the comparison itself is fast enough; filtering false positives removes saving but does not by itself optimize every deep comparison.

### B. Black internal 3D lines with Border ON

- User-supplied screenshot shows **Border ON**, Opacity **70%**, with dense black horizontal traces and long dark vertical strokes inside the M3D stack. Earlier assistant mistakenly interpreted Border as OFF. Do **not** diagnose from that incorrect assumption.
- Scientific boundary: M3D uses paper-derived **inferred masks** (not author-supplied GDS). Real interior contacts / metal-filled vias / material interfaces are expected; a black line is **not automatically** evidence of an erroneous mask or kernel operation.
- Renderer: `site/three-view.js::addBorderPositions()` creates dark `THREE.LineSegments`; previous `renderOrder=100000` meant edges could be drawn after transparent layer meshes. Internal interfaces are separately presented as `material-interface` translucent geometry. **Do not hide these real interfaces or remove kernel materials** merely to simplify visuals.
- Geometry ownership: `site/process-topology.js` now derives strong vertical Border segments from **non-buried exterior sidewalls**, filtering internal bookkeeping seams and buried junctions; caps and translucent interfaces are retained. The implementation uses sidewall edge-point/Z-interval matching; desktop Agent must confirm it does not inadvertently suppress valid external step/via edges or misclassify partial-height junctions.
- Presentation: `site/three-view.js` stores `waferCadBorderOrder` and uses a lower line render order in transparent mode, so intervening translucent material can attenuate edges. Border opacity is reduced from 0.62 to 0.46 when layers are translucent; opaque Border retains its original line order.
- Added geometry regression: `site/tests/process-topology.test.mjs` checks a same-layer computational seam is not given a black vertical outline and an exposed tier wall remains outlined, while buried horizontal caps still exist.
- **Unverified:** actual M3D 3D visual output at ON/OFF and 70%/100%, all true exterior edges preserved, transparent depth sorting, ROI/clipping cases, and whether some remaining black lines reflect Kernel-generated geometry rather than Border presentation. If suspicious geometry persists with Border OFF, inspect the originating `layerId`, slab `z0/z1`, source mask and `plan.sidewalls` / `plan.borderLines` before changing Kernel.

### C. Border ON/OFF affordance

- `site/app.html` now adds `.three-border-status` while preserving `#threeBorders` checkbox.
- `site/style.css`: explicit **blue ON** and **gray OFF** indicator, hover and keyboard focus treatment; matches the existing 21 px header control height.
- `site/tests/issue-11-3d-controls.test.mjs`: static contract checks; `scripts/m3d-welcome-regression.mjs`: actual ON→OFF interactive checks for checkbox state, pseudo-element label and different fill.
- **Unverified:** screenshots across viewport sizes, accessible label/readout behavior, whether palette overrides active state, and whether any header controls shift or overlap.

## Verification to be performed by desktop Agent (NOT run in this session)

The requirements below are **M3D-specific**, as requested. Do not block this branch on Native Fig3 or unrelated examples. Preserve evidence (logs, screenshots, timing, regression outputs), and only mark success after seeing the results.

### 1. Fast/static focused checks

From repository root with required dependencies installed:

```sh
git switch test/m3d-full-replay-20261008
npm ci --ignore-scripts --no-audit --no-fund
node --check site/three-view.js
node --test site/tests/snapshots.test.mjs site/tests/process-topology.test.mjs site/tests/issue-11-3d-controls.test.mjs site/tests/m3d-bundled-example.test.mjs site/tests/m3d-reconstruction-regression.test.mjs
```

Check the exact failure if any. One **previous** test run failed because an assertion incorrectly demanded a buried **sidewall** for a simple planar film where the expected interface is a buried **horizontal cap**; the assertion was corrected in `c1dcb07a`. That correction has not been signed off here.

### 2. Browser checks and M3D scenario

```sh
npx playwright install chromium
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
# In another shell:
export WAFERCAD_THREE_DIR="$PWD/node_modules/three"
node scripts/m3d-visual-acceptance.mjs
node scripts/m3d-welcome-regression.mjs
```

If the browser suite hangs or times out, inspect the actual UI state, console errors and captured image **before** relaxing a timeout or assertion. In particular, the M3D History path should select `m3d-step-15` (WSe2 transfer), then return to `m3d-step-36` (final stage). Verify stage-specific layer inventory and that the status and continuation banner describe the selected stage.

Manual acceptance steps and pass criteria:

1. **History/Recovery**: open the full M3D project, change History cursor between at least three older stages and HEAD **without editing**. No `Creating Recovery checkpoint…` overlay, no new Recovery record, no multi-second storage stall caused by backup. Change only zoom, Section slice and 3D camera; repeat. Then deliberately **edit** a historical Draw Mask shape or other process data and navigate away: a real unsaved edit must still be protected by Recovery, cancellation and branch safety semantics.
2. **Border UI**: check initial OFF, click ON, verify obvious blue ON label, click OFF, verify gray OFF label; use keyboard and compact viewport. No stale state after changing History, opening another example or reloading.
3. **3D geometry vs display**: compare exactly the same M3D view with Border ON/OFF and Opacity 100%/70%. Save screenshots for all four combinations, ideally with the same 3D camera. Quantify and inspect long vertical black strokes in the dense power/data via region. ON should outline actual exposed walls while hidden/buried boundaries are not drawn as dominant black lines. OFF should suppress black outline objects, while realistic material surfaces/interfaces remain.
4. **Topology source attribution**: for at least one formerly suspicious stroke, identify its exact `layerId`, exterior/buried ownership, XY segment and `z0/z1`. Match it to the M3D mask and the material stack in Section. Distinguish (a) valid buried material interface, (b) intentionally exposed via sidewall, (c) duplicate computational seam, and (d) erroneous Kernel geometry. Do **not** conclude every dark segment is a bug.
5. **M3D project integrity**: 27 S00–S26 bookmarks, 36 History nodes, viable full project and single-stage preview, working Welcome card, Main/Section/3D, browser Export + re-import. Confirm canonical model stays identical on **lossless** export; do not silently quantize to 0.1 nm. Existing compact-export overlap limitation is documented in `examples/projects/m3d-selfpowered-2026-replay/AUDIT.md` and is **not fixed by this patch**.

### 3. Artifacts and completion gate

- Record focused test results, key performance numbers (no-op History switching vs actual edit checkpoint) and at least four Border/Opacity screenshots.
- If topology ownership or rendering is still wrong, fix it on **this branch**, add narrowly targeted regression fixtures, rerun **only M3D/History/Border** suites, and document the root cause. Do not rewrite source masks on appearance evidence alone.
- Inspect diffs for accidental changes outside the scoped files; check whether model geometry is unchanged from the prior M3D project. If edits affect project data, regenerate and revalidate M3D.
- Update this handoff with a dated **verified** result and the SHA used, or explicit blockers. CI success for a previous SHA does not validate a later one. Only then consider marking the branch ready.
- **Do not merge into `main`**, and do not broaden acceptance to other projects unless explicitly requested.

## Existing M3D baseline evidence (pre-patch; not current verification)

`examples/projects/m3d-selfpowered-2026-replay/validation.json` and `AUDIT.md` describe Kernel rebuild S00–S26, conformal Al2O3 and selective sensing-window checks, and lossless canonical geometry round-trip. Those checks refer to the original replay project; they do not establish that the latest History/3D Border patch is accepted.

**Known independent limitation:** compact 0.0001 μm persistence grid can introduce `model.regions[60].geom` / `[58].geom` overlap. Lossless project storage is the supported path. Do not conflate this issue with 3D black line appearance or Recovery false-positive classification.

## Files changed or relevant

`site/workspace-snapshots.js`, `site/controllers/project-controller.js`, `site/controllers/project-state-controller.js`, `site/controllers/workspace-persistence-controller.js`, `site/process-topology.js`, `site/three-view.js`, `site/app.html`, `site/style.css`, `site/tests/snapshots.test.mjs`, `site/tests/process-topology.test.mjs`, `site/tests/issue-11-3d-controls.test.mjs`, `scripts/m3d-visual-acceptance.mjs`, `scripts/m3d-welcome-regression.mjs`, `.github/workflows/m3d-example-integration.yml`.

This handoff is intentionally documentation-only after the latest code commit. It does not invoke test commands or alter deployment/CI behavior.
