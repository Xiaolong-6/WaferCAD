# UI v2 全量功能比较审计 — 2026-10-09

> 最新实际 UI 结论请看 [2026-10-10 UI 验收与修复](UI_ACCEPTANCE_2026-10-10.md)：`2ae4ca3` 已修复并视觉复验八项报告问题，49 项正式壳层检查通过。下表保留完整对照审计基线；本轮定向 UI 验收不代表 258 项功能全部完成或 M4 获批。

> 后续 [旧版实际浏览器对照](LEGACY_BROWSER_COMPARISON_2026-10-10.md) 记录 `e1ad828` 的 Manual 示意图、窄屏图高/History 修复和 59 项壳层检查，以及仍未完成的表单、ROI、Legend 等缺口。不能以这些修复宣称整体 UI 验收通过。

审计基线：分支 `codex/ui-v2-m2-handoff-2026-10-09`，HEAD `feab69b` 加本轮尚未提交的滚动/Base/Recipe布局/色块修复。逐项修复开始前冻结本表。用户要求：先全面审计，再逐项修复；History 顶部 Restore/Edit/Create Variant 重复按钮移除，统一行内 ⋯。

## 结论与验收边界

当前 `site/app-v2.html` 是 mock 演示入口，`site/ui-v2/app.html` 是未连线的生产壳。后者所有 domain adapter 明确写着 `unconnected`。**没有一个生产业务域可以据 M2.5 通过判为迁移完成。** Legacy 仍是完整产品实现。38 个命名检查是壳层/草稿场景，既不是 258 功能覆盖率，也不是视觉基线通过。

覆盖范围：FEATURE_INVENTORY / PLACEMENT_MAP 的全部 258 个 ID；按域对照 legacy controller、当前 DOM 模板、click/change handler、状态和持久化边界。下表是**源码比较审计**，运行时证据只覆盖正式脚本已执行的场景及实际浏览器观察；没有声称逐一执行 258 功能。复合功能只要其中一部分缺失即记“部分/占位”，不把一个能点的按钮算整个合同通过。统计：{"缺失":68,"mock 草稿":69,"壳层":38,"部分/占位":83}。这些类别不能相加成为生产功能通过率。

## 最先修复的缺口

| 顺序 | 范围             | 缺口与验收                                                                                                                                                             |
| ---- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 滚动/操作入口    | Manual/Recipe/History 真滚轮到末项；切换保留滚动；移除 History 顶部三个重复按钮，Step/Variant 的 ⋯ 为唯一业务操作入口                                                  |
| 2    | History          | 分支改名（按钮/双击、Enter、Esc、空值）、展开/折叠、step count、删除保护与确认、书签增删改与按 Step 嵌套、Return HEAD/Cancel；稳定 ID，source fixture 不变             |
| 3    | Base/Recipe      | Rectangle/Circle、Revert；Recipe command change、Copy、Mask capture/summary、对象参数完整编辑；Undo/Redo，不丢 ID/µm 值                                                |
| 4    | Process          | front/back、mask/invert/full、Deposit name、Transfer/Placement、CMP/Undercut、Rough fields、Record kind/note、Add to Recipe；按 operation 显示合法字段                 |
| 5    | Legend/Mask/视图 | 直接色块改色；名称/显隐/profile；Cells collapse/instance count、shape editor、export 多选；ROI 独立语义、角度、Z-break snap/equal scale；所有菜单 Escape/外点/焦点返回 |
| 6    | 生产接线 (M3)    | Process worker、History restore/replay/rollback、project IO/recovery/lease、真实 renderer/export、Diagnostics、Welcome；分别归 owning suite，不得用 mock 替代          |

本轮已授权范围仍以 UI 壳和 mock 草稿为基础；Base 明确选择 mock，不擅自将 UI 修复变成 Base 科学模型事务。生产接线缺口必须保留为 M3 待办，不能为了把清单涂绿制作假的模型/持久化结果。

## Legacy 与 v2 证据

