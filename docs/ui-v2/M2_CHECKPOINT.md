# M2：独立 mock 壳层与实时预览

日期：2026-10-09。分支 `refactor/ui-v2-m0`，HEAD `c7856da2b81aaea4c088d0d5f7cd4489e8e4d1e2`。
用户批准进入 M2；快速迭代阶段暂不 commit，之后已明确允许本地提交检查点。不进入 M3，不接科学核心，不 push。

## 已批准的 UI 决策

- A 布局：导航横排在左功能面板上方，与右侧视图区左右并列。
- 主导航 Project / Mask / Process / History / Hide；Process 内 Manual / Recipe / Code。
- 字体 B：本地 Inter Variable WOFF2 / system fallback，中文使用系统回退。
- Hide 一起收起导航和面板；Restore panel 位于 Single 左边，不占独立行。
- 所有视图工具位于标题后的同一栏：Fit / Pan / Zoom → 专属控件 → More → Max / Restore；Export 只在 More 中。
- More 是按钮锚定的浮层菜单，支持外部点击、Esc、焦点归还与方向键。
- Mask 显示 Cells / Layers；点击 Mask 默认最大化该视图。
- History 选择保留列表、面板与页面滚动位置。
- 全局浅色，正文/操作 12–13px，辅助文字至少 11px，无 `!important`、Shadow DOM 或新增运行时依赖。

## 入口和预览

- 静态入口：`site/app-v2.html`。双击可用，普通经典脚本，不需要模块 fetch 或构建。
- 实时预览：仓库根执行 `node scripts/v2/serve-v2.mjs`，打开 `http://127.0.0.1:4182/app-v2.html?live`。
- 只监听 localhost；响应禁止缓存；保存 `app-v2.html` / `ui-v2/**` 后通过 SSE 自动刷新。
- 本轮先前沙盒中的服务虽然监听但本机访问超时；已只重启核实属于本任务的服务到本机环境，实际请求返回 HTTP 200。保存文件发出 live reload event 已实测。
- 页面同时显示 mock 标识与实时连接状态。实时刷新会重置 mock 草稿，视图模式仍按 sessionStorage 契约保留；没有工程数据写入。

## 分层与启动顺序

1. `view-state.js`：与 legacy 一致的 mode / split 默认值、去重、交换与 sessionStorage 键。
2. `view-icons.js` / `native-components.js`：普通 DOM 模板和内联 SVG；More 管理自己的锚定与焦点。
3. `view-panel.js`：共享 Main / Mask / 3D / Section 模板注册表；panel / content host 身份稳定，不克隆 canvas。`section-legend.js` 提供只读层/注释模板，不拥有模型状态。
4. `workstation-v2.js`：只装配导航、面板槽、视图、顶栏、分隔条和状态栏；通过显式回调获取领域 UI / 视图内容，不读 Recipe、History、fixtures 或核心。
5. `mock-data.js`：离线从原示例派生的只读展示数据。
6. `mock-domain-panels.js` / `mock-views.js`：mock 领域面板与源数据插图，不包含科学执行或真实渲染器。
7. `mock-workspace.js`：M2 的 mock 状态、模拟行为和事件绑定；M3 逐域用真实适配器替换，不能当成第二套科学核心。
8. `shell-preview.js` / `live-preview.js`：独立审阅控件与可选开发预览。

所有文件通过有序 `defer` 加载。首次装配完成后才绑定交互。外层 workstation 和视图 content host 在切换/隐藏/History 更新时保持同一对象。
壳层通过 `getProjectName` / `renderEditor` / `renderView` 接受 slots；M3 的 renderer / transaction 所有权仍由既有服务持有。
旧 `app.html`、`app.js`、`workstation-ui.js`、controllers、科学核心、workers 与持久化未修改、未导入。
当前提供的是 mock 视图容器，不声称契约中全部真实控件 ID 已覆盖；控制器接线和动态控件映射属于 M3。
完整自查见 [剩余界面缺口](M2_GAP_AUDIT.md)：History 树、Manual 参数、Recipe 构建流程等仍有原型欠账，不将其伪装成已完整覆盖。

