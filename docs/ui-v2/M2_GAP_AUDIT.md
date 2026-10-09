# M2 自查：UI 缺口闭环与 M3 边界

2026-10-09；分支 `refactor/ui-v2-m0`。本清单核对 r2、M0 CONTRACT / IMPLICIT_DEPS、旧 `app.html` 与相关控制器。

“完成”只表示 M2 静态/半静态壳层有可操作的本地 draft 和可见状态；不代表接通真实领域事务、科学计算、renderer、存储或文件导入导出。

## M2 已补齐

| ID  | 自查项                                    | M2 交付与边界                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G01 | History 的真实 Variant 起点与 HEAD/cursor | 新增纯 `history-tree.js` Step-first 投影。使用真实 `rootNodeId` / `parentBranchId` 递归嵌套 Variant；HEAD 与选中 cursor 分开标识。每个 Step 另有 `⋯` 行菜单；Photodetector 有真实分支树浏览器断言。源 History 冻结。                                                   |
| G02 | Manual 操作表单                           | Deposit、Extend（Coverage/Placement）、Etch（Directional/Isotropic 与 Smooth/Rough/Pyramid 分离）、Implant、Electrical、Record。Implant Tilt 可负向步进并限于 −80…80。仅改 mock draft。                                                                                |
| G03 | Recipe 构建与校验                         | Add/Delete/Move、字段编辑、独立 Undo/Redo、Validate 入口和本地字段错误、模板预览/显式替换确认，以及 Run All / Continue / Rebuild / Run to Step。不是生产级 Recipe validator/parser。                                                                                   |
| G04 | Main / ROI / Section A–B                  | ROI 形状、锚点、位置/尺寸/半径/旋转、Clear；Mask 对齐 X/Y/scale/rotation；Section A/B 坐标编辑。nm/µm/mm 仅变更显示/输入，长度 draft 归一到 µm。真实指针交互留 M3。                                                                                                    |
| G05 | Mask 工具与 File 树                       | Draw source 下显示 Select/Rect/Circle/Polygon/Ring/Ring-Sector 与 Add/Delete/Clear 草稿；ROI/alignment/opacity 为并行画布浮窗；实际 GDS 样例按 TOP references 递归显示 Cell 树，File Layers 可见性草稿；More 中 SVG/GDS/OAS 范围表单。无真实 GDS 导入或几何 mutation。 |
| G06 | Section 显示与 Z-break                    | Auto/1:1、Borders、Z-break start/end/front/back scale、Detail ROI 设置/清除、Legend 行预制色板与随机色按钮（只改本地 UI draft 色值）。Section plot 仍是注明为 schematic 的层堆叠，不是真实截面 renderer。                                                              |
| G07 | 视图导出与显示                            | 所有 view export 只在标题栏 More 菜单；按 Main/Mask/3D/Section 提供 SVG/PNG、GDS/OAS、GLB/PNG、取消导出与透明度/边界草稿。无科学文件或计算结果产出。                                                                                                                   |
| G08 | Project 单位与 Apply 历史                 | XYZ nm/µm/mm 是 Project 工作区选项；Manual Apply 下方提供 UI draft Undo/Redo 快照；Recipe 另有自己的 Undo/Redo。Project Rebuild Base 明确提供 Keep / Clear（二次确认）/ Cancel。均不写入源项目或 History。                                                             |

## 仍明确留给 M3 / M4

- Project 文件读写、Base 事务、Recovery / IndexedDB / writer lease / reload；当前 Save 只导出标记为非项目文件的 UI draft。
- Process worker、Recipe parser/validator/replay、失败回滚、真实 History restore/fork/HEAD/bookmark 事务。
- 四个真实 renderer、指针坐标路径、科学 Section、3D Fast/Quality 与物理 GLB；History 选择不会重建实际科学视图。
- 259 静态 ID / 动态控件库存未完成追踪；5 个动态表达式仍按计划留 M3 逐一追踪。
- Welcome 启动、默认入口切换与降级路径留 M3；M4 全量回归与视觉基线未执行。基线浏览器仍须用户确认。
- Section Legend 真实重命名/显隐/调色/profile 编辑属于 M3；当前只读真实标签、颜色、ID 与 Implant 注释。
- `origin/main` 的 `b81598b` 已合并；开始真实接线前仍需同步并检查当时最新主线。

## 迭代修正

- XYZ display unit 位于 Project 工作区；Undo/Redo 位于 Manual 的 Apply 下方，Recipe 仍保留独立步骤 Undo/Redo。
- Mask Draw 工具移入画布浮动工具条，各种选择/绘图动作使用独立内联 SVG 图标；ROI、Alignment、Opacity 参数改为画布内浮动面板，不占左侧 Cells/Layers 面板空间。
- Mask source 选 Draw 时才显示 Draw 工具；ROI 与 ROI 参数入口独立且始终可用。工具同属一个一致的画布浮条，图标 16px、触控目标至少 40px。
- History 树行取消浏览器默认序号/圆点及卡片边框，使用紧凑行、分支线与缩进表达层级；Step 操作固定在面板上方，每个 Step 行有锚定的 `⋯` 菜单（Select / Restore / Edit / Create Variant），列表独立滚动并保留位置。

## 自查结果

- 原生 Chrome 155 / CDP：`node scripts/v2/check-m2-shell.mjs` 25 项通过，无页面/控制台错误；不使用 Playwright、不截图。
- 1440 / 1024 下 mock Main 与 3D ROI top/bottom DOM 对齐差均为 0px（阈值 0.25px）。这是 mock registration plane 检查，不是 #161 真实 renderer 根因已修复的证据。
- 检查还覆盖 768 / 390 单视图文档流、无 overlay/flyout、Section Legend 布局、真实 Photodetector 7 Variant 及 origin Step 嵌套、空 History、源对象 frozen。
- `node --test scripts/v2/view-state.test.mjs`：5/5。ESLint 与本次 M2 范围 Prettier 检查通过；不格式化 main 上既有 18 个失败文件。
- `git diff --check` 通过；v2 mock 数据由原始示例生成，无科学执行。

M2 到此为独立 mock 壳层检查点；不进入 M3、不切换默认入口、不部署、不 push。
