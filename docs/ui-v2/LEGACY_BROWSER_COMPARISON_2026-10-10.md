# Legacy / v2 浏览器对照与窄屏修复 — 2026-10-10

审计版本：`c320d2a` 加本轮修复；最新 pre-M3 修复产品提交 **`d147c2c`**（此前布局批次 `644cbb6` / `d6a233a`），分支 `codex/ui-v2-m2-handoff-2026-10-09`。旧版入口 `app.html`，当前演示入口 `app-v2.html`，Welcome 为 `index.html`。本轮实际点击、输入、拖拽和滚轮操作，补充此前 [258 项源码对照](FULL_PARITY_AUDIT_2026-10-09.md)，不能把那张表当成 258 项已实际执行。

**结论：窄屏 History、图表高度和 Manual 示意图已修复并复验；最新自动壳层门槛 58 项通过；BC-01、BC-02、BC-09 已关闭。BC-03 到 BC-08 按用户决定延后到 M3。扩大范围后的 UI 对照仍有下表的未完成项，不能宣布完整 UI 或产品迁移验收通过。** [上一轮 targeted PASS](UI_ACCEPTANCE_2026-10-10.md) 只覆盖当时八项问题，不能覆盖本轮新发现的表单、ROI 和 Legend 缺口。

## 架构和范围

