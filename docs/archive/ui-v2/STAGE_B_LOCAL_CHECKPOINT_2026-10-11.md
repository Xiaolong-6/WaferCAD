# UI v2 Stage B WIP checkpoint — 2026-10-11

Repository: Xiaolong-6/WaferCAD. Branch: `codex/ui-v2-main-wip`. Parent: `526cc7ae62b8a5a4366f5a80654ce7d0bd064b72`. The user authorized repairs and a WIP preview update, then paused online updates. **The latest instruction explicitly requests commit and push of this review handoff, superseding that pause for the normal WIP branch push and its existing automatic preview workflow.** No merge or manual CI dispatch is authorized; `main` remains unchanged. At preparation, remote WIP was `a2892b06dbd330f893588f5342613e03f8f99bee`, with no competing commits. **The blank capture's layout cause is confirmed and fixed. The user explicitly accepted the lightweight passing gate as sufficient for this handoff and requested immediate review preparation. Stage B implementation is ready for review; see the [current review handoff](STAGE_B_REVIEW_HANDOFF_2026-10-11.md).** Full-model rerun was stopped at the user's request. Human acceptance remains pending; Stage C is unimplemented. Earlier failures below are historical and are superseded only by explicit later results.

Resolve this checkpoint's SHA with `git log -1 --format=%H -- docs/ui-v2/STAGE_B_LOCAL_CHECKPOINT_2026-10-11.md`. Browser reports record the parent revision and `dirty: true`: validation ran on the local product changes saved in this checkpoint, before committing. Verify `/preview/build-info.json` matches before treating a deployed preview as evidence. The deployment workflow sources the root site from `main` and WIP from this branch.

## Mask ROI correction

Stage A opened the Mask ROI parameter editor directly from the header and omitted the agreed Main-style floating tool strip. Mask now uses the same `createFloatingStrip` and `createFloatingEditorManager`: header ROI toggles Select / Square / Circle / settings; the gear opens the existing parameter editor. Selecting ROI Select disables Pan. Switching back to Draw reveals its retained tool strip. Hiding or switching strips preserves drawing drafts, stored Draw geometry, ROI and File/Draw source.

The standalone Mask gate passed at 1440/1024/768/390 plus touch after these fixes. All existing assertions, including 0.25 px checks, remain unchanged. Added checks cover pending polygon preservation, strip switching and Select/Pan ownership. [Saved report](../../ui-v2/handoff/stage-b-mask-report.json). Command:

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/wafercad-playwright \
WAFERCAD_THREE_DIR=/workspace/WaferCAD/node_modules/three \
node scripts/v2/check-mask-view.mjs
```

Log: `/tmp/wafercad-mask-final.log`. Screenshots: `test-results/ui-v2-mask-review/`. Integrated Section and legacy browser reruns remain pending.

## Real 3D and lightweight development

The shared workstation registers real 3D using the existing renderer, the same model, Main ROI and Section Z Break. It adds mutually exclusive Rotate/Pan/Zoom, Zoom-gated wheel, original OrbitControls mouse controls and persistent two-finger pinch. One-finger Zoom uses the existing D1 camera mapping. Fast/Quality, opacity 0.1–1 and borders use original renderer state. PNG 3× and physical GLB reuse original exporters and task controller. GLB Abort remains in the task panel.

At the user's request, development can use smaller existing examples through the shared loader. No duplicate model or renderer is created. Default remains the complete M3D project for existing acceptance gates:

- Lightweight four-unit metalens: `http://127.0.0.1:4182/app.html?example=metalens` — 5 layers, 2 regions, 22,757-byte fixture.
- Photodetector: `http://127.0.0.1:4182/app.html?example=photodetector` — 5 layers, 5 regions, 100,579-byte fixture; its rough surfaces still cost software rendering time.
- Complete M3D: `http://127.0.0.1:4182/app.html?example=m3d` — 27 layers, 551 regions.

These local URLs point to the same [shared workstation entry](../../../site/app.html). They are loopback routes on the development machine, not public previews. Online updates remain paused; a future `/preview/` deployment is assembled by Pages rather than stored as a source directory.

Legacy delta against budget base `1664405`: Section collapse public port 8 additions, 3D opt-in gesture port 33 additions, zero deletions; cumulative **41/100**. Callers that do not opt into the new gesture port retain legacy defaults. No scientific geometry algorithm, worker, schema, IO implementation or legacy assertion was modified.

## Validation and open gate failures