## Section Legend 补齐

宽屏 180px 侧排，768/390px 放在 Section 画布下方，不覆盖画布；Legend 按钮收起/恢复。
使用真实层名、原颜色、稳定 ID 与历史游标模型；Photodetector 当前两个 Implant 注释另列，profile/visibility 只读显示。
Legend 与 Section plot host 保持身份，列表可滚动；模型源被冻结，颜色不是 UI token，不修改材料信息。
真实重命名/显隐/调色/profile 编辑属于 M3；本次没有调用或复制科学 mutation。

## 模式和运行反馈

保留 `wafercad.workstation-view-mode.v1` / `wafercad.workstation-split-views.v1` 的 sessionStorage 语义。
≤820px Single；未记忆时 821–1120px Main、≥1121px Overview；Split 两侧不同，选到另一侧时交换；Section 为独立 dock，窄屏访问不新增存储模式值。
Manual 演示一项操作；Recipe 演示顺序、多步进度与失败 Step 定位；busy 锁定参数。
Code 的 Apply / Format 只是明示的 UI 演示，未接 parser，也不假装改变有效 Recipe。
所有模拟成功/失败/取消均不修改源模型与真实 History、Recovery 或项目存储。

## 提前执行的 ROI 专项检查

在尚未连接核心的壳层中，以相同物理 µm viewBox 的 mock ROI 平面比较 Main / 3D DOMRect 上下边界。
1440px / 1024px 的 top / bottom delta 均为 **0px**，严格阈值 0.25px，未放宽至容忍 PR #161 的 1.7857px 偏移。
Main 使用实际源多边形；3D 是既有最终快照 + 明示的 mock 正交 ROI 覆盖层，**不是实际 3D 投影对齐验收**。
M3 接真实 renderer 后必须再次执行指针路径与物理 ROI 对齐检查，不能把本结果当成 #161 真实渲染根因已经修复。

## 验证与环境

Windows，Node `v26.7.0`，原生 Chrome `155.0.8059.40`；此次不是 M4 视觉基线浏览器选择。

- `npm ci`：本机权限模式通过，81 packages，0 vulnerabilities；最初沙盒 EPERM 已记录并重试。
- `node --test scripts/v2/view-state.test.mjs`：5/5，通过与 legacy 模式函数逐值对照、Split、sessionStorage、拒绝存储与 coarse 窄屏契约。
- `node scripts/v2/check-m2-shell.mjs`：19 项通过；独立 v2 URL / `html[data-ui=v2]` guard；导航、稳定 slots、Hide、模式记忆、Split 交换、Manual/Recipe、Code、History 滚动、菜单、四档响应式、空 History、源 Variants 数量、font、file:// 启动及 Legend。Variants 的树关系尚未通过，见自查。
- 原生 Chrome 无页面/控制台错误；不使用 Playwright，不截图，不创建/替换基线。
- ESLint / Prettier 仅检查此次新增 M2 文件；不顺手修复 main 的 18 个既有格式失败。
- `node scripts/v2/build-m2-mock-data.mjs` 校验 mock 数据生成确定性；不执行科学模型计算。

## 尚待确认 / 后续

- M2 检查点停下，等用户审核；细节可继续在同一入口迭代。用户已允许本地 commit；不 push / 触发 CI / 切换默认入口。
- `origin/main` 已更新至 `b81598b7d8f4c5e7d246df250c82b9de4c2d4178`；Workstation 模式源码相对当前基点未变。此前不 commit 的迭代期没有创建 merge commit 或留下 merge 状态；真实接线前仍需同步上游。
- 5 个静态未解析动态表达式仍留 M3 逐项追踪，不算完成覆盖。
- M4 创建视觉基线前，仍须询问用户浏览器和基线批准。
