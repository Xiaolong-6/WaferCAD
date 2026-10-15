# M5-Lite default entry handoff — 2026-10-12

> **Post-release correction, 2026-10-13:** The current v2 footer shows a linked deployed commit SHA, not the former “Use legacy interface” action. The legacy URL still exists for compatibility, but direct navigation is not an automatic save. Save or export the project before leaving v2. Historical tests below describe the earlier release revision. See [current handoff status](../../HANDOFF_STATUS_2026-10-13.md).

## 上线交接摘要

M5-Lite 原计划 Step 1–4 已完成。PR #177 已合并并正式上线；本轮没有剩余实施步骤。

- 上线提交：`80e01d1a0571f357782bda3dffcadbe252f90086`。
- 产品修复提交：`481ccb82`；最终验收 HEAD：`5e0b9f6851a434f144a58e397f5188ae81e7842f`。
- 正式入口：<https://xiaolong-6.github.io/WaferCAD/app.html>。
- Historical same-origin fallback: <https://xiaolong-6.github.io/WaferCAD/app-legacy.html>. The automatic save-and-switch footer action has since been removed.
- 发布记录：[Pages run 38217432460](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38217432460)，结果 SUCCESS。
- 合并记录：[PR #177](https://github.com/Xiaolong-6/WaferCAD/pull/177)。最终 HEAD 的 33 项有效 CI 检查全部通过；一个重复触发的 Stage C 任务因并发策略取消，不计为通过。
- 公开预览及正式站点均验证了 Code 切走后隐藏且草稿保留、MASK 点击最大化、History 真实滚轮滚动。正式站点 History 列表高 541 px、内容高 2042 px、滚轮后 scrollTop 为 600 px；无页面错误。
- 正式站点 `build-info.json` 已确认上线提交；Legacy 入口 HTTP 200。浏览器验证使用隔离存储及固定 Three 0.179.1，未触碰用户项目。

### 下轮工作顺序

| 优先级 | 交接任务                                           | 边界                                 |
| ------ | -------------------------------------------------- | ------------------------------------ |
| P1     | Recipe 复杂 Run All、失败/Abort 恢复及重放边界     | 保留当前事务、失败原子性和恢复门禁   |
| P1     | Variants 编辑、Insert、Copy-on-write、复杂分支重放 | 保留实体 ID、完整 History 与项目格式 |
| P2     | M2 全量视觉细节、四档宽度、真实触控设备收口        | 不替换批准基线以掩盖失败             |
| P2     | RTX 3060、透明渲染、重型阵列与性能专项             | 本轮软件 WebGL 不等于硬件 GPU 验收   |
| P3     | 旧 DOM/CSS 清理、收敛测试/预览双入口               | 保留 Legacy 回退及 Preview 协议      |

下一位接手者先拉取 `origin/main` 并检查最新 HEAD、PR 和工作树。不要继续在已合并的
`codex/ui-v2-main-wip` 上实施产品改动。若需回滚默认 UI，使用普通修复提交恢复 Legacy
入口；不要清空 IndexedDB/localStorage 或删除 Recovery。

## Revision and behavior

Repository: `Xiaolong-6/WaferCAD`; branch: `codex/ui-v2-main-wip`; PR: #177.
Product revision: `481ccb82` (public-preview corrections).
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
installation completes. An explicit empty `start=` value is rejected and
restores the saved workspace rather than replacing it with the blank bootstrap.

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
- A focused malformed `start=` check preserved the exact saved model, 46 History nodes and seven Variants.
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
with the complete four-unit fixture saved before reload checks. Final-head CI
also passed, including review-interactions.
No approved visual baseline or scientific assertion was relaxed.

## Public-preview corrections

User review found Code controls leaking after leaving Process, Mask navigation
missing the M2 maximize behavior, and an unscrollable History list.
`481ccb82` limits Code flex layout to visible hosts and hides all Process
subhosts outside Process. Mask navigation selects and maximizes Mask, and
leaving Mask clears that maximization, matching M2. The real History host now
uses the bounded fixed-header/inner-scroller structure already defined by M2.
Code drafts remain mounted and retained; no project geometry or History data
is changed by these navigation fixes.

Validation: `WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/v2/check-sync.mjs`
passed at 1440, 1024, 768 and 390 px, plus 1024 px touch. Its new regressions
switch Code to Project/Mask/History, check hidden controls and preserved draft,
assert Mask maximization, and scroll the full 46-node History with an actual
mouse wheel. Existing ROI, Process, History restore, Undo/Redo, export/recovery
and Recipe atomicity checks also passed. `npm run lint`, focused Prettier
checks and `git diff --check` passed. Environment remains Linux, Node 24.19.0,
Playwright 1.55.1, Chromium 140 and Three 0.179.1 with SwiftShader.

## PR and release status

PR #177 was merged after final head `5e0b9f68` passed all 33 effective CI
checks. The user explicitly authorized merge and formal publication on
2026-10-12. Merge commit `80e01d1a0571f357782bda3dffcadbe252f90086` was deployed
successfully by automatic Pages run `38217432460`. Production build metadata
and the actual three reported interactions were checked after deployment.
The documentation-only handoff commit does not change the deployed site.

## Rollback and follow-up

For direct Legacy navigation, save or export the current project first and then
open `app-legacy.html` on the same origin. The release-time footer switch
previously saved before navigating; that control is now removed. Shared storage,
checkpoint/Recovery and exported `.wafercad` files remain recovery mechanisms. The cross-UI owner exercises
this fallback with real persisted History and Variants.

If the published default must be reverted, restore Legacy markup into
`app.html` in a normal corrective commit while retaining the v2 entry for
investigation. Preserve IndexedDB/localStorage and Recovery records.

Complex Recipe replay, advanced Variant editing, complete visual signoff and
hardware-GPU performance work remain follow-up tasks from the M5-Lite plan.