- History：`site/controllers/project-controller.js` 的 createVariantHeader 有 toggle、rename inline editor、Enter/Escape、Delete confirmation/child protection/recovery；Step 菜单包含继续、编辑、插入、删除、书签。`history-mutation-controller.js` 拥有历史事务。v2 historyPanel 只有 branch 选择 + 四个 Step menu items，无 branch rename/delete/collapse。旧表 F192/F195/F196 标注不准确，必须纠正。
- Recipe/Process：`process-recipe-controller.js`、`process-panel-controller.js` 是产品行为；v2 primitive params 自动遍历跳过对象，command/copy/captured mask 缺失；code-apply/code-format 只改 message。Process area 的 ROI 与 legacy invert 不等价；Transfer placement 错挂 Extend。
- Base：`base-controls-controller.js` 与真实 build 合同仍未连线；本轮 W/H/Z 是 µm 内存 draft，单位转换和正数校验，Keep/Clear 只是展示确认。
- Legend：`layer-legend-controller.js` 拥有名称、显隐与 depth profile；v2 只有颜色修改/只读信息。Balanced/Airy/Warm/Cool/全局 Random 已存在，旧表 F216/F217 过时。
- Mask/ROI/Section/Export：分别对照 mask-browser/import、draw-mask、roi、mask-roi、section-controls/detail-roi、export controllers；预设 shape、固定 GDS metadata、最终 3D thumbnail、equal-band Section 不是实时生产能力。
- Project/Recovery/Welcome：project-state、workspace-persistence/session/startup controllers 有迁移、autosave、恢复点和 writer lease；v2 下载 UI-DRAFT-NOT-WAFERCAD，Load 仅换 fixture；不能声称 Open/Save/Export/Recovery 已接通。
- 通用壳：shell-registry、domain-adapters、workstation-v2、view-panel、overlay-manager 已有稳定 slot/生命周期/公共浮层；不能继续沿用旧表“无插槽/每次拆 canvas”的历史结论。
- 菜单新问题：History inline menu 与 Legend palette 不通过 overlay manager，尚未统一 Escape、outside click 和 keyboard menu traversal。3D borders click 只发 message，没有 toggle。动态 mock dependency load 在 try/catch 外，启动失败兜底不完整。

## 实际验证与环境

Windows NT 10.0.26300.0；Node v24.16.0；Chrome 155.0.8059.40；npm ci 锁定 Playwright 1.55.1 / Three 0.179.1（本次 native CDP mock gate 不用 WebGL）。正式命令：

`$env:WAFERCAD_REVIEW_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe'; node scripts/v2/check-m2-shell.mjs`

本轮审计前 38 个检查通过，errors=[]；新增 1440×650 Manual/Recipe/History **Input.dispatchMouseEvent mouseWheel** 实测到底，避免 scrollTop=0 保存测试虚假通过。忽略目录日志 `test-results/ui-v2-acceptance/scroll-base-official.txt`。Base draft 校验/单位切换、稳定 Host identity、Recipe toolbar alignment 均在脚本中。未更新任何批准视觉基线；没有真实科学操作或 .wafercad IO 测试。

修复提交、各条回归和剩余项记录在本文件后的修复账本；本表保持审计前状态，不能用完成后的结果覆盖诊断证据。

## 修复账本与最新范围

- 审计先独立提交为 `0982433`；随后产品修复提交 `af64d67`。下面 258 行保留修复前状态，不能作为修复后的计数。
- 第一批已补 UI draft：F190 滚动约束，F192/F193/F195/F196 分支折叠/数量/改名/删除保护，F203/F204 历史编辑入口 draft，F207/F208/F209 书签增删改与 Step 子组，F211/F212 返回 HEAD/取消；History 顶部重复操作按钮删除。真实 History 事务仍未接通。
- 同批补齐 Base Rectangle/Circle/W/H/Z/Revert 与确认；Recipe operation change/Copy/captured Mask/Surface draft；Process front/back、mask/invert/full、Transfer placement、CMP/Undercut、Rough 参数、Record kind/note、Add-to-Recipe draft；直接 Legend 色块，3D Border draft toggle。所有 source fixture 保持 frozen。
- 正式 Chrome 43 个命名检查、8 个契约、ESLint、变更文件 Prettier 全通过。详见 [当前 M2.5 审计](BROWSER_ACCEPTANCE_2026-10-09.md)。这些不是生产 parity 通过。
- 当时用户范围为“只审计 M2.5 过了没有”，因此停止扩展功能。后续用户要求实际 UI 验收，并指定 Fit/Pan/Zoom 只留图标、其他工具不变。本轮 `5ec5082` 完成该修改和 Legend 开发文案移除；44 个正式检查通过，**实际 UI 验收 FAIL / 待修复**。未进入 M3。

## 全部 258 项

“壳层”仅布局/生命周期；“mock 草稿”有演示事件；“部分/占位”入口与行为不完整；“缺失”无对应完整功能。证据文件均在 `site/ui-v2/` 下。科学/存储类全部未生产接线。

