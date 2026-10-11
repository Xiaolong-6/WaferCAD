# Main-only v2 hands-on review

The local checkpoint's existing-file table, legacy-isolation evidence, workaround inventory and approved view-kit extraction are in the [Main architecture health report](MAIN_ARCHITECTURE_HEALTH_2026-10-11.md). The extraction section records the latest stage; historical stops below preserve earlier decisions. Mask implementation awaits user approval.

Date: 2026-10-11. Base: da37fe4d217d26f23941144908f5abe9d4dc784c. Branch: codex/ui-v2-m3-main-audit-20261010. The latest checkpoint section below supersedes historical behavior/status entries. Product changes are checkpointed locally; no push, merge, baseline replacement or D2 work. Resolve the exact local revision with `git log -1 --format=%H -- docs/ui-v2/MAIN_COURSE_CORRECTION_2026-10-11.md`.

## Approved scope and behavior

M2 components/styles own every visible control. No legacy app boot or legacy DOM copying/reparenting. Existing controller changes are additive optional injection hooks; default legacy paths retain their existing behavior. The separate D1 CSS change is formatting only, explicitly authorized.

Main uses the real Plan renderer and Main/ROI/Slice public controller factories through a new dependency-injection adapter. SVG uses the existing Export controller public API. No science/model/worker/IO/schema implementation is edited.

The same source as M2 is loaded using unchanged readProjectFile(): site/examples/m3d-selfpowered-full-replay.wafercad, SHA-256 31f07d85c32d44685ef7f49485e432c2b73f713550dd981998376c61de46995b. The final m3d-step-36 model supplies the caption: 27 layers / 551 regions / physical micrometres. Review starts Front / Fit / no ROI. No project saving or persistence is booted.

User decisions: ROI opens a Rectangle/Circle/solid Sector creation menu; draw first, then edit. Five physical anchors are retained. Clear removes ROI, resets anchor and closes settings. Pan is an exclusive tool; Escape exits. Zoom opens +/- controls (legacy 1.25 step), wheel and double-click Fit remain. Slice uses a v2 nonmodal floating editor; canvas creation, A/B dragging and coordinate fields reuse existing controllers. Real SVG is wired; PNG is explicitly deferred. Other view/panel functionality is restricted for this Main-only review.

Approved M2 Main contract changes remove Ring, Ring sector and Rotation, retain solid Sector and show shape-relevant dimensions. Mask/other domain capabilities remain outside this change. No approved screenshots are changed.

## Run and hands-on review

From the repository root in PowerShell:

```powershell
npm ci
node scripts/v2/serve-v2.mjs
```

- Real Main: http://127.0.0.1:4182/app-v2-main.html
- M2 Main reference: http://127.0.0.1:4182/app-v2.html?example=m3d&domain=project&review=main

Try Pan/Escape; Fit/wheel/double click; Zoom +/-; each ROI shape; settings and five anchors; Clear; Section line/A-B fields/dragging; SVG and Max/restore. Review at 1440/1024/768/390 widths.

Known scope gaps: Project/other views are not connected; PNG deferred; units fixed to micrometres; project view preferences are not restored or saved. M2 remains a simulated presentation; Main draws the real scientific model.

## Reproducible checks

```powershell
npm run check
$env:WAFERCAD_URL='http://127.0.0.1:4174'
$env:WAFERCAD_THREE_DIR=Join-Path (Get-Location) 'node_modules/three'
npm run test:ui:smoke
npm run test:ui:workstation
npm run test:ui:interaction
npm run test:ui:product:layout
node scripts/v2/check-main-view.mjs
```

Legacy tests require a separate site-root server: python -m http.server 4174 --bind 127.0.0.1 --directory site. Do not use the v2 server's default root route for legacy Welcome tests.

Environment: Windows, Node 24.16.0, locked Playwright 1.55.1 / Chromium 140.0.7339.186, Three 0.179.1 served locally for legacy browser suites. Browser screenshots are review artifacts, not accepted baselines.

