# UI v2 隐式 DOM 依赖 — M0

审计基点：`fbbb2f9f3a585574e20ed706c34653164f13440c`，2026-10-09。以下 40 条来自源码和现有断言，描述 legacy 的真实契约；不是建议照搬旧布局。完整元素/生成表达式见 [CONTRACT](CONTRACT.md) 与 [机器清单](contract.json)。M2/M3 每域应将对应条目映射到 v2 实现和验收结果。

## 启动与装配顺序

`app.html` 内联启动器 → 等待 style/workstation 两份 CSS → 等待 polygon-clipping UMD → 加载 app.js 模块 → 创建核心状态及控制器 → Workstation 构造时立即 initialize → 创建 planRenderers → workspaceSession.start → bindUi（Workstation 先绑定）→ 初始 History/3D/Base/Process/视图同步 → 硬编码 shell 自检 → appReady=true、解除 workstation-boot → 异步恢复或处理 start 参数。

控制器构造先于 Workstation 装配，但大部分事件绑定在装配之后；不能把“创建所有组件在绑定前完成”误解为“所有控制器构造都不读取 DOM”。Recipe 的 initMarkup 又在自身 bind 内创建控件。新的 shell 必须在 app.js 首次读取 ID 前就绪，且动态域组件必须在其事件绑定前就绪。`appReady` 表示壳层启动完成，不能单独用来证明工程已经恢复或 3D 已绘制。

| 编号 | 源码定位（基点行号）                                         | 隐式约束与迁移影响                                                                                                                                                                                  |
| ---- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01  | `site/app.html:1583–1628` 内联启动器                         | CSS 与 vendor 加载是启动屏解除的前置条件；失败报告依赖 workstationBootScreen/Message 和 statusText。新入口应有自己的资源清单和失败诊断，保留相对 Worker 路径。                                      |
| D02  | `site/app.js:61–123`，各控制器构造                           | `$` 是全局 getElementById。科学 canvas/host、表单节点不能由晚到的异步组件补齐，也不能产生重复 ID。                                                                                                  |
| D03  | `site/app.js:1444`；`site/workstation-ui.js:598–636,779`     | createWorkstationUiController 构造末尾立即 initialize；它要求 app-shell/workspace 和四 panel/toolPanel 已存在。绑定时再 initialize 只是幂等兜底。                                                   |
| D04  | `site/workstation-ui.js:361–386`                             | createRail 把 nav prepend 到 app-shell；按钮 dataset.tool 与 WORKSTATION_TOOL_ORDER / TOOL_META 联动。Project/Base/Mask/Process/History 是旧导航，不代表 v2 已批准的信息架构。                      |
| D05  | `site/workstation-ui.js:388–445`                             | 顶栏先 append 项目名与 spacer，viewbar 再 insertBefore spacer。项目名依赖 projectNameInput 和 wafercad:project-name-sync 自定义事件。                                                               |
| D06  | `site/workstation-ui.js:447–464`                             | Main/Mask/3D 原 panel 被移到 stage，stage 插到 sectionPanel 前；Section 是独立下方 dock，不在 SINGLE_VIEW_MODES 内。直接父子关系是 CSS 布局条件。                                                   |
| D07  | `site/workstation-ui.js:466–512`                             | Split 标题查找 `.view-head > div:first-child` 和 `:scope > strong`，替换 strong 为 details。共享模板若调整标题结构，此功能会静默跳过。                                                              |
| D08  | `site/workstation-ui.js:515–575`                             | toolPanel 重挂 app-shell；查询 `.tool-tab-content`；五域面板按固定顺序 append，移除 role/aria-labelledby 并强制 hidden=false。旧静态 tab 语义与运行时结构不同。                                     |
| D09  | `site/workstation-ui.js:236–282,693–726`                     | rail 导航是滚动到连续面板，不是独占 tab；补空白 scrollTail 令末尾 History 可对齐，滚动监听反推 activeTool。v2 装配应替换整套滚动导航状态所有权。                                                    |
| D10  | `site/app.js:1573–1599`                                      | bindUi 首先 workstation.bind，随后 popover、toolbar、maximize、ROI、task、Recipe、Section、Base、Mask、workspace、History。提前绑定会漏掉动态按钮；重绑会重复动作。                                 |
| D11  | `site/controllers/process-recipe-controller.js:334–418,1500` | initMarkup 依赖 recipeProcessPane 和 dataset.ready，注入几十个控件再绑定。预建模板若没有接管 ready 标志，会被 innerHTML 覆盖；错误预置 ready 又会留下缺失节点。                                     |
| D12  | `site/app.js:1630–1698`                                      | renderSnapshots/initThree/syncBaseControls/updateOperationUI/renderAll 后才自检；自检硬要求 workstation-ui-v2、workstation-rail、workstation-view-stage。此旧类名不等于新 `html[data-ui=v2]` 通道。 |