Linux Debian; Node 24.19.0, locked Playwright 1.55.1 / Chromium 140.0.7339.186 and Three 0.179.1. Hardware GPU/touch acceptance is not established. `npm run check` passed lint, formatting, docs and 612/612 Node tests before adding the new 3D browser script and example selector. Subsequent lint/format checks passed. The documentation navigation gap was repaired after explicit user authorization; `npm run docs:check` passed with 129 Markdown files and 471 links before this final checkpoint update.

System Chromium 154 stalled during the two-tab Mask screenshot path. Twelve animation-frame samples showed stable panel/stage/canvas dimensions. Locked Chromium 140 passed the same path and the complete Mask gate; no timeout or assertion was changed. Exact system-browser scheduling cause remains unknown.

The full M3D 3D gate failed at the Pan click after rotation (30-second timeout). Camera rotation and blocked wheel assertions passed; the button rectangle and hit target were correct, and no page errors were reported. Frame progress slowed in the software WebGL environment. The renderer was not rewritten to mask this problem. A separate small photodetector diagnostic successfully rotated and clicked Pan, with real pointer/click events and unchanged mode wiring. Full M3D acceptance remains blocked.

The metalens 3D gate reached real mouse rotation/pan/zoom, wheel ownership, display settings, resource reuse, maximize, Main ROI clipping, Section Z Break and Detail independence, PNG dimensions and GLB physical metre assertions at width 1440. It then failed at `#processTaskAbortBtn`: the small real GLB export completed before the click, so the task window was hidden. This is not a passing gate; other widths and touch were not reached. [Saved failure report](../../ui-v2/handoff/stage-b-three-metalens-report.json). Command:

```bash
PLAYWRIGHT_BROWSERS_PATH=/tmp/wafercad-playwright \
WAFERCAD_THREE_DIR=/workspace/WaferCAD/node_modules/three \
WAFERCAD_V2_EXAMPLE=metalens node scripts/v2/check-three-view.mjs
```

Log: `/tmp/wafercad-three-metalens-check.log`. The preceding photodetector acceptance run was interrupted to reduce load; it is not acceptance evidence. The metalens failure was reported with a proposed separate larger real-export cancellation scenario. The user chose **only update the WIP preview for now**. Cancellation test changes and further browser gates are paused. No fix or assertion relaxation was applied after this new failure. The default M3D gate is retained.

The standing [handoff rule](HANDOFF_2026-10-11.md) requires reporting new gate failures and waiting for a decision. The user paused further cancellation-test changes and subsequently paused online updates. Do not declare Stage B accepted. Remaining work: cancellation coverage, four-width/touch 3D gate, integrated Section and legacy regressions, full M3D performance verification and hands-on review. Pages updates after deployment; it does not refresh on each local file save.

## Resumed local Phase B and mobile A/B correction

The user subsequently instructed continued Phase B development while keeping online updates paused. The tiny clipped-example cancellation sequence was moved into `scripts/v2/check-three-export-abort.mjs`, using the complete real M3D model and original exporter/task panel. The original no-download and unchanged-ROI assertions remain; additional model, camera and task-release checks were added. No fake delay, exporter mock or scientific change was introduced.

`WAFERCAD_V2_EXAMPLE=metalens node scripts/v2/check-three-view.mjs` now passes at 1440/1024/768/390 plus touch in locked Chromium 140. This establishes real gestures, wheel ownership, display settings/resource reuse, shared Main ROI and Section behavior, model equality, PNG 3× dimensions and GLB physical metres. Export samples: PNG 79,895 bytes; GLB 6,060 bytes. [Passing report](../../ui-v2/handoff/stage-b-three-metalens-pass-report.json). Log: `/tmp/wafercad-phase-b-three-small.log`. Full M3D gestures remain unaccepted.

The user reported elliptical A/B handles in a phone screenshot. A real coarse-pointer reproduction measured **40×24 CSS px**: generic buttons inherit the 40 px minimum width, while the v2 endpoint CSS fixed height at 24 px. `site/ui-v2/main-view.css` now sizes both axes with `max(24px, var(--wc-hit-min))`, preserving desktop 24 px circles and 40 px touch targets. No canvas scaling, coordinate mapping or science changed. The Main touch gate passes existing gestures and precision assertions, with added circularity/target checks at 390 and 1024. A complete-M3D shared-workstation phone capture also measured both handles at **40×40**. [Size report](../../ui-v2/handoff/stage-b-ab-mobile-report.json). Screenshot: `test-results/ui-v2-main-review/ab-mobile-fixed.png`. Added desktop circularity check awaits the complete Main gate rerun.

`node --test scripts/v2/view-state.test.mjs scripts/v2/real-three-controls.test.mjs scripts/v2/m25-shell-contract.test.mjs`: PASS, 3/3 files. Focused ESLint and Prettier checks for the new cancellation checker and changed Main CSS/tests passed.