Full local check passed with 604/604 Node tests. Legacy smoke, workstation, View UX v3 and interaction passed. Final responsive legacy and Main check outcomes are appended after completion. No assertion or legacy test is relaxed. Main checks retain independent 0.25px ROI and A/B projection assertions.

Format-only preview and equivalence evidence: test-results/main-format-preview/format-only.diff and equivalence.json. JS Espree AST including comments compares equal after excluding source-position/raw-format metadata. CSS parser trees retain selector/declaration ordering and comments and compare equal after excluding source-format metadata. Markdown rendered by Marked GFM compares exactly equal. All five files pass. Main review captures/report: test-results/ui-v2-main-review/.

The hard cap applies to changed existing product files; new v2 files are reported separately. Before the final handoff, count the full change against the product base, including the format commit, without resetting the count after committing formatting. Stop after handing over both pages for the user's feedback round.

## Final local verification / stop

Final npm run check: PASS, 604 tests, 604 passed, zero failures/skips. Final Main browser review: PASS at all four widths, no duplicate IDs, overflow, app.js boot or page errors; 0.25px ROI/A-B assertions unchanged; Circle/Sector, top-left anchor persistence and real SVG downloads passed. Model remains byte-for-byte JSON equal to its loaded state.

Unchanged legacy commands all passed: test:ui:smoke, test:ui:workstation (including View UX v3), test:ui:interaction, test:ui:product:layout (wide/medium/phone, 109 captures). These are the owning legacy regression groups; the entire test:ui:all browser inventory was not executed.

Changed existing product files against da37fe4: 188 added/deleted lines including formatting. New Main product files: 733 lines (entry 32, presentation 493, CSS 58, runtime adapter 150). New test/script/document lines are separate from product totals. The 200-line existing-product hard cap is respected without compressing source or omitting the format commit.

User changed review to hands-on testing: deliver the two live M3D URLs and a short try list, then stop for a batch of feedback. Four-width screenshots remain supporting artifacts. Only the five verified format files are committed separately; Main changes remain local, uncommitted and unpushed for this review.

## Later feedback batch: gate stopped

The user requested gated Pan/Zoom without a Zoom popup, a persistent ROI icon strip with Select/Slice/Rectangle/Circle/Sector, editors after Sector, and one Export dropdown. The draft now implements those changes, plus 0.1 nm (0.0001 micrometre) input/display precision for positions and dimensions. Loaded model geometry and mouse coordinate projection are not rounded. Existing product changes against the base total 190 lines.

This batch is not accepted: npm run check passed lint but stopped at Prettier for the new Main browser script. A second formatter pass changes only the wrapping of its floating-tool evaluateAll expression. Preview: test-results/main-feedback-format.diff. The preview has not been applied; no commit/push occurred. Full Node tests did not start. Legacy smoke/workstation/View UX v3 passed this batch. The Main browser run was interrupted at the gate stop; its earlier report must not be presented as proof of this later batch.

## Independent Pan / wheel Zoom (latest user correction)

Pan and Zoom now have independent enabled flags and may both be selected. Pan handles only left-button dragging; Zoom handles only the wheel. Zoom never opens an overlay or implements drag-to-zoom. Turning either off leaves the other flag unchanged. Selecting an ROI/Slice pointer tool releases Pan's ownership of the left button while retaining the wheel Zoom preference. Escape exits pointer tools and clears Zoom. This supersedes the prior mutually exclusive Pan/Zoom and vertical-drag behavior.

The revised Main harness covers all four Pan/Zoom combinations, actual Slice creation, the persistent icon strip and its toggle, single Export dropdown, editors after Sector, 0.1 nm input precision and unchanged 0.25px projection assertions. The earlier script-format stop is superseded by the new test changes, formatted locally and checked successfully. No commit/push is authorized for this feedback batch; report final test outcomes after completion.