## 视图、父子关系与可见性

| 编号 | 源码定位                                                                      | 隐式约束与迁移影响                                                                                                                                                                                             |
| ---- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D13  | `site/workstation-ui.js:16–99,297–347`                                        | 两个 `wafercad.workstation-*.v1` 键实际读写 sessionStorage。≤820px 单视图，≥1121px 未记忆时 Overview，821–1120px 默认 Main；粗指针还考虑 screen.width。见 [ISSUES](ISSUES.md) I01。                            |
| D14  | `site/workstation-ui.js:50–91,302–331`                                        | Split 左右必须不同；选中另一侧当前视图时交换。data-view-mode/split-left/split-right、panel.hidden、dataset.splitSlot、gridColumn 共同决定顺序与可见性。不能克隆 canvas 实现双窗。                              |
| D15  | `site/workstation-ui.js:352–359,577–596`                                      | Section 收起同时写 workspace.section-dock-collapsed、panel.workstation-section-collapsed、按钮文本/aria-expanded；Layers 另用 workstation-legend-open。新布局需明确仍可从收起状态打开 Z Break。                |
| D16  | `site/controllers/view-toolbar-controller.js:3–78`                            | 按 panel 实际宽度，将原节点移动到 More 内 `.view-overflow-secondary`；placeholder 记原位置。关闭移动中的 details，ResizeObserver 忽略 width<1。新模板不能通过克隆生成第二套控件。                              |
| D17  | `site/controllers/view-popover-controller.js:1–88`                            | owningView 用 closest(view-panel)；“同视图互斥”按其后代 details 和 data-view-popover-panel 计算。移动到全局 portal 后会失去 owner，需显式注入视图所有权。                                                      |
| D18  | 同上；`site/controllers/workspace-actions-controller.js:220–241`              | Export 查找最近 details 与 view-head；More 内编辑器关闭时向上寻找 overflow-secondary/more-control 并关闭父菜单。改变祖先会改变菜单开关与导出行为。                                                             |
| D19  | `site/controllers/view-maximize-controller.js:14–62`                          | Max 用 dataset.viewPanel 指向 panel ID，切 body.view-maximized 和 is-maximized；标题仍查 strong。绑定用 onclick，Workstation 对同一按钮另加 click 关闭工具。还原触发四 renderer 和 Section editor，3D 另 fit。 |
| D20  | `site/app.js:1458–1497,1531–1570`                                             | Welcome preview 单独控制四 panel.hidden、重置 Main/Mask framing、监听父窗口消息和 ResizeObserver；它绕过普通 workstation 视图状态。不能让 v2 导航影响 legacy preview。                                         |
| D21  | `site/controllers/section-collapse-controller.js:177–222,315–339`             | Z Break 是原生 dialog，面积不足时移到 body 并 showModal，关闭再挂回 sectionCollapseOverlay。hidden/open/:modal 和 editorOpen 必须同步；不能当普通 CSS popover替换。                                            |
| D22  | `site/controllers/section-detail-roi-controller.js`；`site/section-editor.js` | Detail overlay/inset 和 A–B editor 以各自 canvas/body 的 DOMRect 定位、捕获指针。改变滚动层/祖先 transform/尺寸应测拖动坐标、ROI、Z Break，不改存储几何。                                                      |

## 事件、动态树与状态语义

