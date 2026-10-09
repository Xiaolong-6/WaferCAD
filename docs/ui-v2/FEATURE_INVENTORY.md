# UI v2 Feature Inventory — M2 / M3 阶段与动态元素

> 日期 2026-10-09；分支 `codex/ui-v2-m2-handoff-2026-10-09`。核对基准为 legacy `site/app.html` 及控制器、独立的 `site/index.html` + `welcome.js`、[CONTRACT.md](CONTRACT.md)、M1.5 `site/ui-v2/prototypes/a-full/`、当前 `site/app-v2.html`。**仅源码静态清点，不能用来证明浏览器可见性、交互性或 M3 真实覆盖。** 每个功能的落位/条件和与原型的差异在 [PLACEMENT_MAP.md](PLACEMENT_MAP.md)。

## M2.5 / main 同步增量

- `main` 的 `21b2318` 与 `fbbc261` 已合入工作分支（merge `1dde9b15`）。合并后的 legacy `app.html` 有 **267 个静态 ID**；较 M0 的 259 个新增 3 个 Lift-off、5 个 Diagnostics ID。详见 [CONTRACT.md](CONTRACT.md) 新增附录；205 动态类+计算模式仍是 M0 基线，尚未重新生成。
- M2.5 配置式 Shell 的具名宿主、适配器生命周期、三个 overlay portal 和稳定 canvas host 均已编码；生产安全预览位于 `site/ui-v2/app.html`（不加载 mock）。旧 `site/app-v2.html` 仍是开发 mock 预览，出于本阶段路径限制未修改其 HTML。
- **Lift-off**：Process Step 的 Sacrificial Layer 选择，及 Recipe 的 `liftoff` 编辑/执行语义，归 M3；当前 M2 mock 仅有类型/字段的演示，**不得宣称已实现执行、掩膜过滤、失败回滚**。
- **Diagnostics**：属于 `panel.process.diagnostics` 具名子槽，M2 只保留区域，真实 Read-only Analyze / metrics / findings 归 M3。
- 布局继续遵循 M1.5 的 A：Base = `panel.base` 且嵌在 Project；四个一级导航不变。所有新增外部业务信息通过 `presentation()` 与适配器而非由 Shell 直接推断。

## 阶段边界（用户 2026-10-09 确认）

| 项目 | M2：只负责壳 | M3：真实功能和动态内容 |
| --- | --- | --- |
| 全局工作区 | 顶栏、Overview/Main/Mask/3D/Split、导航、收起/展开、Max、Section Hide/Show、窄屏 Layers、sessionStorage | 业务入口路由、各控制器接线 |
| 公共 view-panel | **一套**标题/Fit/More/Max/readout 模板；每个视图有具名专属控件插槽，先放占位按钮 | Slice、ROI、Source、Fast/Quality、Scale、Z Break、Detail ROI、渲染器、真实导出 |
| 域框架 | Project/Base/Mask/Process/History 的**稳定具名容器**和面板切换；仅占位内容 | Base、Mask Browser、Step、Recipe、Diagnostics、History、Project/Recovery |
| 浮层/状态 | Popover/Dialog/Toast 基础设施，Esc/点外部/焦点归还；状态栏位置及占位文字 | 真实浮层内容、进度/冲突/确认、保存状态 |
| 动态宿主 | `#layerLegend`、Cells/Layers、Recipe、History 的**位置、尺寸、窄屏折叠** | Layer/Step/Variant/Card 行及交互 |
| 视觉/响应式 | M1.5 字号/色/间距与 1440/1024/768/390；mock Main/3D 1.7857px ROI 偏移专项 | 接真实 renderer 后重做 ROI + 指针验收 |
| Welcome | 返回/打开首页的有效入口 | 七张卡片、交互预览、引用及路由（M3 最后或单独处理） |

- **灰区**：M2 放好工具栏按钮和布局，M3 绑定行为。颜色、字号、间距在 M2 一次解决，M3 不重复返工。
- **提前的 M3 mock**：现有 Recipe/History/Legend/Draw/Project/Process 演示保留，按域作为 M3 参考；不能折算为 M2 的五域具名插槽已完成，更不能算生产事务已接通。
- **Base 歧义**：批准的 M1.5 A 方案只设 Project / Mask / Process / History 四个一级入口；Base 放在 Project 工作流下设具名二级宿主，不自行增设第五个一级入口。此点在落位表列为需确认的模型差异。
- 旧 `.workstation-ui-v2`（以及 `workstation-compact-ui` / `workstation-boot`）与新 `html[data-ui="v2"]` **不同命名空间**。新入口不得引入旧装配或触发旧 CSS guard。
- 视图记忆沿用 `wafercad.workstation-view-mode.v1` 和 `wafercad.workstation-split-views.v1`，实际为 **sessionStorage**，非 localStorage。