[M2 交接的范围更正](M2_ITERATION_HANDOFF_2026-10-09.md#m2m3-scope-and-placement-audit-addendum-2026-10-09)规定：严格 M2 负责 shell、具名挂载点、视图 chrome、布局、浮层与响应式；生产控制器和业务状态属于 M3。用户另行明确授权 Base 物理尺寸 **mock 草稿**，并要求补 UI、做旧版对照。本轮相应补充只在 mock 演示适配器中，不把生产业务迁移偷偷放进 shell。

因此，下面将严格 M2 的布局缺陷、用户要求的 mock 演示完整性、M3 的真实模型/IO 接线分开记录。演示表单选错操作仍是实际缺陷；真实工艺计算尚未接入也必须保持如实说明。两者不能互相抵消。

## 实际操作对照

旧版在 1280×900 的隔离测试项目 `M2 runtime comparison` 上操作；v2 使用 M3D，另有正式脚本的 Photodetector 分支场景。浏览器操作使用 Codex in-app browser。表中的“执行”指下面明确写出的动作，不代表所有科学参数组合和失败模式已穷举。

| 功能族 / inventory                                                | 旧版实际操作与结果                                                                                                                   | 当前 v2 实际对照与差异                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 导航、视图与 Split，F001–F024                                     | Project/Base/Mask/Process/History；Main→Mask→3D→Split；左窗改 Mask；Mask Max/Restore；Section 隐藏/显示均操作                        | 导航、视图和宿主稳定性由正式脚本覆盖；品牌已有返回首页入口，并保留标题样式、悬停与键盘焦点。移动端编辑/结果切换已实测                                                          |
| Project / units，F225–F233                                        | 改名；µm→mm→µm；Save 恢复点；Export 下载 `M2 runtime comparison.wafercad` 成功                                                       | Project/Base/Recovery 对话框实际打开；v2 只有示例选择与恢复模拟，没有真实项目 IO/恢复点保存。真实迁移归 M3                                                                     |
| writer lease，F234–F242                                           | 两个旧版测试标签触发 autosave paused；关闭旧测试标签，Take over 确认后继续；状态恢复 Saved locally                                   | 演示没有真实 lease/恢复协议；不能据 mock 确认弹窗认定生产恢复合同通过                                                                                                          |
| Base，F101–F109                                                   | Circle→Rectangle；80×60×5 µm Apply；Revert；再次 Apply；结构/状态栏有反馈                                                            | 物理尺寸草稿与确认已在前轮和正式脚本复验；本轮打开 Rebuild 对话框核对 Keep/Clear。没有改真实 Base                                                                              |
| Deposit / Extend，F121–F123、F129–F136、F149–F151                 | Whole face、名称、厚度、Also add to Recipe；Deposit Apply、Undo/Redo；Transfer Follow/Flat；Extend Conformal Apply；示意图随模式变化 | 正式脚本本轮检查可选的 18 种示意图组合；直接浏览确认 Deposit/Conformal 切换。通用 Material 与长度控件仍未按操作精确收敛                                                        |
| Etch，F124、F137–F145                                             | Directional/Smooth；Rough；Pyramid/Normal；Undercut、Isotropic、CMP；选择 oxide、0.05 µm 选择性 Etch Apply 成功                      | 实际切换 Directional/Rough/CMP；CMP 仍显示 Material 和正数 Thickness/depth，缺绝对 Target Z 语义；Directional 没有 All exposed materials 选项                                  |
| Lift-off / Implant / Electrical，F125–F126、F128、F146–F147、F180 | Lift-off 未选材料时 Apply disabled；选择材料；Implant 名称/Tilt/Apply；Electrical Depletion/Interface/Back/Apply；各自说明展开       | Lift-off 自动选已有材料；Implant/Electrical 重复通用长度和 Illustrative depth。没有在旧版执行 Lift-off 删除，也没有穷举 annotation 物理参数                                    |
| Record / guide，F127、F148–F153                                   | Clean、80°C、3min、N2、Note；Record 成功，History 新 Step；Before/After 与 Wiki 链接存在                                             | Record 字段可见；本轮补回 canonical guide 和 Wiki 锚点。没有新编一套工艺说明                                                                                                   |
| Recipe edit，F154–F170                                            | Copy、Record→Snapshot、Undo/Redo、Code；7 步 code 可见；后用 2 步安全 Recipe                                                         | v2 Add Snapshot、Copy、Save、Undo/Redo 实际操作到 37 步；仍暴露 step ID、command/参数 key；operation schema 没有完整收敛                                                       |
| Recipe run / Code，F171–F179                                      | 输入 Record+Snapshot 安全 DSL；Apply code、Format、Validate；Run All→Continue 确认；Completed 2/2，新增 History/书签                 | Code 的编辑布局及 mock busy/failure/continue/rebuild 由正式脚本覆盖；实际 parser、replay、worker rollback 不在 v2 演示中                                                       |
| Diagnostics，F181–F189                                            | Analyze geometry：完成，0 error/0 warning/0 Z gap；体积、材料、Findings 可见                                                         | v2 是未连线入口；真实 Analyze/统计/过期状态迁移归 M3，不能用示例假指标替代                                                                                                     |
| History / Variants，F190–F206                                     | 从 Deposit 新建 Variant；Main 改名、折叠/展开；子分支 Delete 确认后 Cancel；恢复 Extend；Edit→Cancel 回 HEAD                         | v2 改名、折叠/展开、菜单、编辑和 Cancel 已实际操作；初次发现 Deposit Edit 沿用 Lift-off。本小修按 stable node 装载 Deposit，并在两个示例复验 Cancel 恢复原草稿（BC-02 已关闭） |
| Bookmark，F207–F212                                               | Snapshot 产生书签；展开；Rename 保存；查看 Restore/Delete 菜单；未永久删除测试数据                                                   | v2 Add bookmark、嵌套 count 和历史编辑 Cancel 实际操作；正式脚本另有 rename/delete 草稿覆盖。真实 legacy saved-state Restore 属 M3                                             |
| File Mask，F110–F120                                              | 导入 GDS hierarchy sample 成功；TOP 选择、Layer 开/关；Alignment X=2,Y=-3,S=1.2,R=30                                                 | v2 Inspect sample 确认→12 Cells；TOP 选择、GDS Layer 开/关；缺 Cells 折叠/实例信息，结构 Layers 混列已修复；布局 Layer checkbox 可双向切换，Cells 改为紧凑树行                 |
| Draw Mask，F057–F065                                              | 实际拖拽 Rect/Circle/Ring/Ring Sector；Polygon 三顶点+Enter；Select 矩形→宽度数值编辑→Apply，5 shapes                                | v2 Ring→Add 到 3 shapes，只添加预设形状；没有旧版选中形状的数值编辑器。真实 pointer 几何接线仍属 M3                                                                            |
| Mask ROI / Main 3D ROI，F038–F043、F051–F053                      | Mask Square 拖拽→Rotation=15；Main Circle、Sector 拖拽；参考点/位置/半径/Start/End 字段可见                                          | v2 Mask ROI 选 Ring sector→Done；再打开 Section Detail ROI 时继承同一 Ring sector。范围共享；缺扇区起止角等条件字段                                                            |
| Main / 3D chrome，F025–F034、F044–F048、F071–F081                 | Main Pan 拖拽、Fit、Zoom+/−；3D Quality→Fast、Fit、Border 开/关；Export 子菜单查看                                                   | v2 图标/标题/焦点、40px touch 和 compact toolbar 由正式脚本覆盖。Fit/相机/GLB/PNG 是 mock 入口，没有宣称真实导出通过                                                           |
| Section，F035–F037、F082–F100                                     | Slice A Y；Auto↔1:1；Z Break 开/关、Snap、取消等比并修改 Front scale；Detail ROI 拖拽、Circle、Close                                 | v2 Section controls→1:1；Z-break settings、Detail settings 实际打开。Z 边界用 normalized 值，缺 Snap/等比；Detail 共享 Mask ROI 状态                                           |
| Legend，F213–F224                                                 | Warm、Random、色块调色；材料改名提交、隐藏/显示；Implant profile→Smooth                                                              | v2 色块/预设颜色已有实际复验；仍无材料和 annotation 名称编辑、Legend 显隐、Smooth/Follow 控件。Mask 的布局 Layer 显隐与 Section 的材料层相互独立                               |
| Mask export，F066–F070                                            | Draw Export 查看 SVG/GDS/OAS；切 File 后 Cells 选 ARC+CIRCLE，Layer 1/0 多选                                                         | v2 Export GDS 对话框实际打开：只有 Selected/All、Visible/All 范围，没有按 Cell/Layer 多选；下载输出未在此轮全部执行                                                            |
| Welcome，F249–F258                                                | 七张卡的 Main/Mask/Section/3D tab 都实际点击；来源/标签和工作流可见；部分嵌入仍显示 Loading，最终 3D 封面可见                        | v2 未迁移 Welcome。没有宣称 28 个 renderer preview 都完成，也没有执行全部七个项目打开；Welcome 生产接线归 M3                                                                   |

补充限制：没有穷举全部 11 个 GDS/OAS 样例、所有科学参数、清空 Recovery、真实 Stop/rollback、损坏项目迁移、每个导出文件或全部 renderer 像素基线。本轮关注 M2 布局与用户要求的 mock 界面缺口；这些未执行项在各自 M3/科学 owning suite 中验收。旧版永久删除菜单只打开并取消，没有清空用户数据。Welcome 的首页链接在这个预览服务器 `/` 会落到 v2，是服务器路由特性，不据此报旧产品缺陷。

## 本轮修复与回归

| 问题                | 原因与修复                                                                                                                        | 实际复验                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 窄屏看不到 History  | 390px 下 inspector 被压到 37px，内容区 0px。给窄屏 inspector 明确 480px 高度、禁止 flex 收缩；选择域时滚到编辑器                  | 390×844：inspector 480px，列表 378px/2366px；真实滚动 scrollTop=1988，到 Step 36。768px/390px 正式滚轮回归均通过          |
| 窄屏图太矮          | 增加 Single 编辑态视图/科学画布最小高度；Section 留够 plot+Legend；821–1100 Overview 每行最少 340px，并允许纵向滚动               | 390×844 Main 科学图 269px；1024×768 四个 view 均 340px；正式脚本检查 compact Section plot ≥240px                          |
| Manual 缺操作示意图 | 复用 `process-guide.js`/`process-guide-svg.js`。`docs:build` 生成可直接 `file://` 加载的 classic bridge；mock adapter 只选择/展示 | 18 个可选表单组合匹配 canonical SVG 和 Wiki 锚点；收起选择保留；19 对 SVG 的生成桥接逐一与 canonical 比较；`file://` 有图 |

追加用户指出的 Mask/标题问题：Mask File 只列 GDS layer/datatype，Draw 隐藏文件列表，Section 保留材料层；删除无作用的材料可见性草稿。Layer checkbox 与名称同一行，Cells 去除默认圆点和卡片堆叠，桌面行高 32px、触控行高 40px；初始选择可见根 Cell TOP，排除 context 元数据。原生 checkbox 读取 `checked`，开/关双向回归通过。Mask readout 显示所属 source/Cell/layer，不能继续显示结构材料层数。重复的 workspace 标题删除，选中导航 font-weight 600，保留焦点样式。

正式 runner 新增材料/布局层隔离和紧凑行对齐回归，以及四个导航无重复标题的回归：54 个命名检查全部通过。实际浏览器重复操作 Layer off/on，截图 `mask-layer-separation-1280.png` 同时显示左侧布局 Layer 1/0 和 Section 27 个材料层。File 样例仍只提供 inventory walkthrough，未迁移真实文件几何，导入对话框明确保留 Draw 预览；真实 File renderer 接线归 M3。

原始科学目录、旧控制器、真实模型和已批准视觉基线均未修改。生成桥接只由 `npm run docs:build` 更新，`docs:check` 检查漂移。具名 panel/canvas Host 身份和 frozen source fixture 的正式检查继续通过。

## 审计清单与进入 M3 的处置

| ID / 优先级 / 状态   | 范围与可复现缺口                                                                                      | 验收要求 / owner                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| BC-01 / P2 / 已关闭  | 严格 M2：品牌首页入口已实现，样式保持为产品标题                                                       | mock 入口指向 index.html，生产 shell 指向 ../index.html；真实浏览器点击成功；Welcome 业务启动仍归 M3                                |
| BC-02 / P1 / 已关闭  | mock：先选 Lift-off→Deposit Step→Edit，已改为装载该 node 的 Deposit 参数                              | M3D / Photodetector 两个节点均验证名称、厚度和 face；Cancel 恢复原草稿与 undo/redo；stable Host 和 frozen source 保持               |
| BC-03 / P1 / 延后 M3 | mock：CMP 仍显示通用正数 Thickness/depth 和 Material；Implant/Electrical 有两个长度；All exposed 缺失 | 按 operation/profile 定义字段/合法值、单位与空目标状态；支持物理 Target Z。之后由真实 Process controller 接管                       |
| BC-04 / P1 / 延后 M3 | mock：Mask ROI Ring sector 被带进 Section Detail，Main ROI 也共用通用设置                             | 三类 ROI 各自状态/单位/形状合同；扇区角度等条件字段完整；实际几何和 renderer 仍在 M3                                                |
| BC-05 / P1 / 延后 M3 | mock：Z Break 使用 normalized Z，缺 Snap 与等比选项                                                   | 物理 µm 上下边界、Snap、linked Front/Back、合法边界验证；只影响显示草稿                                                             |
| BC-06 / P2 / 延后 M3 | mock：Draw 无选中形状数值编辑；Cells 无折叠/实例信息；Export 无 Cell/Layer 多选                       | 在所属 mock/domain adapter 提供对应表单与稳定 IDs；真实绘制/import/export 不仿造                                                    |
| BC-07 / P1 / 延后 M3 | mock：Legend 无名称、显隐、Depth profile 编辑                                                         | 材料/Implant/Electrical 各有相应控件和草稿状态；source frozen，具名 Legend Host 不重建                                              |
| BC-08 / P2 / 延后 M3 | mock：Recipe 参数 schema、snapshot 编辑、captured-mask 条件字段不完整                                 | 动态操作表单收敛；复制/改类型/保存不丢 stable ID 与 µm 值；真实 DSL/parser 归 M3                                                    |
| BC-09 / P1 / 已关闭  | 表现层：开发术语和内部 step ID 已移除；参数标签改为产品用语，界面和保存状态统一为英文                 | 两示例七个编辑入口、七种 Manual 操作、新 Recipe ID、Base 和 Z-break 弹窗已扫描；Code 保留有意义的 DSL，内部字段和日志不作为 UI 文案 |

BC-02 已关闭；BC-03–BC-08 按用户最终决定延后到 M3，不再继续完善将被替换的 mock 实现。这些项不能变成生产迁移“通过数”。M3 仍须接入 Process/Recipe 事务、History restore/replay、项目 migration/IO/recovery/lease、科学渲染与所有输出、Diagnostics、Welcome；科学数据合同由 [Testing](../testing.md) 指定的 suite 验证。

## Pre-M3 小修关闭与明确延期（产品 `d147c2c`）

按用户最终范围，进入 M3 前关闭 BC-01、BC-02、BC-09；BC-03 到 BC-08 不再补齐 mock 实现，全部转为 M3 的真实 Process / Recipe / ROI / Legend / Draw / File / Export 接线验收项。已开始的 BC-03/04/05 草稿修改已撤回。**M2 完整 UI 对照仍未通过**；58 项 shell 检查通过不能替代真实业务和完整 UI 对照。

本分支已通过正常 merge `2dc680f` 合入最新 `origin/main` `d73a201`（TiO2 metalens 更新），没有重写历史。此前布局修复 `644cbb6`、Mask/标题修复 `d6a233a` 和报告 `0a19e2f` 已 push；本小修与本记录随后正常 push 到原分支。

BC-02 的离线 fixture packager 按原始 stable node ID 提取 operation replay 参数为 `node.edit`，不运行 core、不导入生产控制器。mock controller 按该 payload 装载 Manual 草稿，完整参数另保留于 `processSourceParams`；进入 Edit 前保存 Manual 字段和独立 undo/redo，Cancel/Return 恢复。Deposit 的名称、厚度、face/area 不再借用上一张表单。生产 restore/replay 事务仍归 M3。

BC-09 只清理文案和语言标记：`prototype`、`source History`、`normalized Z`、`presentation only` 等退出用户界面；相对 Z 数值仍为 0–1，标签为 Start/End position，并未偷偷转成物理 Z。Recipe 字段改为可读英文标签，显示 Step 编号而非内部 ID。Code 的 DSL 和内部状态键保留。mock/production 两个英文界面均使用 `lang=en`，预览条和 live reload 状态也改为英文。

品牌为无下划线的标题入口，保留字重/颜色并增加 hover/focus；状态栏右侧加入 GitHub 与 Wiki，使用安全的新标签链接。`status.save` 仍由 adapter 的 presentation 值驱动，shell 不接管保存业务。当前预览显示 `Autosave off · Preview` 或 `Autosave off · Unsaved preview changes`，不伪称已保存；M3 替换为真实保存状态。

本批精确验证（Windows / Node / Chrome 同下）：

| 命令                                                                                                                                                                                                                                                                                                                                                                                                       | 结果                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `$env:WAFERCAD_REVIEW_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe'; node scripts/v2/check-m2-shell.mjs`                                                                                                                                                                                                                                                                                  | exit 0；58 个命名检查；errors []；包含两个 stable-node Edit/Cancel、宿主稳定性、英文文案和品牌/页脚检查 |
| `npm run lint`                                                                                                                                                                                                                                                                                                                                                                                             | exit 0                                                                                                  |
| `npm run docs:check`                                                                                                                                                                                                                                                                                                                                                                                       | exit 0；合入 main 后文档和生成示意图检查通过                                                            |
| `node scripts/v2/build-m2-mock-data.mjs`                                                                                                                                                                                                                                                                                                                                                                   | exit 0；离线生成 fixture 无漂移，源 SHA 校验通过                                                        |
| `node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs site/tests/process-guide.test.mjs site/tests/documentation.test.mjs site/tests/wiki-manual.test.mjs`                                                                                                                                                                                                                    | exit 0；27 passed / 0 failed（8 shell 契约、8 guide、11 文档）                                          |
| `npx prettier --check scripts/v2/build-m2-mock-data.mjs scripts/v2/check-m2-shell.mjs scripts/v2/m25-shell-contract.test.mjs site/app-v2.html site/ui-v2/app.html site/ui-v2/live-preview.js site/ui-v2/mock-data.js site/ui-v2/mock-domain-panels.js site/ui-v2/mock-views.js site/ui-v2/mock-workspace.js site/ui-v2/production-workspace.js site/ui-v2/workstation-v2.js site/ui-v2/workstation-v2.css` | exit 0                                                                                                  |
| `git diff --check`                                                                                                                                                                                                                                                                                                                                                                                         | exit 0                                                                                                  |

契约测试首次因旧 `lang=zh-CN` 断言失败，按用户明确要求英文界面更新为 `lang=en` 后 27 项全部通过；架构和业务隔离断言未放宽。实际 IAB 点击品牌到 `index.html` Welcome 成功；Lift-off→History Deposit Edit 展示 0.07 µm / Front / Whole face，Cancel 返回原草稿。支持截图：`test-results/ui-v2-acceptance/pre-m3-history-edit-1280.png`，包含品牌样式和英文右下角保存状态/项目链接。

## 前一布局批次的精确验证与复现（`d6a233a`）

环境：Windows NT `10.0.26300.0`，Node `v24.16.0`，正式 runner Chrome `155.0.8059.40`；依赖前轮 `npm ci` 锁定，本轮无依赖变更。未替换视觉基线、未合并/deploy、未触发手动 CI。

| 命令                                                                                                                                                                                                                                                                      | 结果                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm run docs:build`                                                                                                                                                                                                                                                      | exit 0；新增 classic bridge；原 canonical catalog / Wiki SVG 内容未变                   |
| `$env:WAFERCAD_REVIEW_CHROME='C:/Program Files/Google/Chrome/Application/chrome.exe'; node scripts/v2/check-m2-shell.mjs`                                                                                                                                                 | exit 0，54 个命名检查，errors `[]`；包含本轮 guide、768/390 History 滚轮与 Section 高度 |
| `node --test scripts/v2/view-state.test.mjs scripts/v2/m25-shell-contract.test.mjs site/tests/process-guide.test.mjs`                                                                                                                                                     | exit 0；16 passed / 0 failed（8 契约 + 8 guide）                                        |
| `npm run lint`                                                                                                                                                                                                                                                            | exit 0                                                                                  |
| `npx prettier --check scripts/build-process-guide.mjs scripts/v2/check-m2-shell.mjs site/app-v2.html site/tests/process-guide.test.mjs site/ui-v2/process-guide.generated.js site/ui-v2/mock-domain-panels.js site/ui-v2/mock-workspace.js site/ui-v2/workstation-v2.css` | exit 0                                                                                  |
| `npm run docs:check`                                                                                                                                                                                                                                                      | exit 0；生成桥接、Wiki 图和链接/导航检查通过                                            |
| `git diff --check`                                                                                                                                                                                                                                                        | exit 0                                                                                  |

首次新 guide 检查因 SVG 的 DOM 序列化和原始字符串不一致而失败；改为比较解析后的 DOM 节点等价，最终完整运行通过，没有放宽科学图内容。

文档回归：`node --test site/tests/documentation.test.mjs site/tests/wiki-manual.test.mjs` exit 0，11 passed / 0 failed。后续 Mask/导航改动格式检查追加 `site/ui-v2/mock-views.js site/ui-v2/workstation-v2.js`；ESLint、54 项正式浏览器检查全部重新执行并通过。新增 Layer 双向检查首次暴露 `value`/`checked` 错误，修产品后通过，未放宽断言。

复现：从仓库根目录 `node scripts/v2/serve-v2.mjs`，用非 live `http://127.0.0.1:4182/app-v2.html` 保留操作草稿；测量实际 viewport。390×844 选择 History，用列表内真实滚轮到末项；1024×768 选择 Overview，在结果区域纵向滚动。Manual 切换 operation/mode 后检查 Before/After 与 Wiki 锚点。旧版通过 `app.html` 复现表中步骤。

支持截图在忽略目录 `test-results/ui-v2-acceptance/`：`history-mobile-before.png`、`history-mobile-final-390.png`、`history-mobile-final-bottom-390.png`、`manual-guide-deposit-1280.png`。提交的表格与复现路径是共享审计依据；这些本地截图不是批准的像素基线。