## Latest verification: legacy failure stops this batch

The independent Pan/wheel Zoom draft passed npm run check (604/604 Node tests, lint, Prettier and documentation checks) and node scripts/v2/check-main-view.mjs at 1440/1024/768/390. Unchanged legacy smoke and workstation (including View UX v3) passed. However npm run test:ui:interaction failed at scripts/interaction-regression.mjs:360: the Mask Export details element was closed after the export-menu action (expected true, actual false). Evidence: test-results/main-independent-legacy-interaction.log. The sequential legacy runner stopped there; product layout was not rerun for this batch. No cause has been established, and no legacy test/assertion was changed.

Per the user's explicit legacy-failure stop rule, no further product coding, commit or push was performed after discovering this failure. Latest requested work remains pending: independently gated touch drag/pinch and replacing the Main ROI settings popup with controls in the persistent ROI strip after Sector. Main screenshots currently represent the mouse Pan/wheel Zoom draft, not those pending requests. Await user authorization to investigate the legacy failure before resuming product changes.

## Legacy menu investigation and corrected ROI request

The user authorized investigation of the failed legacy interaction test. An unchanged npm run test:ui:interaction rerun passed, confirming intermittent timing rather than a consistently closed menu. An ignored instrumented copy of that same script then reproduced the same assertion failure, preserving the original assertions. Browser capture-phase events and HTMLDetailsElement.open setter stacks establish the cause at a 503.4375px Mask panel width: pointerdown on Export closes the nested Opacity control; Export opens; the delayed Opacity toggle listener closes More at view-popover-controller.js:59; More's delayed toggle closes Export at line 54. This is a product menu race, not evidence that an assertion should be relaxed.

The reproduction also replaced the Main and ROI controller browser responses with their original da37fe4 sources. The failure persisted. The culprit view-popover-controller.js is unchanged from da37fe4 and has no local product diff. No legacy test or assertion was edited. Diagnostic artifacts are ignored under test-results/legacy-menu-investigation/: baseline.log, events-setter.json (final Export false), after-export.png, proposed-fix.diff, proposed-events.json (final Export true), proposed-after-export.png and proposed-run.log.

A candidate single-line condition was tested only through a temporary browser route: close More after a secondary control closes only if More contains no other open details. With the original Main/ROI sources, the instrumented interaction script passed completely (exit 0), including its original checks. This evidence does not mean the product is repaired: the candidate remains unapplied. Applying it would add two changed existing-product lines (one deletion, one insertion), taking the counted total from 190 to 192 against da37fe4. No commit, push, test relaxation or baseline change occurred. No new full check was run since no product code was changed in this investigation.

Environment remains Windows, Node 24.16.0, Playwright 1.55.1 / Chromium 140.0.7339.186 and local Three 0.179.1. Commands: WAFERCAD_URL=http://127.0.0.1:4174, WAFERCAD_THREE_DIR=<repo>/node_modules/three; npm run test:ui:interaction; node test-results/legacy-menu-investigation/baseline-instrumented.mjs; node test-results/legacy-menu-investigation/proposed-instrumented.mjs. Diagnostic copies are supporting evidence; the source-of-truth regression is unchanged scripts/interaction-regression.mjs.

The user clarified the pending ROI request during investigation: ROI settings should use the same nonmodal floating editor pattern as Slice settings, retaining its settings button after Sector. It should not expose permanent input fields directly in the icon strip. This supersedes the earlier interpretation of inline persistent fields. Touch drag/pinch gating and this nonmodal ROI editor remained pending at the investigation checkpoint. The subsequent approved fix and verification are recorded below.

## Approved legacy fix and floating-editor form review

