# WaferCAD UI v2 重构计划 r2(agent 执行版)

> 相对 r1 的修订:增加 M1.5 UX 原型硬门槛;明确重写 Workstation 装配层;测试改为 legacy / v2 双通道;主题改为全局浅色;Recipe 的位置交给原型比较;M5 不搬迁旧入口;完成标准改为"功能 + 视觉 + 流程"三合一。

## 0. 目标、边界、规则

**目标**:交付一套统一、好用的 WaferCAD 界面(新设计系统 + 新工作区布局),功能与现有版本等价,通过验收后切换入口。**目标是好用的产品界面,不是更干净的 CSS。**

**必须遵守**(`AGENTS.md`):

- 几何以微米存储,显示缩放/ROI/形貌不得改动存储几何。
- 保持 project migration、worker 事务、History 恢复、浏览器恢复契约。
- 不为掩盖失败而替换视觉基线;**旧基线不动**,新基线只在人工检查并获批后建立。
- `npm ci`;汇报命令、结果、commit、环境。不 force push;不触发昂贵的手动 CI。

**禁止修改(只读依赖)**:`site/model*.js`、`process-*.js`、`project-*.js`、`workspace-snapshots.js`、`workspace-persistence*.js`、`three-view.js`、`plan-renderers.js`、`oasis.js`、`gds.js`、`*-worker.js`、`vendor/`。如需改动,先写入 `docs/ui-v2/ISSUES.md` 并向用户汇报。

**明确允许重写**:`site/workstation-ui.js` 的 UI 装配部分(`createRail / createTopbarControls / createViewbar / createViewStage / setupToolFlyout`)、`app.js` 中的 workstation 启动自检(约 1667 行附近)、`welcome.js` 的入口跳转(v2 通道内)、各控制器中的 DOM 绑定与类名。**必须保留**:single / overview / split 视图模式的行为契约及其 localStorage 键(`wafercad.workstation-view-mode.v1`、`wafercad.workstation-split-views.v1`)。

**策略**:新旧并行,双入口。旧 `app.html` 及其资源**保持原路径不动**(避免相对路径、Worker 路径、`welcome.js` 硬编码失效)。新入口为 `site/app-v2.html`,资源放 `site/ui-v2/`。

**完成标准(重要)**:以下都只是必要条件,**不是充分条件**:组件实现完成、id 覆盖率 100%、CSS 行数达标、CI 全绿。每个工作区必须同时满足 ① 功能正确 ② 视觉与已批准原型一致 ③ 操作流程合理(按 §4 的验收场景实测)。

## 1. 已知问题(要解决的)