## 功能域基准（逐功能一行的映射见 PLACEMENT_MAP）

| 域 | A 入口 / B 动态内容 / C 条件状态 / D 跨域流程清点 |
| --- | --- |
| Global | 顶栏、视图 modes、Split slots、导航/面板、最大化、Section dock、移动布局、readout、模式记忆 |
| Main | Slice A/B 四坐标+端点、3D ROI Rect/Circle/Sector/Reference/XY/尺寸、Pan/Fit/Zoom/SVG/Max |
| Mask View/Draw | File/Draw、Mask ROI、透明度、Fit/Zoom/Max、Cells/Layers导出选择、SVG/GDS/OAS、Draw 6 工具、Delete/Clear、动态 Shape editor |
| 3D | Fast/Quality、Border/Opacity、Fit、GLB/PNG/Cancel export、Max、渲染反馈 |
| Section | Auto/1:1、Border、Z Break boundary/scale/snap、Detail ROI、放大 inset、Legend、SVG、Max |
| Base | Rectangle/Circle、W/H/Z、Apply/Revert、重建确认 |
| Mask Browser | GDS/OAS Import、KLayout samples、Cells 层级/数量/选中、Layer/datatype checkbox/hover/count、Alignment |
| Process Step | Step/Recipe/Diagnostics、Deposit/Extend/Etch/Implant/Electrical/Record、目标/厚度/Surface/Area、Transfer/Conformal、Isotropic/CMP/Undercut、Rough/Pyramid、Apply/Undo/Redo、Visual Guide |
| Recipe | 名称/模板显式替换、Steps/Code、Add/Delete/Copy/Move、Step editor、Mask context、Recipe Undo/Redo、Validate、Run To/All/Stop、进度/失败 |
| Diagnostics | Analyze、summary/metrics、Materials/Findings、位置/次数、partial/stale/error |
| History | Variant/Step/Bookmark树、HEAD/cursor、Restore/Edit/Insert/Continue/Fork/Delete/Bookmark、重命名、Legacy、菜单传播/焦点 |
| Layer Legend | Palette/Random、Material/Implant/Electrical 行、Name/Color/Visible/Depth profile、长列表 |
| Project / Recovery | New/Open/Save checkpoint/Export、Recovery select/Restore/Clear、XYZ unit |
| Status / Overlays | 状态/Autosave/Reload、Task Abort、Conflict Take over、Confirmation、通用 Popover/Dialog/Toast |
| Welcome | 启动链接、七张卡片、四视图预览、Explore/Retry、DOI、Tags、Workflow/Scope |

## M3 四级验收标准

| 等级 | 证据 |
| --- | --- |
| A 入口 | 在 M1.5 批准的位置可访问、键盘/禁用/ARIA 合理 |
| B 动态 | 使用实际项目渲染 Cells/Layers/Steps/Variants/Legend；数据稳定 ID、生成时机 |
| C 状态 | 空、长列表、选中、HEAD、不可恢复、忙/失败/过期、窄屏、Esc/焦点 |
| D 流程 | Import→Process→History→Recipe、失败回滚、项目恢复、真实多视图一致、导出 |

每域至少过 **A+B+C**；涉及事务/跨域加 **D**。不能用模拟数据、CI 绿、DOM id 存在取代此验收。

## CONTRACT 动态类归属（205 个具体类 + 1 个计算模式）

M0 契约统计：`staticIds=259`；`dynamicClasses=205`；`dynamicClassPatterns=1`；`unresolvedOperations=5`。下表 **206 行** = **205 个类 + 1 个模式**，全部逐项归属；此表只指定迁移目标，不表示当前 M2 已实现旧动态结构。按域：Shared States 5；Mask Browser 12；Section 13；Recipe 41；Dialog 8；Mask Drawing 3；Layer Legend 30；Welcome 26；Process 2；History 38；Workstation 25；3D 3。