| ID   | Legacy 功能                                 | 当前状态  | 具体证据/差异                                                                    | v2 owner                                               |
| ---- | ------------------------------------------- | --------- | -------------------------------------------------------------------------------- | ------------------------------------------------------ |
| F001 | WaferCAD 品牌 / 返回首页                    | 缺失      | 品牌纯文本，无返回首页链接                                                       | workstation-v2.js / view-panel.js / overlay-manager.js |
| F002 | 项目名称                                    | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | workstation-v2.js / view-panel.js / overlay-manager.js |
| F003 | Overview 模式                               | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F004 | Main 单视图                                 | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F005 | Mask 单视图                                 | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F006 | 3D 单视图                                   | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F007 | Split 模式                                  | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F008 | Split 左侧视图选择                          | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F009 | Split 右侧视图选择                          | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F010 | 视图模式 sessionStorage 记忆                | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F011 | 导航 Project                                | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F012 | 导航 Mask                                   | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F013 | 导航 Process                                | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F014 | 导航 History                                | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F015 | Base 域具名子容器                           | 壳层      | 稳定 panel.base 已存在；本轮补齐独立 adapter 生命周期                            | workstation-v2.js / view-panel.js / overlay-manager.js |
| F016 | 面板 Hide / Restore                         | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F017 | 面板拖动调整宽高                            | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F018 | 移动端 Edit/Results 切换                    | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F019 | Section Hide / Show                         | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F020 | Section 紧凑屏 Layers                       | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | workstation-v2.js / view-panel.js / overlay-manager.js |
| F021 | 视图舞台区域                                | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F022 | 四窗 Max/Restore                            | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F023 | 顶部导航一致性                              | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F024 | 视图标题                                    | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F025 | 通用 Fit                                    | 部分/占位 | Fit 仅发提示，未变更相机/视域                                                    | workstation-v2.js / view-panel.js / overlay-manager.js |
| F026 | 通用 More                                   | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F027 | 通用 Max                                    | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F028 | 通用 Readout                                | 部分/占位 | readout 来源为 fixture，非 renderer                                              | workstation-v2.js / view-panel.js / overlay-manager.js |
| F029 | 专属具名工具栏插槽                          | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F030 | 科学画布稳定挂载点                          | 壳层      | 稳定宿主 identity 已有 CDP 验证；不代表 renderer 已接线                          | workstation-v2.js / view-panel.js / overlay-manager.js |
| F031 | 全局 Popover 宿主                           | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F032 | 全局 Dialog 宿主                            | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | workstation-v2.js / view-panel.js / overlay-manager.js |
| F033 | 全局 Toast 宿主                             | 壳层      | Toast portal/API 已存在；未证明所有业务事件会调用                                | workstation-v2.js / view-panel.js / overlay-manager.js |
| F034 | Main face 标签                              | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-views.js / mock-workspace.js                      |
| F035 | Slice 入口                                  | 部分/占位 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F036 | A/B 坐标 X/Y                                | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F037 | A/B 端点拖动                                | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-views.js / mock-workspace.js                      |
| F038 | 3D ROI 入口                                 | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F039 | ROI Rect/Circle/Sector                      | 部分/占位 | 含 Rectangle/Circle/Ring/Ring sector 选项，缺 Sector 独立参数                    | mock-views.js / mock-workspace.js                      |
| F040 | ROI 宽高/半径                               | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F041 | ROI Start/End angle                         | 缺失      | 缺起止角字段                                                                     | mock-views.js / mock-workspace.js                      |
| F042 | ROI reference/position                      | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F043 | ROI Clear                                   | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F044 | Pan                                         | 部分/占位 | 工具选中态；无真实画布拖动                                                       | mock-views.js / mock-workspace.js                      |
| F045 | Fit                                         | 部分/占位 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F046 | Zoom + / -                                  | 部分/占位 | Zoom 选中态；无独立 + / - 或真实缩放                                             | mock-views.js / mock-workspace.js                      |
| F047 | Main SVG Export                             | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F048 | Main canvas / readout                       | 部分/占位 | fixture 多边形 SVG，非生产 Main renderer                                         | mock-views.js / mock-workspace.js                      |
| F049 | Mask 当前 Cell 标签                         | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-views.js / mock-workspace.js                      |
| F050 | File / Draw source                          | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F051 | Mask ROI Square/Circle/Clear                | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F052 | Mask ROI Size/Radius/Rotation               | 部分/占位 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F053 | Mask ROI reference/X/Y                      | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F054 | Mask opacity                                | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F055 | Mask Fit / Zoom                             | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F056 | Mask canvas/readout                         | 部分/占位 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F057 | Draw Select                                 | 部分/占位 | 选工具可用，未接真实 pointer selection                                           | mock-views.js / mock-workspace.js                      |
| F058 | Draw Rect                                   | 部分/占位 | 选择+Add 生成预设 rect，非拖拽绘制                                               | mock-views.js / mock-workspace.js                      |
| F059 | Draw Circle                                 | 部分/占位 | 选择+Add 生成预设 circle，非指针绘制                                             | mock-views.js / mock-workspace.js                      |
| F060 | Draw Polygon                                | 部分/占位 | 生成预设三角形，非点击闭合 Polygon                                               | mock-views.js / mock-workspace.js                      |
| F061 | Draw Ring                                   | 部分/占位 | 生成预设 Ring，缺参数编辑                                                        | mock-views.js / mock-workspace.js                      |
| F062 | Draw Ring Sector                            | 部分/占位 | 生成预设 Ring sector，缺参数编辑                                                 | mock-views.js / mock-workspace.js                      |
| F063 | Draw Delete/Clear                           | 部分/占位 | 删除末项/清空草稿，无选中 shape 删除                                             | mock-views.js / mock-workspace.js                      |
| F064 | Draw Shape Editor 各类型参数                | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-views.js / mock-workspace.js                      |
| F065 | Draw shape 数量提示                         | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F066 | Mask export Cells 多选                      | 部分/占位 | scope 下拉，非 Cells 多选                                                        | mock-views.js / mock-workspace.js                      |
| F067 | Mask export Layers 多选                     | 部分/占位 | scope 下拉，非 Layers 多选                                                       | mock-views.js / mock-workspace.js                      |
| F068 | Mask Export SVG                             | 部分/占位 | 打开设置，无物理导出                                                             | mock-views.js / mock-workspace.js                      |
| F069 | Mask Export GDS                             | 部分/占位 | 打开设置，无 GDS 文件                                                            | mock-views.js / mock-workspace.js                      |
| F070 | Mask Export OAS                             | 部分/占位 | 打开设置，无 OAS 文件                                                            | mock-views.js / mock-workspace.js                      |
| F071 | Fast / Quality                              | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F072 | 3D Border                                   | 部分/占位 | Border 按钮仅消息，未切换 state.borders                                          | mock-views.js / mock-workspace.js                      |
| F073 | 3D Opacity                                  | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F074 | 3D Fit                                      | 部分/占位 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F075 | 3D Max                                      | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F076 | 3D Export GLB                               | 部分/占位 | 仅 exportTask 状态，无 GLB                                                       | mock-views.js / mock-workspace.js                      |
| F077 | 3D Export PNG 3×                            | 部分/占位 | 仅 exportTask 状态，无 PNG 3×                                                    | mock-views.js / mock-workspace.js                      |
| F078 | Cancel GLB                                  | 部分/占位 | 取消草稿状态可用，无真实导出任务                                                 | mock-views.js / mock-workspace.js                      |
| F079 | 3D stats / readout                          | 部分/占位 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F080 | 3D canvas                                   | 部分/占位 | 最终录制缩略图，非实时 WebGL                                                     | mock-views.js / mock-workspace.js                      |
| F081 | 3D Loading / Unavailable                    | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-views.js / mock-workspace.js                      |
| F082 | Section A–B 标题/元数据                     | 部分/占位 | 通用 Section 标题，A–B 元数据仅 draft/readout                                    | mock-views.js / mock-workspace.js                      |
| F083 | Scale Auto / 1:1                            | 部分/占位 | 下拉写草稿，等高带示意不按 1:1 重算                                              | mock-views.js / mock-workspace.js                      |
| F084 | Z Break 入口                                | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F085 | Z Break Enable                              | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F086 | Z Break 上下界数字输入                      | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F087 | Z Break 上下界拖动 handles                  | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-views.js / mock-workspace.js                      |
| F088 | Z Break snap to layer                       | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-views.js / mock-workspace.js                      |
| F089 | Z Break Front/Back scale                    | 部分/占位 | 数字 draft，无真实 Z 映射                                                        | mock-views.js / mock-workspace.js                      |
| F090 | Z Break equal scale                         | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-views.js / mock-workspace.js                      |
| F091 | Section Border                              | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F092 | Section A/B readout                         | 部分/占位 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F093 | Detail ROI 入口                             | 部分/占位 | 通用 ROI 设置；无独立 Detail 工具                                                | mock-views.js / mock-workspace.js                      |
| F094 | Detail ROI 四角 handles                     | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-views.js / mock-workspace.js                      |
| F095 | Detail magnifier inset                      | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-views.js / mock-workspace.js                      |
| F096 | Detail shape square/circle                  | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-views.js / mock-workspace.js                      |
| F097 | Detail zoom/drag/close                      | 部分/占位 | 设置值，无 magnifier inset                                                       | mock-views.js / mock-workspace.js                      |
| F098 | Section SVG Export                          | 部分/占位 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F099 | Section Max                                 | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | mock-views.js / mock-workspace.js                      |
| F100 | Section Legend 折叠                         | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-views.js / mock-workspace.js                      |
| F101 | Section Legend 容器尺寸                     | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | mock-views.js / mock-workspace.js                      |
| F102 | Base 编辑入口                               | mock 草稿 | Base 表单已补，位于 Project 具名子槽                                             | mock-domain-panels.js / mock-workspace.js              |
| F103 | Rectangle / Circle                          | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F104 | Width W                                     | mock 草稿 | 本轮 Width draft，正数校验，µm/nm/mm 转换                                        | mock-domain-panels.js / mock-workspace.js              |
| F105 | Height H                                    | mock 草稿 | 本轮 Height draft，正数校验，µm/nm/mm 转换                                       | mock-domain-panels.js / mock-workspace.js              |
| F106 | Thickness Z                                 | mock 草稿 | 本轮 Thickness draft，正数校验，µm/nm/mm 转换                                    | mock-domain-panels.js / mock-workspace.js              |
| F107 | Apply base                                  | 部分/占位 | 确认仅保存 baseApplied draft；不重建实体                                         | mock-domain-panels.js / mock-workspace.js              |
| F108 | Revert base                                 | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F109 | Keep / Clear 历史确认                       | mock 草稿 | Keep/Clear 双重确认 draft；不删除 source History                                 | mock-domain-panels.js / mock-workspace.js              |
| F110 | Import GDS/GDSII/OAS/OASIS                  | 部分/占位 | 固定 GDS sample metadata 预览，无 file input/parser                              | mock-domain-panels.js / mock-workspace.js              |
| F111 | KLayout samples select                      | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F112 | Cells tree root                             | 部分/占位 | 递归 metadata 树，非生产 cellTree 控制器                                         | mock-domain-panels.js / mock-workspace.js              |
| F113 | Cell caret展开/折叠                         | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F114 | Cell name选择                               | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F115 | Cell instance count                         | 部分/占位 | 显示 shapeCount，非 instance count                                               | mock-domain-panels.js / mock-workspace.js              |
| F116 | Layers list                                 | 部分/占位 | metadata list，未接生产 maskLayerList                                            | mock-domain-panels.js / mock-workspace.js              |
| F117 | Layer/Datatype checkbox                     | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F118 | Layer hover/disabled                        | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F119 | Alignment X/Y/S/R                           | 部分/占位 | 参数 draft，不变更生产 Mask geometry                                             | mock-domain-panels.js / mock-workspace.js              |
| F120 | Mask no-file empty state                    | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F121 | Process Manual/Recipe/Diagnostics 模式      | 壳层      | Manual/Recipe/Code/Diagnostics 已由注册表提供                                    | mock-domain-panels.js / mock-workspace.js              |
| F122 | Deposit                                     | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F123 | Extend                                      | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F124 | Etch                                        | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F125 | Implant                                     | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F126 | Electrical                                  | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F127 | Record                                      | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F128 | Lift-off (main新增)                         | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F129 | Front/Back face                             | 部分/占位 | Front/Rear；legacy 是 front/back，值语义不一致                                   | mock-domain-panels.js / mock-workspace.js              |
| F130 | Selected/Invert/Whole face                  | 部分/占位 | mask/full/roi；缺 invert，ROI 不是 legacy area 替代品                            | mock-domain-panels.js / mock-workspace.js              |
| F131 | Material / Target layer                     | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F132 | Layer Name                                  | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F133 | Thickness / Depth                           | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F134 | Coverage Directional/Conformal              | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F135 | Transfer / Laminate                         | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F136 | Transfer Placement Follow/Flat              | 部分/占位 | Placement 错挂 Extend；Transfer 覆盖缺失                                         | mock-domain-panels.js / mock-workspace.js              |
| F137 | Etch Directional                            | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F138 | Etch Isotropic                              | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F139 | Etch Planarize/CMP                          | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F140 | Etch Undercut                               | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F141 | Etch material-selective target              | 部分/占位 | 统一材料下拉，非 selective target 合同                                           | mock-domain-panels.js / mock-workspace.js              |
| F142 | Surface Smooth/Rough/Pyramid                | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F143 | Rough Feature XY/CV                         | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F144 | Rough Height/CV                             | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F145 | Rough Orientation/Seed                      | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F146 | Implant Tilt/Depth/Name                     | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F147 | Electrical Type/Source/Depth                | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F148 | Record Process/Temp/Time/Ambient/Note       | 部分/占位 | 有 label/temp/time/ambient；缺 Process kind/Note                                 | mock-domain-panels.js / mock-workspace.js              |
| F149 | Also add to Recipe                          | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F150 | Apply                                       | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F151 | Undo/Redo (manual)                          | 部分/占位 | 撤销 state 编辑，非 Process 事务 Undo/Redo                                       | mock-domain-panels.js / mock-workspace.js              |
| F152 | Process visual guide before/after           | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F153 | Process guide Wiki link                     | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F154 | Recipe name                                 | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F155 | Recipe Template select                      | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F156 | Template preview/替换确认                   | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F157 | Steps / Code switch                         | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F158 | Recipe Undo/Redo                            | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F159 | Add kind 7种                                | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F160 | Add Step                                    | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F161 | Step 行编号与摘要                           | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F162 | Step 完成/失败/未运行状态                   | 部分/占位 | 失败可见；完成/未运行状态不完整                                                  | mock-domain-panels.js / mock-workspace.js              |
| F163 | Step 选择                                   | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F164 | Step operation change                       | 缺失      | 编辑器无 command 下拉及事件                                                      | mock-domain-panels.js / mock-workspace.js              |
| F165 | Move Up/Down                                | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F166 | Copy/Delete step                            | 部分/占位 | Delete 有，Copy 无                                                               | mock-domain-panels.js / mock-workspace.js              |
| F167 | Step Face/Area/Target/Length                | 部分/占位 | 仅已有 primitive params，未完整定义各 operation schema                           | mock-domain-panels.js / mock-workspace.js              |
| F168 | Step Rough/Implant/Electrical/Record fields | 部分/占位 | 对象 surface/mask 被过滤，缺完整 Rough/Mask 参数                                 | mock-domain-panels.js / mock-workspace.js              |
| F169 | Captured Mask summary                       | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F170 | Use current Mask                            | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F171 | Code textarea                               | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F172 | Apply code / Format                         | 部分/占位 | Apply/Format 只发演示提示，不解析文本                                            | mock-domain-panels.js / mock-workspace.js              |
| F173 | Validate/errors/warnings                    | 部分/占位 | 有限 numeric draft validation，非 parser/worker 合同                             | mock-domain-panels.js / mock-workspace.js              |
| F174 | Run Start Continue/Rebuild                  | 部分/占位 | 模拟 Continue/Rebuild，不执行真实事务                                            | mock-domain-panels.js / mock-workspace.js              |
| F175 | Run to Step                                 | 部分/占位 | 模拟进度到选中步，非 replay                                                      | mock-domain-panels.js / mock-workspace.js              |
| F176 | Run All                                     | 部分/占位 | 模拟进度，模型/History 不变                                                      | mock-domain-panels.js / mock-workspace.js              |
| F177 | Stop                                        | 部分/占位 | 模拟取消，无 AbortController/worker rollback                                     | mock-domain-panels.js / mock-workspace.js              |
| F178 | Progress/count/Bar                          | 部分/占位 | 手动 Advance simulation，无真实 worker progress                                  | mock-domain-panels.js / mock-workspace.js              |
| F179 | Run Summary/失败定位                        | 部分/占位 | 人工注入失败，非实际执行定位                                                     | mock-domain-panels.js / mock-workspace.js              |
| F180 | Recipe Lift-off step                        | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F181 | Diagnostics 入口                            | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | mock-domain-panels.js / mock-workspace.js              |
| F182 | Analyze geometry                            | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F183 | 状态:未运行/正在运行/完成/过期              | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F184 | Errors/warnings/Z gaps                      | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F185 | Material volume/Regions/Array instances     | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F186 | Gap volume/XY voids/slits/Appearances       | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F187 | Materials 行/厚度范围                       | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F188 | Findings/位置/次数                          | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F189 | Partial scan/omitted/stale 警告             | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F190 | History 容器及独立滚动                      | 壳层      | 本轮补 bounded ancestor；1440×650 真 mouseWheel 到底已通过                       | mock-domain-panels.js / mock-workspace.js              |
| F191 | Variant 树递归及起点                        | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F192 | Variant 展开/折叠                           | 缺失      | 没有折叠控件/状态，旧表 mock 标记错误                                            | mock-domain-panels.js / mock-workspace.js              |
| F193 | Variant 名称及 step count                   | 部分/占位 | 有分支名称/HEAD，无 step count                                                   | mock-domain-panels.js / mock-workspace.js              |
| F194 | 切换 Variant HEAD                           | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F195 | Variant Rename 双击/按钮                    | 缺失      | 没有双击/按钮/菜单 rename，旧表 mock有限错误                                     | mock-domain-panels.js / mock-workspace.js              |
| F196 | Delete Variant                              | 缺失      | 没有删除入口/handler，旧表 mock有限错误                                          | mock-domain-panels.js / mock-workspace.js              |
| F197 | Step marker/名称/meta                       | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F198 | Step HEAD/cursor 区分                       | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F199 | Step restore                                | 部分/占位 | 选择 fixture cursor；Restore 只提示，无事务                                      | mock-domain-panels.js / mock-workspace.js              |
| F200 | Legacy unavailable step                     | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F201 | Step ⋯菜单                                  | 部分/占位 | 仅 Select/Restore/Edit/Create Variant 四项，缺其它 legacy actions                | mock-domain-panels.js / mock-workspace.js              |
| F202 | Edit Step                                   | 部分/占位 | 打开 Process draft，未还原旧 Step 真实操作参数                                   | mock-domain-panels.js / mock-workspace.js              |
| F203 | Insert before                               | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F204 | Continue from here                          | 缺失      | 缺专门 Continue action；Restore/Create Variant 不等价                            | mock-domain-panels.js / mock-workspace.js              |
| F205 | New Variant from here                       | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-domain-panels.js / mock-workspace.js              |
| F206 | Delete last Step                            | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F207 | Add bookmark                                | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F208 | Bookmark 子组展开                           | 部分/占位 | 总 bookmarks details，非 Step 内嵌子组                                           | mock-domain-panels.js / mock-workspace.js              |
| F209 | Bookmark Rename/Delete                      | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F210 | Legacy bookmark Restore                     | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-domain-panels.js / mock-workspace.js              |
| F211 | Historical edit/insert Banner               | 部分/占位 | 有 draft historical context，未覆盖 insert/edit 完整语义                         | mock-domain-panels.js / mock-workspace.js              |
| F212 | Return to HEAD/Cancel edit/insert           | 部分/占位 | 无 Return HEAD/Cancel 完整合同                                                   | mock-domain-panels.js / mock-workspace.js              |
| F213 | #layerLegend 宿主/滚动                      | 壳层      | 稳定 #layerLegend + list scroll；非生产 legend controller                        | section-legend.js / mock-workspace.js                  |
| F214 | 宽屏侧排/窄屏折叠                           | 壳层      | 布局/宿主/生命周期存在；不包含真实业务控制器                                     | section-legend.js / mock-workspace.js                  |
| F215 | Layers 标题                                 | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | section-legend.js / mock-workspace.js                  |
| F216 | 全局 Balanced/Airy/Warm/Cool                | mock 草稿 | Balanced/Airy/Warm/Cool 均已存在，旧表“无”过时                                   | section-legend.js / mock-workspace.js                  |
| F217 | 全局 Random palette                         | mock 草稿 | 全局 Random 已存在，旧表“仅行 random”过时                                        | section-legend.js / mock-workspace.js                  |
| F218 | Material 颜色/重命名                        | 部分/占位 | 颜色 draft 可用；Material rename 缺失                                            | section-legend.js / mock-workspace.js                  |
| F219 | Material Visible                            | 部分/占位 | Material Visible 控件缺失                                                        | section-legend.js / mock-workspace.js                  |
| F220 | Material 缺失/不可用状态                    | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | section-legend.js / mock-workspace.js                  |
| F221 | Implant gradient/Name/Visible               | 部分/占位 | 只读 kind/profile/visible，颜色 draft；无 rename/visible编辑                     | section-legend.js / mock-workspace.js                  |
| F222 | Electrical color/Name/Visible               | 部分/占位 | 颜色 draft，名称/Visible 不可编辑                                                | section-legend.js / mock-workspace.js                  |
| F223 | Depth profile Smooth/Follow offset          | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | section-legend.js / mock-workspace.js                  |
| F224 | 单行预制 Palette/Random color               | mock 草稿 | 本轮直接点击色块；移除冗余 palette icon                                          | section-legend.js / mock-workspace.js                  |
| F225 | Project Name                                | mock 草稿 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-workspace.js / overlay-manager.js                 |
| F226 | New project                                 | 部分/占位 | New setup draft，不建真实项目                                                    | mock-workspace.js / overlay-manager.js                 |
| F227 | Open .wafercad/.json                        | 部分/占位 | Load 切固定 example，无 project file input                                       | mock-workspace.js / overlay-manager.js                 |
| F228 | Local Save checkpoint                       | 部分/占位 | 下载 UI draft JSON，非 local checkpoint                                          | mock-workspace.js / overlay-manager.js                 |
| F229 | Export .wafercad                            | 部分/占位 | 下载 UI draft JSON，非 .wafercad                                                 | mock-workspace.js / overlay-manager.js                 |
| F230 | Recovery checkpoint select                  | 部分/占位 | 固定 recovery candidate，无真实列表                                              | mock-workspace.js / overlay-manager.js                 |
| F231 | Restore recovery                            | 部分/占位 | 重载 fixture，非 IndexedDB restore                                               | mock-workspace.js / overlay-manager.js                 |
| F232 | Clear recovery                              | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-workspace.js / overlay-manager.js                 |
| F233 | XYZ nm/µm/mm                                | mock 草稿 | 长度 draft 转换；不能据此认定所有 renderer/字段均接通                            | mock-workspace.js / overlay-manager.js                 |
| F234 | Project autosave owner状态                  | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-workspace.js / overlay-manager.js                 |
| F235 | Global status text/等级                     | 部分/占位 | 消息有容器，缺业务等级完整映射                                                   | mock-workspace.js / overlay-manager.js                 |
| F236 | Autosave Unsaved/Saving/Saved               | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-workspace.js / overlay-manager.js                 |
| F237 | Autosave paused/conflict                    | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-workspace.js / overlay-manager.js                 |
| F238 | Safe Reload                                 | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-workspace.js / overlay-manager.js                 |
| F239 | GitHub/commit link                          | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-workspace.js / overlay-manager.js                 |
| F240 | Process Task elapsed/stage                  | 部分/占位 | 侧栏手动模拟，不含真实 elapsed/stage                                             | mock-workspace.js / overlay-manager.js                 |
| F241 | Process Task Abort                          | 部分/占位 | 取消 mock task，不中止 worker                                                    | mock-workspace.js / overlay-manager.js                 |
| F242 | Conflict dialog/Take over                   | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | mock-workspace.js / overlay-manager.js                 |
| F243 | Confirmation title/message/detail           | 部分/占位 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-workspace.js / overlay-manager.js                 |
| F244 | Confirmation actions (danger/cancel)        | 部分/占位 | fixture / 内存 draft；尚未连接 legacy 业务控制器                                 | mock-workspace.js / overlay-manager.js                 |
| F245 | Popover Esc/外部点击/焦点归还               | 壳层      | 通用 manager + More 已测；行内 History/Legend menu 尚未统一 Escape/outside/focus | mock-workspace.js / overlay-manager.js                 |
| F246 | Dialog Esc/焦点Trap/返回                    | 壳层      | 通用 manager 已测；不能代表所有新增业务 dialogs                                  | mock-workspace.js / overlay-manager.js                 |
| F247 | Toast 宿主及生命周期                        | 壳层      | 宿主/API 已有；所有业务使用/自动销毁未穷举                                       | mock-workspace.js / overlay-manager.js                 |
| F248 | Boot/startup failure                        | 部分/占位 | fixtures catch 显示失败，但动态依赖加载 rejection 在 try 外                      | mock-workspace.js / overlay-manager.js                 |
| F249 | Start empty                                 | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | production-workspace.js (未接 Welcome)                 |
| F250 | Open example                                | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | production-workspace.js (未接 Welcome)                 |
| F251 | Import GDS/OAS                              | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | production-workspace.js (未接 Welcome)                 |
| F252 | Open WaferCAD project                       | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | production-workspace.js (未接 Welcome)                 |
| F253 | 7 example cards                             | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | production-workspace.js (未接 Welcome)                 |
| F254 | Main/Mask/3D/Section preview tabs           | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | production-workspace.js (未接 Welcome)                 |
| F255 | Explore 3D / Retry preview                  | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | production-workspace.js (未接 Welcome)                 |
| F256 | Card title/summary link                     | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | production-workspace.js (未接 Welcome)                 |
| F257 | Sources/DOI/Tags/+N                         | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | production-workspace.js (未接 Welcome)                 |
| F258 | Workflow/Scope说明                          | 缺失      | 无对应完整入口/编辑状态/事件；需补齐                                             | production-workspace.js (未接 Welcome)                 |
