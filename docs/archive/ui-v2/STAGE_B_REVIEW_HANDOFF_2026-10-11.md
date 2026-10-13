# UI v2 Stage B — ready for review

Current toolbar/gesture decisions and Stage C entry are recorded in the [desktop review checkpoint](DESKTOP_REVIEW_2026-10-11.md). This file preserves the earlier Stage B evidence and scope.

Branch: `codex/ui-v2-main-wip`. Parent: `526cc7ae62b8a5a4366f5a80654ce7d0bd064b72`. Resolve this handoff's exact commit with `git log -1 --format=%H -- docs/ui-v2/STAGE_B_REVIEW_HANDOFF_2026-10-11.md`. The user explicitly requested **commit and push** after review preparation. This supersedes the earlier online pause for the normal WIP branch push, which triggers its existing preview workflow. No merge or manual CI dispatch is authorized; `main` is unchanged. Stage C has not started. Confirm preview build-info against the pushed revision before treating deployment as current evidence.

The user instructed **“轻量模型pass就够了 马上准备交接review”**. Stage B implementation is closed for this review on the passing lightweight gate. This is not a claim of completed full-M3D, hardware GPU or physical touchscreen acceptance. The full-model rerun was stopped at the user's request, before its first width reported PASS; no further heavy browser check is required for this handoff.

## Implemented behavior

- One shared scientific model and actual original 3D engine in the v2 workstation; no legacy app startup or surrogate preview image.
- Exclusive Rotate/Pan/Zoom, optional no-tool state, Zoom-only wheel, one-finger tool gestures and pinch in every mode.
- Fit, Maximize/Restore, Fast/Quality, opacity 0.1–1, borders, PNG 3× and physical GLB export; Abort remains in the original task panel.
- Main inspection ROI clips real 3D; Section Z Break is shared. Mask process ROI and Section Detail remain independent.
- Mask ROI floating controls reuse Main's floating strip. Phone A/B endpoints remain circular: 40×40 touch, 24×24 desktop.
- Narrow 3D canvas is taken out of intrinsic layout sizing with two v2 CSS declarations. The reproduced 732×3416 expansion and blank capture are corrected; new PNG visibility and 0.25 px layout-stability assertions guard this behavior.

Latest product delta: `site/ui-v2/workstation-views.css`, `position: absolute; inset: 0` on `.v2-three-host canvas`. Latest check delta: `scripts/v2/check-three-view.mjs`, new `three-visibility.mjs`, expanded read-only `diagnose-three-layout.mjs`. Legacy budget remains **41/100** against `1664405ef7835a3e974a8551f19c8879186255bf`: Section port 8 additions, 3D opt-in port 33 additions, no deletions. Scientific geometry, schema, worker and IO algorithms are unchanged. Original assertions, including 0.25 px, were not relaxed.

## Review evidence

These are review captures, not replacements for approved visual baselines:

- [3D at 390 px](handoff/stage-b-review/three-390.png), [3D at 768 px](handoff/stage-b-review/three-768.png): final metalens product captures after real mouse gestures and display controls.
- [3D touch](handoff/stage-b-review/three-touch.png): final actual viewport after all one-finger and pinch checks, coarse pointer retained.
- [Circular phone A/B](handoff/stage-b-review/ab-mobile-fixed.png): complete M3D phone capture from the preceding Main acceptance, both handles 40×40.
- [Final lightweight passing report](handoff/stage-b-three-metalens-visible-report.json): four widths 1440/1024/768/390 and touch; unchanged model, shared ROI/Section linkage, real exporters, visible material pixels and stable capture dimensions.
- [Layout experiment](handoff/stage-b-three-layout-experiment-report.json): full-M3D diagnosis before the CSS repair, isolated absolute-canvas comparison. Diagnostic evidence, not a completed full-model acceptance gate.
- [Earlier Main](handoff/stage-b-main-report.json), [Mask](handoff/stage-b-mask-report.json), [Section](handoff/stage-b-section-report.json) and [full-M3D cancellation](handoff/stage-b-three-abort-pass-report.json): passing evidence for the revisions recorded in those reports. Cancellation was not rerun after the latest CSS-only repair.

Latest command: `WAFERCAD_V2_EXAMPLE=metalens node scripts/v2/check-three-view.mjs`, **PASS, exit 0**. Environment: Linux, Node 24.19.0, Playwright 1.55.1 / Chromium 140.0.7339.186, pinned local Three 0.179.1. Server port 4182; `PLAYWRIGHT_BROWSERS_PATH=/tmp/wafercad-playwright`; `WAFERCAD_THREE_DIR` points to this checkout's `node_modules/three`. Log: `/tmp/wafercad-phase-b-small-visible-final.log`. Portable report records parent revision and `dirty: true`, because validation preceded the local commit.

Latest lint, repository format and documentation checks pass. The preceding checkpoint's 612/612 Node tests and unchanged legacy smoke/workstation/interaction/layout checks also passed; they were not repeated for this two-line v2 CSS repair. See [the detailed checkpoint](STAGE_B_LOCAL_CHECKPOINT_2026-10-11.md) for chronology, commands, limitations and prior failures.

## Review focus and next checkpoint

Review real Main/Mask/Section/3D control ownership, circular A/B handles, the reused ROI floating strip and the narrow-screen 3D layout. Local review route: `http://127.0.0.1:4182/app-v2-workstation.html?example=metalens`; reproduction commands are in [Testing](../../testing.md). This localhost route belongs to the development environment. Public WIP candidate: `https://xiaolong-6.github.io/WaferCAD/preview/app-v2-workstation.html?example=metalens`; automatic deployment must complete and build-info must match before reviewing that URL as this revision.

Human visual acceptance and hardware/physical touch checks remain pending. Stage C is Process/History/Recovery wiring and comprehensive synchronization; it is outside this Stage B review handoff.