The user authorized applying the menu fix and rerunning checks. The single-line condition is now applied in site/controllers/view-popover-controller.js. Existing legacy scripts and assertions remain untouched. New site/tests/view-popover-race.test.mjs has three deterministic delayed-toggle regressions: retain the new Export/More owner after Opacity closes, release More when the final secondary editor closes, and preserve explicit More-close behavior for all nested controls. Changed existing product lines against da37fe4 now total 192 including the previous format commit, below the 200-line hard cap. New Main product files are separately counted at 802 lines: entry 32, presentation 537, CSS 61, runtime adapter 172. The standalone visual proposal is outside product files; tests/scripts/documentation are reported separately from product changes. This authorization permits the targeted legacy behavior fix; other controller changes retain their additive Main-only hooks.

An initial full check stopped at Prettier because newly appended handoff text had mixed line endings. A formatting preview confirmed identical Markdown-rendered HTML and an empty Git-normalized text diff. The user explicitly authorized formatting only this document. After that correction, npm run check passed: lint, Prettier, documentation validation and 607/607 Node tests, zero failures/skips. Unchanged legacy test:ui:smoke, test:ui:workstation (including View UX v3), test:ui:interaction and test:ui:product:layout all passed; the latter produced 109 captures. Logs: test-results/main-legacy-fix-full-check.log and main-legacy-fix-{smoke,workstation,interaction,product-layout}.log. Environment and legacy server/Three variables remain as recorded above. The broad test:ui:all inventory was not run. No new commit or push occurred; HEAD remains 918b4bbcc9cdaaef08b419aebff7441f40c12f3e.

The user requested reviewing the nonmodal floating-editor form before wiring it. An independent local design artifact uses the actual M2 tokens, components and fonts over an embedded unchanged Main/M3D page. It is served at http://127.0.0.1:4183/ from the task's visualization directory, outside product files. Proposed form: white surface, 1px M2 border, 8px radius, shadow-1; draggable header with close icon; compact two-column coordinate/dimension fields; 320px ROI editor and 260px Slice editor; no scrim/focus trap; clicking the canvas retains both editors. ROI retains Clear/Apply; Slice retains Done. These are presentation controls and do not edit the real model. The preview verified canvas access, exact tool ordering, two separators, position input step 0.0001 micrometres and no page errors. This is neither final Main interaction acceptance nor an approved visual baseline.

Latest requested tool order: Select | Slice, Slice settings | Rectangle, Square, Sector, ROI settings. The two break-line positions are shown as group separators in the preview. Square is shown as a square icon/shape choice only; its scientific drawing behavior has not been implemented or substituted silently for Circle. The real Main page still has the previous toolbar/editor behavior. The user reviews this visible proposal before implementation. Independently gated touch pan/pinch and replacing the actual ROI modal with this nonmodal editor remain pending. Stop here for the user's form review; do not advance other views, commit/push, or change approved baselines.

Latest presentation feedback: all UI text and development artifacts use English. The independent preview now uses English for its heading, hints, parameter labels and action feedback. Slice settings replaces the abstract alignment glyph with an edit pencil, retaining the M2 16px outline style. A combined endpoint-line/pencil draft was simplified for readability at its actual icon size. The preview's language attribute, visible English-only text, action feedback and pencil icon were verified in Chromium; the updated full screenshot and toolstrip detail are local preview.png and tools.png. These changes affect the review artifact only, with no additional product diff.

## Main floating-editor checkpoint: latest verified behavior

The approved floating-editor design and plain-pencil Slice settings icon are now wired into real Main. The persistent icon strip order is Select | Slice, Slice settings | Rectangle, Square, Sector, ROI settings. Square constrains the existing rectangular inspection ROI to equal sides; it introduces no science/schema shape. Slice and ROI settings are draggable, bounded, nonmodal M2-style floating panels. Canvas clicks preserve them; Escape closes the active editor and returns focus; deselecting the ROI owner closes both. Settings apply through existing public controllers. Editable/displayed lengths use 0.0001 micrometre precision without rounding the loaded scientific model.