| 编号 | 源码定位                                                                             | 隐式约束与迁移影响                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D23  | `site/controllers/roi-controller.js:149–195,231–388`；`main-canvas-controller.js`    | Main canvas 同时绑定 ROI、Slice、pan 等处理器，依赖当前工具、event.defaultPrevented 和指针捕获协调；菜单 document.pointerdown 的传播不能抢掉绘制。                                         |
| D24  | `site/controllers/draw-mask-controller.js:66–146,318–350,555–850`                    | shape editor 按形状替换子节点，fieldRow 创建 input.id（参数），polygonRow 创建 drawShapePoints；drawTool/drawSource 与 active/hidden 决定 File/Draw 模式。这是静态 ID 数量之外的条件控件。 |
| D25  | `site/controllers/mask-browser-controller.js:145–200` 及后续 layer 列表              | Cells 递归树由 depth CSS 变量、active/root class 和 caret 建立；caret stopPropagation，行点击选 Cell。重建时会清空 host；稳定 Cell/Layer 值不能替换成 UI 行序号。                          |
| D26  | `site/controllers/process-panel-controller.js:165–210,307–327`                       | operationTools.dataset.operationMode、行 class.hidden 与控件 disabled 共同控制参数；hidden 属性不替代 class.hidden。选择操作与 Apply 是不同事件；UI 不得自动提交。                         |
| D27  | `site/controllers/process-recipe-controller.js:943–982,1070–1088`                    | Recipe 步骤使用稳定 Step ID；行 active/complete/failed，Steps/Code 和 manual/recipe 各有 hidden 与按钮状态。重渲染、无效草稿、Undo/Redo、Run to Step 的时序需保留。                        |
| D28  | 同上 `1230–1251,1319–1341`                                                           | 运行期间按 DOM `.recipe-step-row` 的顺序定位步骤和状态徽标，参数锁定/Stop/Progress 联动。虚拟滚动或把步骤列表分组会使运行索引失配；必须显式按 Step ID 映射。                               |
| D29  | `site/app.js:958–994`；`history-mutation-controller.js`                              | Edit Step 通过 `.workstation-rail-button[data-tool=process]` 的真实 click 导航，再写 Process 参数。只复制 ID 覆盖率并不能保留此跨域路线；需窄导航回调。                                    |
| D30  | `site/controllers/project-controller.js:62–212,506–690,824–929`                      | History 每次清空 snapshotsList；Variant→origin Step→child Variant 是真实嵌套树。dataset.stepId/variantId/head/cursor/activePath、is-restorable/is-unavailable 控制交互和样式，不能扁平化。 |
| D31  | 同上 `224–275,699–821`                                                               | bookmark/Variant rename 和 More 菜单停止传播，避免父行 restore；菜单互斥、details.open、编辑框 hidden 与焦点配合。新事件委托不能把菜单动作变为恢复 Step。                                  |
| D32  | `site/controllers/layer-legend-controller.js:223–598`                                | layer legend 每次重建；稳定 layer/annotation ID 用于颜色、重命名、可见性和 profile 编辑。颜色是材料信息而非 UI 语义 token，替换通用 badge 不得篡改颜色或层所有权。                         |
| D33  | `site/controllers/confirmation-dialog-controller.js:10–105`                          | 确认弹窗懒创建，保存/归还焦点；Esc 取消，以 Promise 返回 choice；替换活动请求先取消前一个。当前只有 Esc 和初始焦点，没有完整 Tab trap，后续统一组件需要补足。                              |
| D34  | `site/controllers/process-task-controller.js`；`workspace-persistence-controller.js` | worker/task 与持久化用 disabled/hidden/aria-live/status 的真实绑定；Abort/错误不提交模型，Recovery/Take over 不是纯 UI 提示。后者属于本计划只读域，先用公开回调而不改事务。                |
| D35  | `site/controllers/tool-tabs-controller.js:1–43`；`app.html` tool-tab                 | 旧 data-tool-tab/data-tab-panel、role=tab、aria-selected、tabIndex 与隐藏语义仍被 legacy 测试读取；Workstation 初始化会重挂面板。v2 用新导航，legacy 断言保持独立。                        |
| D36  | `site/welcome.js:83–90,218–220,309–323`；`startup-controller.js:16`                  | 欢迎预览、示例、staged 文件和 start 清理都硬编码 app.html；仅改 welcome 链接会被 startup.replaceState 拉回旧 URL。v2 专用入口需保留路由参数/文件交接。                                     |

## 测试与 CSS 所有权

| 编号 | 证据                                                                                                      | 隐式约束与迁移影响                                                                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D37  | `scripts/workstation-regression.mjs:54–70,289,375`；`scripts/test-helpers/ui.mjs:88–139`                  | legacy 检查 rail 启动前不存在/之后可见、stage.data-view-mode、settingsTab.aria-selected；helper 要 flyout.open、rail.active 与 panel rect.left≥40。不能复用这些选择器假定 v2 布局。          |
| D38  | `scripts/view-ux-v3-regression.mjs:55,129–132`；History/interaction/persistence suites                    | view-tabs 直接子按钮、overflow 祖先、Recipe/History class 和可见性断言嵌在行为场景中。v2 应只适配入口与选择器，保留几何、恢复、持久化、回滚断言。                                            |
| D39  | `site/tests/workstation-ui.test.mjs`；`function-panel-feedback.test.mjs`；`issue-13-settings-ui.test.mjs` | Node 测试也读取旧 HTML/CSS/源码文本或导入 Workstation 函数。不能只运行浏览器测试，也不能为 v2 删除 legacy 文本断言；新装配另建 owner。                                                       |
| D40  | `site/workstation.css:302–419`；`site/style.css`；`app.html` boot style                                   | direct-child、[hidden]、details[open]、:has(input:checked)、aria-pressed 等就是 CSS 状态机器。旧 workstation-ui-v2 是 legacy CSS guard；新 data-ui=v2 应使用独立资源，避免两套装配同时运行。 |

## 对下一阶段的约束

M1 仅组件 Gallery；M1.5 用真实 M3D/Photodetector 的层、Step 和 Variant 规模比较布局及 Recipe 位置。M2 新装配要建立显式 navigation/view state，避免滚动位置充当导航、祖先选择器充当域 API。M3 每域需要记录“静态控件 + 动态生成 + 状态 + 事件 + 导航 + 事务回调”的映射。以上库存不是可以省略功能/视觉/流程实测的证明。
