# UI v2 desktop review and Stage C entry

This checkpoint records the user's directed local review on 2026-10-11. It supersedes toolbar/gesture presentation in the [earlier Stage B handoff](STAGE_B_REVIEW_HANDOFF_2026-10-11.md); it does not claim Stage C acceptance.

Branch: `codex/ui-v2-main-wip`. Parent: `39d016e942a106b1bdfdd4d6bac622e9ac7384ff`. Product revision: the commit containing this file (`git log -1 --format=%H -- docs/ui-v2/DESKTOP_REVIEW_2026-10-11.md`). [PR #177](https://github.com/Xiaolong-6/WaferCAD/pull/177) remains Draft. The user explicitly authorized commit/push after this review. No merge or expensive manual workflow was authorized.

## Accepted changes and preferences

| Area               | Accepted behavior                                                                                                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workstation        | Overview on wide startup at the existing 1121 px threshold; narrower startup uses Single. Existing compact/coarse-pointer policy remains. Manual mode choices persist across resize within this session.                                                                                                             |
| Mask               | Source before Draw, icon-only, direct File (folder, unselected) / Draw (palette, selected) toggle. No Source popup. Draw source forces Draw selected; clicking Draw selects Draw source. ROI may occupy the strip without changing source or saved Draw shapes.                                                      |
| 3D gestures        | Rotate/Pan mutually exclude each other as left-button modes. Wheel Zoom is independent and can coexist with either. No left-drag Zoom. Native two-finger pinch remains available with wheel Zoom off.                                                                                                                |
| 3D toolbar         | Fit / Rotate / Pan / Zoom, separator, Render Mode / Opacity / Borders, separator, Export. Fast is a lightning bolt; Quality is a star, no visible text. Opacity uses a compact range/percentage menu; Borders toggles directly. No Settings. One PNG/GLB Export menu; cancellation stays in the existing task panel. |
| Section            | Pan/Zoom can both be selected: left drag pans, wheel zooms. Fit is momentary viewport reset. Toolbar: Fit / Pan / Zoom, separator, Z Break / XZ Scale / Borders / ROI, separator, Layers / Export. Maximize stays the far-right window control.                                                                      |
| Z Break            | One button opens the existing draggable physical-µm floating editor. Show Z Break is a checkbox inside. Limits, Snap and linked Front/Back scales remain real shared controller features.                                                                                                                            |
| Section ROI        | One ROI button starts rectangular drawing; existing handles resize, body drag moves, and pressing ROI again hides/clears it. No Rectangle/Circle control or separate Detail/Settings toolbar entry. Owns only `sectionDetailRoi`; Main/Mask ROI remain independent. The inset remains draggable.                     |
| XZ Scale / Borders | Direct state toggles. Auto has an automatic-scale icon and is unselected; physical 1:1 has an equal-scale icon and is selected. No scale popup. Only display mapping changes.                                                                                                                                        |
| Export menus       | Main/3D/Section use shared compact popup placement. Section SVG is real; PNG stays disabled/pending under the prior decision.                                                                                                                                                                                        |
| Layers             | Visibility checkboxes at the right edge. Clicking a name edits inline; Enter/blur commits with existing rename functions, Escape cancels. IDs/geometry stay stable. Implant/Electrical names, colors, visibility and Follow offset/Smooth use existing model functions.                                              |
| Rename focus       | Main/Section/3D temporarily fade other material/annotation colors. List colors remain normal. A private cached presentation model provides renderer colors; focus never alters saved model/colors/revision/geometry. Commit/cancel/blur restores normal rendering. Mask File/Draw artwork has independent colors.    |
| Palettes           | Row palette closes on selection, outside click, Escape or repeat click. Every Random selection regenerates colors; Randomized is the disabled current-state label.                                                                                                                                                   |

Preserve the user's preferences: compact icon-first toolbars; distinct meaningful icons for two-state controls; direct toggles for binary options; menus for export/multiple values; consistent popovers; vertical separators between related command groups; left-button tools independent from wheel Zoom; feedback in the real canvas; real functions instead of mock controls. Avoid repeated permission prompts for reversible local edits. Local evidence drives progress; automatic CI supplies online review deployment.

## Architecture, budget and tests

One canonical project model remains shared. No legacy `app.js` boot/copied DOM, second 3D renderer, Kernel/worker/schema/IO changes, approved visual baseline updates or precision relaxation. `view-kit/tool-popover.js` extracts Main's existing placement for reuse.

Legacy product diff against takeover `1664405ef7835a3e974a8551f19c8879186255bf`: **43/100** (35 additions in `site/three-view.js`, 8 in `site/controllers/section-collapse-controller.js`, zero deletions). This batch alone changes 5 added + 3 removed legacy lines: **8**. Remaining allowance: **57**. v2/tests/docs are counted separately with `git diff --numstat 39d016e HEAD -- site/ui-v2 scripts/v2 docs/ui-v2`.

Existing browser tests were adapted only for explicitly approved behavior: new entry points, independent wheel Zoom, Source/Draw coupling and rectangular Section inspection. Full scientific-model equality, GLB metres, PNG dimensions and existing **0.25 px** assertions remain. The new review owner requires exact canvas restoration after cancelled focus and only name/revision changes after rename.

Windows, Node **24.16.0**, npm **11.17.0**, locked Playwright **1.55.1**, Chromium **140.0.7339.186**, Three **0.179.1**. `npm ci --no-audit --no-fund` installed 81 packages. Initial restricted-sandbox npm DNS/cache/localhost access failed; host-access retries succeeded. Headless WebGL identifies **ANGLE Vulkan SwiftShader Device (Subzero)**: software rendering, not physical GPU acceptance. Touch tests are emulation, not physical touchscreen acceptance.

Keep legacy HTTP on 4174 and `node scripts/v2/serve-v2.mjs` on 4182. Do not kill another session's server. Reproduce:

```powershell
$env:WAFERCAD_URL = 'http://127.0.0.1:4174'
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
npm run check
npm run test:ui:smoke
npm run test:ui:workstation
npm run test:ui:interaction
npm run test:ui:product:layout
node scripts/v2/check-main-view.mjs
node scripts/v2/check-mask-view.mjs
node scripts/v2/check-section-view.mjs
$env:WAFERCAD_V2_EXAMPLE = 'metalens'
node scripts/v2/check-three-view.mjs
node scripts/v2/check-three-export-abort.mjs
node scripts/v2/check-review-interactions.mjs
```

Exact results: [portable validation summary](handoff/desktop-review-validation.json). Ignored local logs: `test-results/ui-v2-integration/review-*.log`; screenshots/reports: `test-results/ui-v2-{main,mask,section}-review/`, `ui-v2-three-review-metalens/`, `ui-v2-three-export-abort/`, `ui-v2-review-interactions/`. These are review evidence, not approved baselines. Precommit reports correctly record parent HEAD and a dirty tree.

Two new checks initially failed: mobile canvas restoration sampled before the changed Section layout had painted; reference sampling now waits for the actual paint. The 390 px southeast resize handle was under the draggable inset; the sequence uses the visible northwest handle instead. Exact canvas equality and real ROI growth remain required. Narrow inset can cover part of ROI; use another handle or move the inset. CUA also exercised the visible integrated page, camera pan/wheel, Section ROI move/resize, opacity, rename, and palettes.

## Next stage prepared

The same page already supports shared views, Main ROI → 3D clip, Slice → Section, Z Break → 3D, visibility and independent viewports. **Process and History/Restore domain panels are not yet complete product integrations.** Front/Back needs full workflow sequence coverage. Passing view gates is not Stage C completion.

1. **C1, real workflow wiring:** reuse existing Process transaction/task and History snapshot controllers through v2 adapters. Mask ROI constrains Process; keep Main clip and Section inspection separate. Restore through the existing project-state controller, refresh all render/cache owners, release transient editors. Count new legacy ports against the remaining 57 lines before implementation.
2. **C2, integrated acceptance:** add `scripts/v2/check-sync.mjs` for real user sequences: Main ROI → clipped 3D; Slice → Section geometry; Mask ROI → real Process operation with changed material inside/unchanged outside; Section ROI → no change to Process/clip scope; visibility/Z Break/Front-Back → all owning views; History restore → exact previous model and four refreshed views; per-view Fit/Pan/Zoom → unchanged canonical geometry. Exercise Single/Overview/Split and slot replacement.
3. **C3, responsive review:** 1440/1024/768/390 plus touch, unchanged 0.25 px contract, software/hardware distinction, relevant local gates, small audited commit and automatic Pages review. User final acceptance remains on one four-view page. Keep Draft; never merge without explicit authorization.

Metalens is the lightweight routine review; `?example=jlfet` exposes actual Electrical annotations. Full M3D remains in Section and GLB Abort owners; tiny exports cannot prove cancellation. Local: `http://127.0.0.1:4182/app-v2-workstation.html?example=metalens`. Automatic preview URL: `https://xiaolong-6.github.io/WaferCAD/preview/app-v2-workstation.html?example=metalens`. Verify `preview/build-info.json` matches the pushed SHA before claiming deployment.
