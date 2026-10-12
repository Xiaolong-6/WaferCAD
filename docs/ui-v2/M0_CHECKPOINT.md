# UI v2 M0 检查点 — 2026-10-09

本轮仅实施 M0。已拉取 main `fbbb2f9f3a585574e20ed706c34653164f13440c`，在 `refactor/ui-v2-m0` 记录证据与生成库存；用户批准前不进入 M1，不创建 v2 产品 shell/CSS。

## 交付

- [用户 r2 执行计划](R2_PLAN.md)：阶段门槛与禁止修改范围。
- [DOM 契约](CONTRACT.md) / [contract.json](contract.json)：静态 ID、属性、引用方、动态创建/结构/状态和未解析点。
- [隐式依赖](IMPLICIT_DEPS.md)：40 条，包括启动先后、重挂、祖先选择器、可见性、事件传播、测试耦合。
- [PR #161 复盘](PR161_POSTMORTEM.md)：描述/diff/讨论/CI，视觉失败与 interaction/格式失败分开。
- [风险和估算](RISKS_AND_ESTIMATE.md)：装配重写、DOM 适配域和分阶段工作量。
- [问题与决策](ISSUES.md)：存储域、路由和只读耦合。
- 生成命令：`node scripts/ui-contract-extract.mjs`；复核：`node scripts/ui-contract-extract.mjs --check`。
- 独立浏览器核对：`node scripts/ui-contract-verify.mjs`，比较真实 HTML parser 与库存，并检查 Recipe 初始化和重复 ID。

最终库存：**259 个静态 ID、205 个明确动态类名、1 个计算类名模式、56 处动态 DOM ID 声明/调用、843 个运行时 DOM 生成/状态/结构操作**。静态 `data-*` 属性 39 处、role 15 处、aria-controls 目标 7 个；无重复静态 ID、无缺失静态 aria-controls 目标。5 个尚未静态解析的创建/markup/class 表达式保留完整源码，不能当作已覆盖。隐式依赖 40 条。

## 环境与命令

Windows / PowerShell，Node `v26.7.0`，npm `11.19.0`；锁定 Playwright `1.55.1` / Three `0.179.1`。实测浏览器是本机 Chrome **155.0.8059.40**，以 `WAFERCAD_CHROMIUM` 启动独立测试 profile，未使用日常浏览器会话。不能把本轮结果称为 Playwright 捆绑 Chromium 140 的通过，也不能推断 Linux 像素稳定性。

| 命令                                                                                                    | 结果                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm ci`（网络环境重试）                                                                                | exit 0，81 packages，audit 0 vulnerabilities；package/lockfile 未修改。                                                                                |
| `npm run lint`（初次及最终工具检查）                                                                    | exit 0。产品代码等于基点；检查同时包括新审计脚本。                                                                                                     |
| `npm test`                                                                                              | exit 0，523 passed / 0 failed / 0 skipped，约 261 秒。测试执行时产品源码完全等于 main。                                                                |
| `npm run test:ui:fast`（Chrome 155）                                                                    | exit 0，Smoke、Workstation、View UX v3、Resilience 全部通过。原入口/断言未修改。                                                                       |
| `node scripts/ui-contract-extract.mjs` / `--check`                                                      | exit 0，库存可重复生成且一致。使用锁定 ESLint 的 Espree 和锁定 Prettier；未加依赖。                                                                    |
| `node scripts/ui-contract-verify.mjs`                                                                   | exit 0，259 个静态 ID 的元素/属性与浏览器精确一致；运行时 292 个 ID 无重复，33 个 Recipe initMarkup ID 全部存在；无 pageexception/native-dialog 错误。 |
| `npm run docs:check`                                                                                    | exit 0，生成说明/diagram 与内部导航检查通过。                                                                                                          |
| `npx prettier --check scripts/ui-contract-extract.mjs scripts/ui-contract-verify.mjs "docs/ui-v2/*.md"` | 新增审计文件格式检查通过。                                                                                                                             |
| `npm run format:check`                                                                                  | exit 1，18 个现有文件格式警告；本轮没有格式化这些文件，详见下文。                                                                                      |

浏览器复现设置（服务需先启动；使用任一本机只读静态服务器）：

```powershell
$env:WAFERCAD_URL = 'http://127.0.0.1:4174'
$env:WAFERCAD_CHROMIUM = 'C:\Users\liux16\AppData\Local\Google\Chrome\Application\chrome.exe'
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
npm run test:ui:fast
node scripts/ui-contract-verify.mjs
```

本轮用 Node 的只读 http server 在 4174 服务 `site/`，完成后停止。默认 WindowsApps 的 python alias 无法运行，捆绑 Python 的 4173 服务未能响应；它也已停止。未来可按仓库说明用可工作的 Python `-m http.server 4174 --bind 127.0.0.1 --directory site` 复现，无需修改产品。

初始工作树干净，原分支 `feat/process-recipe-v1` / `9e13a16` 保留。默认 git fetch 因旧 refspec 指向远端已删除的 feat/mask-file-draw 失败，使用显式 main refspec 成功；`git switch -c main --track origin/main` / `git pull --ff-only origin main` 完成，main 当时已是最新。没有修改 origin fetch 配置。

第一次沙箱 `npm ci` 因 registry DNS 失败（并产生清理 EPERM）；授权网络环境重试成功。第一次 test:ui:fast 因缺少 Chromium headless executable 在启动前失败。`npx playwright install chromium` 下载了捆绑版本 140.0.7339.186 / build 1193，但长时间停在解压；停止了本轮安装进程，保留部分缓存，没有删除文件。随后用已安装 Chrome 155 成功运行全部 fast 基线。捆绑 Chromium 140 的验证仍未完成，不因备用浏览器通过而隐去此边界。

全仓 format:check 的 18 个警告文件：`site/controllers/mask-import-controller.js`、`section-controls-controller.js`、`tool-tabs-controller.js`、`view-maximize-controller.js`（后三个同在 controllers）；`site/gds.js`、`layout-io.js`、`oasis.js`、`roi-editor.js`、`sample-layouts.js`、`startup-file.js`、`view-interactions.js`；`site/tests/gds-errors.test.mjs`、`oasis.test.mjs`、`roi-editor.test.mjs`、`view-interactions.test.mjs`（后三个同在 tests）；`scripts/klayout-compat.mjs`、`docs/COMPETITIVE_LANDSCAPE.md`、`.prettierrc.json`。其中多项是用户禁止修改范围；本轮只记录。原有 docs/README 表格也未作整页格式化。

## PR #161 结论与剩余项

布局拒绝不是自动化误报：桌面空 History inspector 浪费视野，1024px overlay 遮挡画布，390px flyout 占满手机，Recipe/History 信息架构未重组。专用验收从空项目开始且漏测 768px/真实复杂工程。CI 另外实证 Main/3D ROI 垂直偏移 1.7857px，格式 job 五文件失败。参见 [完整复盘](PR161_POSTMORTEM.md)。

本轮没有独立复看 PR screenshot artifact，也没有 base/head 对照复现其 ROI 失败，因此不声称锁定该偏移的代码根因。视觉基线未执行/创建/更新；M1.5/M4 保留逐屏人工验收。后续 17–30 工作日的实现估算不包含用户审批/原型迭代等待。

本检查点的 commit 由 `git log -1 -- docs/ui-v2/M0_CHECKPOINT.md` 定位；产品审计基点始终是上方 main SHA。只新增审计脚本/文档并添加文档索引，`site/`、现有测试、依赖、workflow、只读核心与已批准基线的产品 diff 均为空。工作仅本地提交，未 push、创建 PR、触发手动 CI、部署或切换入口。

## 检查点决策

用户确认 M0 后才能开始 M1 的浅色 token 与 Gallery。默认按实际源码保留视图 sessionStorage 键和语义；[I01](ISSUES.md) 记录了计划中的 localStorage 用词差异。布局与 Recipe 位置保留到 M1.5 的比较原型逐屏审核，本轮不代选。