- 两套 token(`--bg…` / `--wc-*`),483 个不同色值,圆角 3~7px 混用。
- 字号 7.5~12px 共 11+ 档,大量 <10px。
- 94 处 `!important`;z-index 20+ 个离散值。
- 按钮变体 8 种;4 个 view 的 `view-head` 为复制粘贴 HTML。
- `style.css` 5758 行 + `workstation.css` 2078 行,靠后置覆盖。
- 右侧 5 个 tab 内再嵌子 tab 与多种 popover。
- 前一次重构尝试(PR #161)失败:**M0 必须先查明原因**(见 M0)。

## 2. 阶段与检查点

**每个检查点结束必须停下汇报,得到用户明确确认后才能进入下一阶段。禁止连续执行多个阶段。**

### M0 基线、契约、隐式依赖(只做这一步,然后停)

1. `npm ci`;记录 `lint`、`npm test`、`test:ui:fast` 基线(浏览器不可用则注明)。
2. 查明 PR #161:读其描述、diff、评论、CI 结果,总结**失败的具体原因**(布局?装配层?测试?),写入 `docs/ui-v2/PR161_POSTMORTEM.md`。读不到则说明并请用户提供。
3. 脚本 `scripts/ui-contract-extract.mjs` → `docs/ui-v2/CONTRACT.md` + `contract.json`:
   - `app.html` 全部 id、`data-*`、`role`、`aria-controls` 目标;
   - 每个 id 的引用方(`site/**`、`scripts/**`);元素类型;
   - 动态生成标记:所有 `innerHTML`、`createElement`、`classList.add/toggle`、`dataset` 使用的类名与结构。
4. **隐式 DOM 依赖清单** `docs/ui-v2/IMPLICIT_DEPS.md`(本阶段最重要的产出):
   - `workstation-ui.js` 搬移/创建/重挂的 DOM;
   - `app.js` 启动自检与启动顺序(谁先创建、谁后绑定);
   - 依赖父子关系、兄弟顺序、`closest()`、事件委托/传播、可见性(`hidden`/`:visible`)、CSS 类即状态(如 `.active`、`aria-selected`、`workstation-ui-v2`、`workstation-boot`)的位置;
   - 测试对旧 DOM 的断言(例如 `.workstation-rail`)。
5. 风险清单 + 工作量估计(装配层需重写多少、控制器需改多少)。

**检查点 M0 汇报**:id 总数、动态类名数、隐式依赖条目数、PR #161 失败原因、风险与估算。

### M1 设计系统与组件 Gallery

`site/ui-v2/tokens.css`(唯一 token 源):

- 颜色 ≈20 个(surface / border / text / accent / success / warning / danger)。
- **全局浅色**;层级靠背景、边框、字重建立;不使用深色顶栏。科学画布可保持独立显示主题。预留 `[data-theme]` 钩子,本次只交付浅色。
- 字号:**正文/表单/操作 12–13px;辅助文字下限 11px**;标题 15 / 18。禁止 <11px。
- 4px 间距栅格;圆角 4 / 8;阴影 2 档;z-index 分层表(canvas 0 / toolbar 10 / panel 20 / popover 30 / dialog 40 / toast 50)。

`site/ui-v2/components.css`:每个组件只定义一次,**禁止 `!important`**:Button(primary/secondary/ghost/icon × sm/md)、Field(label+input+unit)、Select、Segmented、Tabs、Section(可折叠)、Popover、Dialog、Toast/Status、Tooltip、Badge、Tree item、Readout。

组件采用**原生模板函数 + 普通 DOM**(不用 Shadow DOM,不引入框架),并保证组件在控制器绑定事件**之前**创建完成。

交付 `site/ui-v2/gallery.html`(含 hover/active/disabled/focus/error 状态)。

**检查点 M1**:用户确认颜色、字体、控件状态。

### M1.5 完整工作区 UX 原型(硬门槛;不通过不得进入 M2)

用静态/半静态原型(可用假数据驱动,不接核心)呈现**真实工作区**,内容使用 **M3D 与 Photodetector 示例**的真实规模与复杂度(多层、长步骤列表、多 variants),不得用空白项目。

**布局方案比较(必做)**:至少提出 2~3 种工作区布局(例如:A 左图标栏 + 可停靠面板;B 顶部主导航 + 右侧上下文面板;C 左侧工作流导航 + 底部 History 抽屉),各附优缺点;**避开 PR #161 的失败结构**(依据 M0 的 postmortem)。同时在原型中比较 **Recipe 作为一级工作区 vs Process 内的模式** 两种放法。由用户选定,不由 agent 自行决定。

必须覆盖的屏幕/流程:

- Project:创建、加载、保存、Recovery。
- Mask:File/Draw、Cells/Layers、ROI、导出。
- Process:操作选择、参数、Apply、处理中、失败。
- Recipe:步骤列表、编辑、Run All、失败步骤定位、继续/重建。
- History:恢复、修改旧步骤、Variants 树。
- Main / Mask / 3D / Section:统一工具栏、Single / Overview / Split、Maximize、Section Z-break、Section ROI。

在 **1440 / 1024 / 768 / 390px** 四档宽度检查并附截图。

**检查点 M1.5**:用户逐屏审核。不合格则迭代,**不得进入 M2**。

### M2 新 Shell 与装配层(不接核心数据,先证明布局与交互成立)

- 新建 `site/app-v2.html` 与 `site/ui-v2/**`。
- 重写 Workstation 装配层(v2 版本,置于 `site/ui-v2/workstation-v2.js` 或等价位置),保留 single / overview / split 行为契约与存储键。**旧 `workstation-ui.js` 保持给 legacy 入口使用,不破坏旧版。**
- 一个共享的 view-panel 模板实例化 Main / Mask / 3D / Section;公共部分(标题、More、Export、Maximize、readout)只写一次,专属控件通过 slot 注入。
- 响应式:≤820px 单视图;phone/tablet/desktop 均可操作。
- 页面以 `<html data-ui="v2">` 标识,便于测试断言。

**检查点 M2**:用 mock 数据演示壳层,确认导航、视图模式切换、面板、响应式。

### M3 控制器迁移与真实接线(逐域,每域双验收)

顺序:view 工具栏 → Mask → Project/Export → Process → Recipe → History → Section → 3D → Welcome/状态栏。

每个域完成后立即做**功能验收 + 视觉验收**(对照 M1.5 原型),通过才进入下一个。

- 动态生成标记(最易漏):逐项处理 `CONTRACT.md` 中的 dynamic-classes。优先改生成函数使用新组件类名;不便改的放 `ui-v2/legacy-bridge.css`(带 TODO,最终清零)。重点:History/Variant 树、layer legend、Recipe 步骤列表、mask browser、welcome 卡片与缩略图、confirmation / process-task dialog。
- 统一 Popover / Dialog 实现(Esc、点击外部、焦点管理、`aria-expanded`)。
- v2 的 `welcome` 跳转指向 `app-v2.html`(通过 v2 专用入口或参数,不改动 legacy 行为)。

**检查点 M3(每域一次简短汇报,全部完成后一次总汇报)**:契约覆盖率、控制台错误数、该域验收场景结果。

### M4 真实工程与全面回归

**双通道测试**:

| 通道   | 内容                                                  | 要求                                                                                 |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Legacy | 现有全部脚本,指向 `app.html`,断言不改                 | 保持原结果,证明旧版未被破坏                                                          |
| UI v2  | 新增 `scripts/v2/*.mjs`(及 helper),指向 `app-v2.html` | 每个脚本开头断言 `html[data-ui="v2"]` 与 URL 为 `app-v2.html`,防止误跑旧页产生假绿灯 |

v2 通道必须覆盖:smoke、workstation(新导航/视图模式)、history、persistence/recovery、process geometry、project-io、array、examples、interaction、resilience。核心几何/History/存储相关断言从 legacy 复用,**只替换选择器与入口,不弱化断言**。

真实工程:M3D、Photodetector、一个大阵列示例,各自完整走一遍 §4 场景。

视觉:v2 建立**独立**基线目录(与旧基线隔离);**更新/创建基线前先向用户请示**。

**检查点 M4**:双通道矩阵、失败项分析、手工清单(`docs/ui-v2/MANUAL_CHECKLIST.md`)勾选结果、是否批准 v2 基线。

### M5 隔离部署、切换与清理

1. 独立 Preview 部署(不覆盖现有 Pages 入口),交用户评审。
2. 用户明确批准后,才切换默认入口(`index.html` / welcome 跳转)。**旧 `app.html` 与资源保持原路径**,仅标记为 legacy,保留一个版本周期以便回退。
3. 清理:删除 `legacy-bridge.css` 中无引用映射;v2 目标:新 CSS < 3000 行、`!important` ≤ 5、色值仅来自 token、字号 ≥ 11px。
4. 更新 `docs/ARCHITECTURE.md`(UI 层)、`docs/testing.md`、新增 `docs/ui-v2/README.md`(token 规范、组件用法、新增控件流程、双通道测试说明)与 handoff。

## 3. 总验收(Definition of Done)

- [ ] 每个工作区同时满足:功能正确 / 与原型一致 / 流程合理(§4)。
- [ ] 契约中的 id 在 v2 壳中全部存在且行为正确(必要条件)。
- [ ] Legacy 通道结果与基线一致;v2 通道全绿(视觉基线按 M4 规则单独处理)。
- [ ] 核心禁改文件 `git diff` 为空,或仅含用户批准的最小改动。
- [ ] 1440 / 1024 / 768 / 390px 均可完成全部 §4 场景。
- [ ] 旧入口可随时回退。

## 4. 工作区验收场景(必须实测)

- **Recipe**:载入既有 Recipe → 修改参数 → Run All → 定位失败步骤 → 修复后继续/重建 → 在 Main / 3D / Section 中核对结果。
- **Process**:选操作 → 填参数 → Apply → 处理中状态 → 失败回滚且模型不变 → 成功后三视图一致。
- **History**:回退到旧步骤 → 修改并创建 Variant → 切换 Variants → 恢复。
- **Mask**:导入 GDS/OASIS → 选 Cell/Layer → 画 Draw mask → 设 ROI → 导出 SVG/GDS/OASIS。
- **Project**:新建 → 保存/导出 → 导入 → 刷新后 Recovery → 打开示例。
- **Views**:Single / Overview / Split 切换并记忆;Maximize;Section Z-break 与 detail ROI;3D Fast/Quality、GLB/PNG 导出。

## 5. 汇报格式与 agent 行为约束

- 每次汇报:一句话状态 → 做了什么(文件清单)→ 命令与结果 → 未解决项 → 需要用户决策的问题。附分支名与 commit hash。
- 关键决策写入 `docs/ui-v2/`,不只留在对话里。
- **先做 M0 并停下**;不要提前写 CSS、不要提前建新侧边栏。
- 遇到契约外的耦合或需要改禁改文件:记录到 `ISSUES.md`,汇报后再动。
- 不为减少行数拆文件;不重命名核心模块导出。
- 不以"组件完成 / 覆盖率 / 行数 / CI 绿"宣告某工作区完成。
- 长任务(多步编码、大量文件生成)每个检查点先向用户确认再启动。