Pan and Zoom are independent: left drag/single-finger drag require Pan; wheel/two-finger pinch require Zoom. All four enabled-state combinations passed for mouse and emulated touch. Pinch cancels a pending one-finger ROI draft; touch Square and Slice creation passed. Physical touchscreen review remains separate from emulated coverage.

Final gates before the local checkpoint: npm run check PASS (lint, Prettier, docs, 610/610 Node tests); unchanged legacy smoke, workstation/View UX v3, interaction and product-layout PASS (109 layout captures); node scripts/v2/check-main-view.mjs PASS at 1440/1024/768/390 plus touch. Exact commands/environment/logs, isolation searches and workarounds are recorded in the linked architecture health report. No legacy test or 0.25px assertion changed. The initial report-navigation and obscured-canvas test failures were corrected only after explicit user approval; the successful reruns supersede those failures.

Existing product additions plus deletions against da37fe4 remain 192/200, including the separate format-only commit; the budget does not reset. New Main product files total 1,206 lines, reported separately. Main/M2 use the identical full M3D source/hash and authoritative 27-layer/551-region caption. Scientific model JSON is unchanged after interactions.

Live review: http://127.0.0.1:4182/app-v2-main.html and http://127.0.0.1:4182/app-v2.html?example=m3d&domain=project&review=main. Reproduce with node scripts/v2/serve-v2.mjs. Screenshot comparison: test-results/ui-v2-main-review/index.html; actual editor captures are main-floating-{1440,1024,768,390}.png. These are ignored supporting artifacts, not approved baselines. Known scope gaps: PNG deferred; Project/other views disconnected; units fixed to micrometres; view preferences not persisted.

The user authorized a local checkpoint only. Preserve the unrelated M1.5 README link/document/capture script outside the commit. The architecture proposal includes one shared floating-strip component/style for Main ROI and Mask Draw, configuration-only differences, and Mask tools constrained to the audited legacy controller capabilities. No view-kit extraction or Mask implementation has started. Stop after delivering the checkpoint and report; wait for the user's approval before either next step.

## Approved behavior-preserving view-kit extraction

Stage base: 6dfff3b0ac58a9d3af1db550ece1a3629a6e0864. Main now imports the shared floating-strip, floating-editor, inspection-fields and plan-gestures modules directly. The Main-only overlay-manager and touch modules are deleted, and their shared implementations/styles are not duplicated in Main. Tools/groups/field values and controller actions remain Main configuration. No new feature or Mask integration is included.

The revised cap counts legacy product code only; this extraction changes 0/40 legacy lines. Report v2 changes separately: 427 added/deleted lines in existing v2 files plus 384 new shared lines. main-view.js is 580 -> 560 lines; main-overlay-manager.js is 143 -> 0 (deleted/migrated). Main-specific source is 897 lines and shared source is 384, total 1,281. The original cumulative legacy changes against da37fe4 are 32 lines; the former mixed legacy/v2 192-line count is historical under the superseded budget rule.

All required checks passed unchanged: npm run check (lint/Prettier/docs, 610/610 Node); four legacy smoke/workstation/interaction/product-layout suites (109 captures); Main four widths plus touch and unchanged 0.25px assertions. Repeated isolation greps, AST preservation evidence, refreshed workaround table, environment/logs and screenshot comparison are in the architecture report's extraction section. Initial Main PNGs at all four widths are byte-identical to the previous checkpoint. A read-only original-checkpoint replay passed the identical Main command with exactly equal recorded runtime results. One extracted 1440 floating-panel capture differed in position; three direct comparisons and the original replay did not reproduce it. Exact panel pixel repeatability and its cause remain unproven; no positioning change was added in this extraction. The report retains all evidence and this limit.

The pages and run commands are unchanged. Commit locally only, preserve unrelated M1.5 work and do not push. Stop after the extraction checkpoint and wait before Mask.