| # | Legacy class / computed pattern | 域 | 新位置 | 状态 |
| ---: | --- | --- | --- | --- |
| 1 | `active` | Shared States | 所属域状态组件 | M3待映射+实际检查 |
| 2 | `cell-caret` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 3 | `cell-count` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 4 | `cell-name` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 5 | `cell-row` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 6 | `circle` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 7 | `collapse-disabled` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 8 | `compact-btn` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 9 | `compact-hint` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 10 | `compact-select` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 11 | `complete` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 12 | `confirmation-action` | Dialog | Dialog Portal | M3待映射+实际检查 |
| 13 | `confirmation-actions` | Dialog | Dialog Portal | M3待映射+实际检查 |
| 14 | `confirmation-copy` | Dialog | Dialog Portal | M3待映射+实际检查 |
| 15 | `confirmation-detail` | Dialog | Dialog Portal | M3待映射+实际检查 |
| 16 | `confirmation-dialog` | Dialog | Dialog Portal | M3待映射+实际检查 |
| 17 | `confirmation-overlay` | Dialog | Dialog Portal | M3待映射+实际检查 |
| 18 | `danger` | Dialog | Dialog Portal | M3待映射+实际检查 |
| 19 | `dragging` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 20 | `draw-shape-editor-help` | Mask Drawing | Mask视图舞台/浮层 | M3待映射+实际检查 |
| 21 | `draw-shape-editor-row` | Mask Drawing | Mask视图舞台/浮层 | M3待映射+实际检查 |
| 22 | `electrical-hidden` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 23 | `electrical-legend-name` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 24 | `electrical-legend-row` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 25 | `electrical-region-chip` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 26 | `electrical-row-wrap` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 27 | `empty-list` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 28 | `error` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 29 | `failed` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 30 | `has-image` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 31 | `has-project-preview` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 32 | `has-thumbnail` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 33 | `hidden` | Process | Process侧面板 | M3待映射+实际检查 |
| 34 | `hint` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 35 | `history-bookmark-row` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 36 | `history-bookmarks-group` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 37 | `history-bookmarks-list` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 38 | `history-bookmarks-summary` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 39 | `history-legacy-bookmark-list` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 40 | `history-legacy-bookmarks` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 41 | `history-legacy-restore` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 42 | `history-step-row` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 43 | `history-step-wrap` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 44 | `history-tree-root` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 45 | `history-variant` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 46 | `history-variant-body` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 47 | `history-variant-editor` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 48 | `history-variant-head` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 49 | `history-variant-name` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 50 | `history-variant-rename-trigger` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 51 | `history-variant-stats` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 52 | `history-variant-toggle` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 53 | `implant-gradient-chip` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 54 | `implant-hidden` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 55 | `implant-legend-name` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 56 | `implant-legend-row` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 57 | `implant-row-wrap` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 58 | `is-maximized` | Shared States | 所属域状态组件 | M3待映射+实际检查 |
| 59 | `is-restorable` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 60 | `is-unavailable` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 61 | `layer-absent` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 62 | `layer-count` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 63 | `layer-hidden` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 64 | `layer-name` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 65 | `layer-row` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 66 | `layer-swatch` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 67 | `legend-color-chip` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 68 | `legend-head` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 69 | `legend-name` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 70 | `legend-palette-chip` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 71 | `legend-palette-grid` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 72 | `legend-palette-select` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 73 | `legend-profile-editor` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 74 | `legend-profile-label` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 75 | `legend-profile-option` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 76 | `legend-profile-options` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 77 | `legend-profile-trigger` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 78 | `legend-random` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 79 | `legend-row` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 80 | `legend-row-wrap` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 81 | `legend-title` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 82 | `legend-tools` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 83 | `legend-visibility` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 84 | `loading` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 85 | `mini-btn` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 86 | `open` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 87 | `param-field` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 88 | `param-grid-2` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 89 | `plan-pan-active` | Shared States | 所属域状态组件 | M3待映射+实际检查 |
| 90 | `preview` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 91 | `preview-panning` | Shared States | 所属域状态组件 | M3待映射+实际检查 |
| 92 | `primary` | Dialog | Dialog Portal | M3待映射+实际检查 |
| 93 | `process-busy` | Process | Process侧面板 | M3待映射+实际检查 |
| 94 | `process-history-body` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 95 | `process-history-marker` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 96 | `process-history-row` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 97 | `quiet` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 98 | `ready` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 99 | `recipe-add-row` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 100 | `recipe-code-actions` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 101 | `recipe-code-editor` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 102 | `recipe-code-pane` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 103 | `recipe-execution` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 104 | `recipe-history-actions` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 105 | `recipe-mask-context` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 106 | `recipe-name-input` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 107 | `recipe-options-row` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 108 | `recipe-progress` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 109 | `recipe-run-actions` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 110 | `recipe-start-mode` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 111 | `recipe-step-copy` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 112 | `recipe-step-editor` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 113 | `recipe-step-editor-actions` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 114 | `recipe-step-editor-head` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 115 | `recipe-step-num` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 116 | `recipe-step-operation-field` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 117 | `recipe-step-row` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 118 | `recipe-step-state` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 119 | `recipe-step-type-select` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 120 | `recipe-steps-list` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 121 | `recipe-template-actions` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 122 | `recipe-template-preview` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 123 | `recipe-template-preview-steps` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 124 | `recipe-toolbar` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 125 | `recipe-validation` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 126 | `recipe-validation-${…}` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 127 | `recipe-validation-header` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 128 | `recipe-view-mode` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 129 | `recipe-workflow-label` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 130 | `root` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 131 | `running` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 132 | `section-collapse-ruler-tick` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 133 | `section-detail-drawing` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 134 | `section-dock-collapsed` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 135 | `section-editing` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 136 | `segmented` | Recipe | Process > Recipe侧面板 | M3待映射+实际检查 |
| 137 | `selected` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 138 | `snapshot-branch-empty` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 139 | `snapshot-branch-group` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 140 | `snapshot-continuation-banner` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 141 | `snapshot-continuation-context` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 142 | `snapshot-continuation-hint` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 143 | `snapshot-inline-editor` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 144 | `snapshot-milestone-body` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 145 | `snapshot-milestone-marker` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 146 | `snapshot-milestone-row` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 147 | `snapshot-more-menu` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 148 | `snapshot-more-popover` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 149 | `snapshot-more-trigger` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 150 | `snapshot-return-head` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 151 | `snapshot-timeline-row` | History | History侧面板/行菜单 | M3待映射+实际检查 |
| 152 | `three-loading` | 3D | 3D视图 | M3待映射+实际检查 |
| 153 | `three-unavailable` | 3D | 3D视图 | M3待映射+实际检查 |
| 154 | `three-unavailable-card` | 3D | 3D视图 | M3待映射+实际检查 |
| 155 | `unavailable` | Mask Browser | Mask侧面板 | M3待映射+实际检查 |
| 156 | `view-maximized` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 157 | `view-overflow-secondary` | Shared States | 所属域状态组件 | M3待映射+实际检查 |
| 158 | `welcome-example-body` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 159 | `welcome-example-card` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 160 | `welcome-example-image` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 161 | `welcome-example-image-caption` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 162 | `welcome-example-preview-start` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 163 | `welcome-example-project-fallback` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 164 | `welcome-example-project-frame` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 165 | `welcome-example-project-loading` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 166 | `welcome-example-project-preview` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 167 | `welcome-example-project-stage` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 168 | `welcome-example-source-row` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 169 | `welcome-example-sources` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 170 | `welcome-example-summary-link` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 171 | `welcome-example-tag-more` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 172 | `welcome-example-tags` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 173 | `welcome-example-title-link` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 174 | `welcome-example-view-tab` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 175 | `welcome-example-view-tabs` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 176 | `welcome-example-visual` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 177 | `welcome-project-preview` | Welcome | 欢迎页卡片/预览 | M3待映射+实际检查 |
| 178 | `wide` | Mask Drawing | Mask视图舞台/浮层 | M3待映射+实际检查 |
| 179 | `workstation-boot` | Workstation | 顶栏/导航/视图舞台 | M2必须隔离旧guard |
| 180 | `workstation-compact-ui` | Workstation | 顶栏/导航/视图舞台 | M2必须隔离旧guard |
| 181 | `workstation-layout-tab` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 182 | `workstation-legend-open` | Layer Legend | Section #layerLegend | M3待映射+实际检查 |
| 183 | `workstation-rail` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 184 | `workstation-rail-button` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 185 | `workstation-rail-spacer` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 186 | `workstation-section-active` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 187 | `workstation-section-collapse` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 188 | `workstation-section-collapsed` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 189 | `workstation-section-label` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 190 | `workstation-section-layers` | Section | Section工具栏/舞台/浮层 | M3待映射+实际检查 |
| 191 | `workstation-split-view-menu` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 192 | `workstation-split-view-option` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 193 | `workstation-split-view-selector` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 194 | `workstation-tool-close` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 195 | `workstation-tool-flyout` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 196 | `workstation-tool-head` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 197 | `workstation-tool-head-spacer` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 198 | `workstation-tool-position` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 199 | `workstation-tool-scroll-tail` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 200 | `workstation-top-meta` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 201 | `workstation-top-spacer` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 202 | `workstation-ui-v2` | Workstation | 顶栏/导航/视图舞台 | M2必须隔离旧guard |
| 203 | `workstation-view-stage` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 204 | `workstation-view-tab` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 205 | `workstation-view-tabs` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
| 206 | `workstation-viewbar` | Workstation | 顶栏/导航/视图舞台 | M3待映射+实际检查 |
## 差异与限制

- Welcome 卡片在 `index.html` + `welcome.js`，不是 `app.html` 的子树；由 M3 单独验收。
- M0 合约源基点 `fbbb2f9`。当前分支尚未吸收主线的 **Lift-off** 新操作；当前 mock Step/Recipe 枚举亦没有 Lift-off。M3 开始前要做最新 main 的 Process/Recipe 契约差异复核，不在本轮改代码。
- `unresolvedOperations=5` 是抽取器无法静态还原的操作，后续需逐个定位，不可虚称覆盖。
- 原型位置核查和 M2 现存条件以 [PLACEMENT_MAP.md](PLACEMENT_MAP.md) 为准。M2 已报告 1440/1024 mock ROI 对齐 0px，但不等于真实 3D 投影 / 拖动路径的验收。