The full M3D cancellation checker reached **80% · Building sidewalls**, clicked the actual task-panel Abort, observed the task hide, no downloads, cancellation status, re-enabled Export, and exact unchanged model and ROI. Its new camera `deepEqual` then failed because successive OrbitControls updates differed by approximately 5e-14 in position components. Target and FOV matched. [Failure report](../../ui-v2/handoff/stage-b-three-abort-report.json). Log: `/tmp/wafercad-phase-b-abort.log`. This remains a failed gate. It was reported before any assertion change; authorization was requested to compare the newly added camera check with maximum numerical error 1e-9, retaining original model/ROI/no-download and 0.25 px assertions. Subsequent regressions are paused pending that decision.

## Authorized numerical correction and continued regression

The user explicitly authorized the numerical correction and continued work. The new camera check now requires maximum absolute component error `<= 1e-9`; model, ROI and no-download assertions remain exact. The complete M3D cancellation gate **passes**: Abort at **83% · Building sidewalls**, no download, unchanged scientific model/ROI, task released, no page errors, camera maximum error **4.263256414560601e-14**. [Passing cancellation report](../../ui-v2/handoff/stage-b-three-abort-pass-report.json). Log: `/tmp/wafercad-phase-b-abort-final.log`; screenshot: `test-results/ui-v2-three-export-abort/cancelled.png`.

The new `.github/workflows/ui-v2-three.yml` configures the same passing lightweight 3D and full-model cancellation browser owners as a separate PR job. It has no manual dispatch entry and has not been pushed or run in CI. The existing Main/Mask/Section job remains separate. Commands and scope are documented in [Testing](../../testing.md). Online updates remain paused.

## Full-model input repair and regression results

The complete Main gate passes four widths and touch, retaining original geometry/gesture assertions and adding desktop/touch endpoint circularity. [Main report](../../ui-v2/handoff/stage-b-main-report.json). The complete Section gate passes four widths and touch, including the restored Mask ROI strip and shared scientific state. [Section report](../../ui-v2/handoff/stage-b-section-report.json). These results supersede the earlier pending Main/Section entries.

The unchanged legacy commands `npm run test:ui:smoke`, `npm run test:ui:workstation` (including View UX v3), `npm run test:ui:interaction` and `npm run test:ui:product:layout` all pass. Layout produced 109 captures. Logs are `/tmp/wafercad-phase-b-legacy-{smoke,workstation,interaction,product-layout}.log`. Locked Chromium 140 and local pinned Three were used against the original app at port 4174.

Read-only `scripts/v2/diagnose-three-input.mjs` identified continuous post-release OrbitControls damping frames in software WebGL. The normal Pan click timed out at 30 seconds; [timeout report](../../ui-v2/handoff/stage-b-three-input-timeout-report.json). A diagnostic-only `noWaitAfter` run still took 19.4 seconds and observed no navigation. [Diagnostic report](../../ui-v2/handoff/stage-b-three-input-diagnostic-report.json). An isolated browser-response experiment disabling damping only for the v2 opt-in gesture policy reduced a normal, unmodified click to 31.8 ms. [Experiment report](../../ui-v2/handoff/stage-b-three-damping-experiment-report.json). Draw calls (3,142), triangles (283,440), actual rotation and the exact model were unchanged. The product now applies that one-line configuration through the v2 gesture policy; legacy callers retain their original damping behavior. No geometry, LOD, render quality, click timeout or acceptance wait was relaxed. The acceptance checker does not use `noWaitAfter`.

The full M3D rerun passes interaction assertions at 1440/1024/768, including real gestures; width 1440 also passes ROI/Section linkage and exports. During screenshot review, however, `test-results/ui-v2-three-review/three-768.png` showed a blank 3D area and no visible readout/status; the 1024 capture shows the complete model normally. The run was interrupted during width 390, before touch, and must not be reported as a passing complete gate. No existing assertion, timeout or wait was relaxed.

## Paused on new narrow-screen visual anomaly

The new finding was reported and authorization was requested to diagnose/fix it and add visibility coverage while keeping online updates paused. No product repair for this anomaly has been applied. Do not infer its cause from the screenshot alone: whether this is capture timing, viewport layout or a renderer failure remains unproven.

