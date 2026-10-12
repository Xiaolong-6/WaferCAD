# M5-Lite default entry handoff — 2026-10-12

## Revision and behavior

Repository: `Xiaolong-6/WaferCAD`; branch: `codex/ui-v2-main-wip`; PR: #177.
Product revision: `1142c9e94d98cff0e04bfcb89c4c6bcc2ddcc4e6`.
Startup adaptation is in `f0078376`; default entry promotion is in `0e746cb1`;
remaining browser entry fixes and formatting normalization are in `643417c8`.
`5ce8f7e7` uses the shared versioned Example URL and existing Project worker so
Welcome-prefetched bytes are reused by the new default workstation.
`9c19907e` places the Legacy switch in the wrapping status controls, without
covering the existing footer links.
The final departure patch requests save on tab hiding/unload, preserves view
preferences before releasing the lease, and guards pending structural edits or
active tasks with the browser unload confirmation. A cached page reloads to
reestablish a live session. The workspace body is inert during startup; task
dialogs remain available, and editing begins only after validated project
installation completes.

- `site/app.html` opens the v2 Workstation. `site/app-legacy.html` preserves the previous application page and its relative assets.
- Welcome opens Empty, full canonical Examples, and staged imports in v2. Embedded previews use Legacy and retain their source/view parameters on refresh.
- Without explicit startup intent, v2 restores the shared persisted workspace or creates a blank Base. Explicit replacement uses the existing checkpoint protection. Failed staged imports retain the temporary input for retry.
- “Use legacy interface” blocks while a task is busy and flushes structural and view persistence before navigating. Save/ownership failure keeps the user in v2 with an actionable status.
- Both interfaces retain the existing persistence/session implementation; no schema or physical geometry changes were introduced.
- Existing Legacy browser owners explicitly select the retained page. Default route/Welcome coverage runs in ordinary browser contexts through the new M5 owners. Small Metalens interaction owners import the complete four-unit Process project; M4 continues to check the canonical full array.
- Startup/recovery owners reuse the Stage C/M4 workflow. Push and PR events share one concurrency group to avoid running the same acceptance job twice.

## Local evidence

Environment: Linux, Node 24.19.0, Playwright 1.55.1, Chromium 140.0.7339.186,
pinned Three 0.179.1; browser 3D uses SwiftShader software WebGL.
Tests use isolated browser storage. No user browser data was edited.

- `npm test`: 616 passed, 0 failed before final route wiring. Quality CI passed on `1cf723e1`: 633 tests passed, 0 failed. The later product patch moves the Legacy link within the existing status controls.
- `npm run lint`, `npm run format:check`, `npm run docs:check`: passed. The pre-existing formatting warnings were normalized without changing behavior.
- `node scripts/v2/check-startup.mjs`: passed again after the bundled Project worker integration against `app.html`; includes actual Welcome Example, GDS/OAS upload, Legacy preview/postMessage, no-intent recovery, Empty, invalid intent, failed staged retry and full staged Project History.
- `node scripts/v2/check-cross-ui-recovery.mjs`: passed again after the bundled Project worker integration; exercises the save-before-switch link with pending edits, exact Legacy → v2 → Legacy → v2 geometry/History/Variant restoration, and a simultaneous Legacy tab that cannot overwrite the v2 writer.
- `WAFERCAD_URL=http://127.0.0.1:4174 node scripts/example-open-benchmark.mjs photodetector-literature 1 --headless`: passed on the real default v2 route with the original cache assertions. The warmed project used 690,775 cached body bytes and transferred 0 bytes; its 46 History nodes were decoded by the Project worker. This cache owner deliberately uses no Playwright routes.
- Legacy `npm run test:ui:workstation`: passed after the route migration, including stalled Three.js and navigation scenarios.
- Legacy `npm run test:ui:persistence`: passed after the route migration, including recovery checkpoints, staged handoffs, writer takeover and failed-save protection.
- A delayed Example-load check confirms the workspace cannot be edited before startup completes and enables the full 46-node project on Ready.
- The departure regression proves pending structural edits cancel a silent unload, start a final save, and reload with exact geometry and 46 History nodes.
- Published preview on `cf139be1`: actual `preview/app.html` loaded the full Photodetector through its Project worker; the product link navigated to `preview/app-legacy.html` and restored exact geometry/Variants with no page errors. Production root remained at main revision `27e38640`.
- Stage C synchronization: passed at 1440, 1024, 768 and 390 px, plus 1024 px touch simulation.
- A focused Legacy-link layout check passed at 1440 and 390 px: link visible inside the footer, within the viewport, with no horizontal overflow.
- M2 live parity: passed at the four widths in CI on `cf139be1`, using the complete small fixture.
- M4 projects: passed for M3D, Photodetector, canonical full Metalens and its compatibility alias.
- Focused route-sensitive Node tests: 49 passed; startup-controller/CI-planner/Welcome tests: 38 passed.

These local results are distinct from final-head CI. Review-interactions now
passes locally at all four widths plus touch, including Electrical controls,
with the complete four-unit fixture saved before reload checks. Its final-head
CI result remains pending.
No approved visual baseline or scientific assertion was relaxed.

## PR and release status

Product commits are pushed incrementally on the existing branch. PR #177 is
Ready for review with an updated title and implementation/validation summary.
Final-head CI must pass before merge. No merge or production Pages deployment
has been performed in this session.

## Rollback and follow-up

For immediate UI fallback, use `app-legacy.html` on the same origin. The v2
switch action saves first; shared storage, checkpoint/Recovery and exported
`.wafercad` files remain the recovery mechanisms. The cross-UI owner exercises
this fallback with real persisted History and Variants.

If the published default must be reverted, restore Legacy markup into
`app.html` in a normal corrective commit while retaining the v2 entry for
investigation. Preserve IndexedDB/localStorage and Recovery records.

Complex Recipe replay, advanced Variant editing, complete visual signoff and
hardware-GPU performance work remain follow-up tasks from the M5-Lite plan.