A lightweight read-only probe at width 768 shows metalens correctly before and after two Maximize toggles, with stable 732×366 host/canvas/container dimensions and no page errors. [Probe report](../../ui-v2/handoff/stage-b-three-layout-probe-report.json). Its script is `scripts/v2/diagnose-three-layout.mjs`; screenshots are under `test-results/ui-v2-three-layout-probe/`. This cold-load/maximize scenario does not reproduce the full-model display/gesture sequence and does not clear the failure. Run `WAFERCAD_V2_EXAMPLE=m3d node scripts/v2/diagnose-three-layout.mjs` only when continued diagnosis is authorized.

Remaining: diagnose the blank final M3D capture, complete width 390/touch and final small-model/cancellation verification after the camera policy change, then hands-on review. Hardware GPU and physical touchscreen acceptance remain unestablished. Stage B is not fully accepted; Stage C has not started.

Final unaffected checks pass: `npm test` **612/612**, zero failures, cancellations or skips; `npm run lint`; `npm run format:check`; focused ESLint/Prettier for the subsequently added layout diagnostic and checkpoint; `npm run docs:check` (129 Markdown files, 487 links, 109 reachable docs); and `git diff --check`. Node log: `/tmp/wafercad-phase-b-final-node.log`. Original assertions and scientific fixtures remain unchanged. The saved cancellation/small-model passing reports precede the final damping configuration; their final reruns remain explicitly pending.

## Authorized canvas layout repair and visible-capture regression

After the user instructed “修复并继续”, the read-only full-M3D probe reproduced the complete Rotate/Pan/Zoom, Fit, display-settings and Maximize/Restore sequence. Before the final full-page capture, host/canvas/container were **732×366**. Capture then expanded all three to **732×3416**; a subsequent ordinary viewport capture was also blank. This was an intrinsic canvas-size feedback loop in the narrow automatic-height layout. An isolated absolute-position canvas experiment restored **732×252**, visible physical materials and the readout/status. Camera components changed only at numerical roundoff; initial and fixed draw calls/triangles were **3,141 / 283,440**. [Recorded experiment](../../ui-v2/handoff/stage-b-three-layout-experiment-report.json).

The product repair adds only `position: absolute; inset: 0` to `.v2-three-host canvas` in `site/ui-v2/workstation-views.css`, keeping the renderer's buffer out of normal layout sizing. No scientific geometry, camera policy, native renderer, worker, IO or schema changed in this repair. Legacy budget remains **41/100** against `1664405`.

`scripts/v2/three-visibility.mjs` adds acceptance of the actual compositor PNG: positive canvas dimensions, canvas/host agreement, containment, screenshot-time layout stability within **0.25 px**, and at least 64 colored material pixels inside the canvas crop. Submitted WebGL draw counts alone no longer establish visible output. Original gesture, model, export and geometry assertions are retained.

The first added stability check failed in touch emulation despite visible materials. A diagnostic recorded `(pointer: coarse)` switching from true to false during Chromium 140 full-page `captureBeyondViewport`; fonts and the 1024×960 viewport stayed unchanged. Canvas shifted from **(332,175.5), 670×296** to **(300,154.5), 702×311** as coarse controls/divider shrank. A normal viewport capture preserves coarse pointer and every measured dimension. The touch gate therefore captures the actual viewport and additionally requires the entire 3D canvas to fit it; four-width gates retain full-page captures. No CSS media override, mock, original assertion relaxation or skipped touch gesture was introduced.

The final lightweight command `WAFERCAD_V2_EXAMPLE=metalens node scripts/v2/check-three-view.mjs` **passes**, exit 0, at 1440/1024/768/390 and touch, including the new visible/stable PNG checks. [Visible-capture report](../../ui-v2/handoff/stage-b-three-metalens-visible-report.json). Touch remains coarse before/after capture with stable **670×296** canvas. Log: `/tmp/wafercad-phase-b-small-visible-final.log`. Linux, Node 24.19.0, Playwright 1.55.1 / Chromium 140.0.7339.186 and locally pinned Three 0.179.1 were used. Local v2 server: port 4182; browser cache: `/tmp/wafercad-playwright`; `WAFERCAD_THREE_DIR` points to the repository's `node_modules/three`.

The user then instructed “轻量模型pass就够了 马上准备交接review”. The complete-M3D run was explicitly terminated before its first width reported PASS; it is neither a completed pass nor a new gate failure. Its browser processes were closed. No additional cancellation rerun was started: the earlier full-M3D passing cancellation report remains evidence for its recorded revision, not a fresh result after the two-line CSS repair. The lightweight passing gate is the user-approved scope for this review handoff. Hardware GPU, physical touchscreen and hands-on visual acceptance remain unestablished. The subsequent “记得commit and push” authorizes publishing this review on the WIP branch and its automatic preview workflow; verify deployment revision separately. Stage C has not started.
