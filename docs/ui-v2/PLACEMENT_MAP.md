# UI v2 Placement Map — 审核前不得动代码

> 日期 2026-10-09；目标分支 `codex/ui-v2-m2-handoff-2026-10-09`。基准：[FEATURE_INVENTORY.md](FEATURE_INVENTORY.md)、[CONTRACT.md](CONTRACT.md)、M1.5批准的 `site/ui-v2/prototypes/a-full/`、M2 `site/app-v2.html` / `site/ui-v2/**`。**源码审计；没有重新跑浏览器，也不是功能覆盖证明。** M2=壳/Mock/无均不代表生产控制器已连线。
>
> 列名中的“设计”仅判断 M1.5 原型是否明确画出**该形态**：**有**=对应入口与相近组件，**部分**=概念/入口有而完整参数与状态未设计，**无**=没有明确设计。对“无”的功能，先补一张 M1.5 设计稿再迁移。M2列：**壳**=容器或布局本体，**mock**=M2的 UI draft 演示，**无**=尚未有可维护落点。**X**=当前摆放/形式与 M1.5 或旧功能语义有偏差；**G**=缺乏稳定落点/入口或只是零散临时 UI；**U**=M1.5 形式未设计；**-**=暂未识别布局差异。

## M2.5 结构与 Lift-off 落位更新（2026-10-09）

- 已批准：A 布局不变；Base 作为 `panel.base` 内嵌 Project；Diagnostics 作为 `panel.process.diagnostics`；Nav、View mode 由 `shell-registry.js` 注册表驱动。
- M2.5 新增 `view.{main,mask,three,section}.{header,actions,stage,readout,overlays}` 以及通用 Popover/Dialog/Toast、Status 具名容器。四个真实 canvas host 的 identity 尚未完成浏览器实测；仅靠源码不能移除该验收项。
- 主线新增的 **Lift-off Step**：Process 面板 `Operation=Lift-off` → `Sacrificial layer` 下拉，不要求 thickness，包含无可用 sacrificial 层时的 disabled/hint 状态；Recipe `Add kind=liftoff` → `params.sacrificial` 编辑与验证。这两项 M1.5 需补对应设计，但本阶段**不补原型**。当前 M2 mock 仅补入口与层选择，M3 才接 geometry/worker/replay。
- 主线新增 **Geometry Diagnostics**：Process 子域 `Diagnostics`，包含 Analyze、只读 summary / metrics / Materials / Findings / partial/stale/error；M2.5 只提供稳定插槽，不预接核心。
- 原 258 行的 G/X/U 是 M2 审计快照，现应以“代码在 M2.5 已放置具名宿主；尚待节点 identity 运行时验证”为附加状态，不覆盖 M3 真实内容未完成的标记。

## 使用与决策

- 每个功能独立一行；跨位置的功能在“区域”列写出全部承载区域。一级区域词汇限定为**顶栏、导航栏、侧面板、视图工具栏、视图舞台、浮层、状态栏**。
- A/B/C/D 验收以 FEATURE_INVENTORY 的定义执行。M2 只对壳布局、通用行为负责，含有模拟值不能被误判为 M3 接通。
- 当前批准 A 布局为**Project / Mask / Process / History 四个一级导航**，Process 内有 Manual/Recipe/Code。用户同时要求五个面板容器，建议 **Project.Base** 为二级具名插槽；避免擅自升级为第五个一级入口。
- Main/3D 1.7857px ROI 偏移严格检测（建议上/下边 delta ≤0.25px）；旧 M2 报告 1440/1024 mock = 0px，需在 768/390 核对可达性，真实 M3 renderer 再测指针路径和几何。
- Legacy `workstation-ui-v2` CSS guard 与新 `html[data-ui="v2"]` 互不继承；当前 v2 只加载 tokens/components/workstation-v2 CSS，legacy 动态类由 M3 映射、不可只复制类名。

## 逐功能落位

共 **258 行（原 M2 基准；三条增量已在行内更新，汇总计数需以重新完整审计为准）**；原始差异标记统计：X=68、-=110、G=70、U=10。同一域中多条“无”只说明当前 mock 尚缺入口或稳定宿主，**不得直接解释成计划删减功能**。

| ID | 功能 | 所属域 | 区域 | 目标组件/插槽 | 显示条件 | M1.5设计 | 当前 M2 | 标记 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F001 | WaferCAD 品牌 / 返回首页 | Global / Workstation | 顶栏 | `Brand link` | 常驻 | 有 | 壳，品牌非链接 | X |
| F002 | 项目名称 | Global / Workstation | 顶栏 | `Project title` | 有项目时 | 有 | 壳，mock | - |
| F003 | Overview 模式 | Global / Workstation | 顶栏 | `View mode tab` | 桌面 | 有 | 壳 | - |
| F004 | Main 单视图 | Global / Workstation | 顶栏 | `View tab` | 常驻 | 有 | 壳 | - |
| F005 | Mask 单视图 | Global / Workstation | 顶栏 | `View tab` | 常驻 | 有 | 壳 | - |
| F006 | 3D 单视图 | Global / Workstation | 顶栏 | `View tab` | 常驻 | 有 | 壳 | - |
| F007 | Split 模式 | Global / Workstation | 顶栏 | `View mode tab` | 桌面 | 有 | 壳 | - |
| F008 | Split 左侧视图选择 | Global / Workstation | 视图工具栏 | `View slot select` | Split时 | 有 | 壳/mocked | - |
| F009 | Split 右侧视图选择 | Global / Workstation | 视图工具栏 | `View slot select` | Split时 | 有 | 壳/mocked | - |
| F010 | 视图模式 sessionStorage 记忆 | Global / Workstation | 顶栏 | `ViewState service` | 切换后 | 有 | 壳 | - |
| F011 | 导航 Project | Global / Workstation | 导航栏 | `Domain nav item` | 常驻 | 有 | 壳 | - |
| F012 | 导航 Mask | Global / Workstation | 导航栏 | `Domain nav item` | 常驻 | 有 | 壳 | - |
| F013 | 导航 Process | Global / Workstation | 导航栏 | `Domain nav item` | 常驻 | 有 | 壳 | - |
| F014 | 导航 History | Global / Workstation | 导航栏 | `Domain nav item` | 常驻 | 有 | 壳 | - |
| F015 | Base 域具名子容器 | Global / Workstation | 侧面板 | `Project.Base slot` | Project 打开 | 部分 | 无 | G |
| F016 | 面板 Hide / Restore | Global / Workstation | 导航栏+顶栏 | `Dock collapse / restore` | 面板隐藏时还原 | 有 | 壳 | - |
| F017 | 面板拖动调整宽高 | Global / Workstation | 侧面板 | `Resize separator` | 桌面/平板 | 有 | 壳 | - |
| F018 | 移动端 Edit/Results 切换 | Global / Workstation | 顶栏 | `Compact flow actions` | 小于等于820px | 有 | 壳 | - |
| F019 | Section Hide / Show | Global / Workstation | 顶栏 | `Section dock toggle` | 非紧凑视图 | 有 | 壳 | - |
| F020 | Section 紧凑屏 Layers | Global / Workstation | 视图工具栏 | `Legend toggle` | 紧凑且Section可用 | 有 | mock入口 | - |
| F021 | 视图舞台区域 | Global / Workstation | 视图舞台 | `Stage grid` | 所有模式 | 有 | 壳 | - |
| F022 | 四窗 Max/Restore | Global / Workstation | 视图工具栏 | `Maximize action` | 视图可见 | 有 | 壳/mocked | - |
| F023 | 顶部导航一致性 | Global / Workstation | 顶栏 | `View navigation shell` | 始终 | 有 | 壳 | - |
| F024 | 视图标题 | 共享 View Panel | 视图工具栏 | `Shared PanelHeader` | 四视图 | 有 | Mock里统一 | X |
| F025 | 通用 Fit | 共享 View Panel | 视图工具栏 | `Shared Toolbar.fit slot` | 视图可用 | 有 | mock控制器 | X |
| F026 | 通用 More | 共享 View Panel | 视图工具栏 | `Shared Toolbar.more` | 视图可用 | 有 | 组件壳 | - |
| F027 | 通用 Max | 共享 View Panel | 视图工具栏 | `Shared Toolbar.max` | 视图可用 | 有 | mock控制器 | X |
| F028 | 通用 Readout | 共享 View Panel | 视图舞台 | `Shared Readout` | 视图可用 | 有 | mock控制器 | X |
| F029 | 专属具名工具栏插槽 | 共享 View Panel | 视图工具栏 | `ViewActions[view]` | 每个视图 | 有 | 无通用注册表 | G |
| F030 | 科学画布稳定挂载点 | 共享 View Panel | 视图舞台 | `CanvasHost[view]` | 四视图 | 有 | 壳，但子节点会替换 | X |
| F031 | 全局 Popover 宿主 | 共享 View Panel | 浮层 | `Popover portal` | 按需 | 有 | 只有More局部实现 | G |
| F032 | 全局 Dialog 宿主 | 共享 View Panel | 浮层 | `Dialog portal` | 按需 | 有 | mock自行创建 | G |
| F033 | 全局 Toast 宿主 | 共享 View Panel | 浮层 | `Toast portal` | 按需 | 部分 | 无 | G |
| F034 | Main face 标签 | Main | 视图工具栏 | `Surface label` | 面切换后 | 有 | 无 | G |
| F035 | Slice 入口 | Main | 视图工具栏 | `Slice action` | Main展示 | 有 | more中Section line mock | X |
| F036 | A/B 坐标 X/Y | Main | 浮层 | `Slice coordinate fields` | Slice展开 | 有 | 设置Dialog mock | X |
| F037 | A/B 端点拖动 | Main | 视图舞台 | `Slice handles` | Slice激活 | 部分 | 无真实handles | G |
| F038 | 3D ROI 入口 | Main | 视图工具栏 | `ROI action` | Main展示 | 有 | mock | - |
| F039 | ROI Rect/Circle/Sector | Main | 浮层 | `ROI shape picker` | ROI激活 | 部分 | mock缺Sector | U |
| F040 | ROI 宽高/半径 | Main | 浮层 | `ROI fields` | 按shape | 有 | mock | X |
| F041 | ROI Start/End angle | Main | 浮层 | `ROI sector angle` | Sector | 无 | 无 | U |
| F042 | ROI reference/position | Main | 浮层 | `ROI anchor XY` | ROI编辑 | 部分 | mock | X |
| F043 | ROI Clear | Main | 浮层 | `ROI Clear action` | ROI存在 | 有 | mock | - |
| F044 | Pan | Main | 视图工具栏 | `View Pan action` | Main展示 | 有 | mock | - |
| F045 | Fit | Main | 视图工具栏 | `Shared Fit` | Main展示 | 有 | mock | - |
| F046 | Zoom + / - | Main | 视图工具栏 | `Shared zoom controls` | More/专属 | 有 | mock泛化Zoom | X |
| F047 | Main SVG Export | Main | 浮层 | `Export SVG menu item` | More打开 | 有 | mock下载 | - |
| F048 | Main canvas / readout | Main | 视图舞台 | `CanvasHost / Readout` | 常驻 | 有 | mock SVG | - |
| F049 | Mask 当前 Cell 标签 | Mask View / Draw | 视图工具栏 | `Cell label` | 文件/Draw状态 | 有 | 无独立label | G |
| F050 | File / Draw source | Mask View / Draw | 视图工具栏 | `Source select` | Mask可见 | 有 | 侧面板和画布mock | X |
| F051 | Mask ROI Square/Circle/Clear | Mask View / Draw | 视图工具栏+浮层 | `Mask ROI tools` | 任意source | 有 | mock | - |
| F052 | Mask ROI Size/Radius/Rotation | Mask View / Draw | 浮层 | `Mask ROI fields` | 按shape | 有 | mock通用ROI | X |
| F053 | Mask ROI reference/X/Y | Mask View / Draw | 浮层 | `Mask ROI position` | Mask ROI启用 | 有 | mock | X |
| F054 | Mask opacity | Mask View / Draw | 浮层 | `Opacity slider` | Display展开 | 有 | mock设置区 | X |
| F055 | Mask Fit / Zoom | Mask View / Draw | 视图工具栏 | `Fit/Zoom` | Mask可见 | 有 | mock | - |
| F056 | Mask canvas/readout | Mask View / Draw | 视图舞台 | `Mask CanvasHost` | Mask可见 | 有 | mock SVG | - |
| F057 | Draw Select | Mask View / Draw | 视图舞台 | `Draw toolbar tool` | source=Draw | 有 | mock | - |
| F058 | Draw Rect | Mask View / Draw | 视图舞台 | `Draw toolbar tool` | source=Draw | 有 | mock | - |
| F059 | Draw Circle | Mask View / Draw | 视图舞台 | `Draw toolbar tool` | source=Draw | 有 | mock | - |
| F060 | Draw Polygon | Mask View / Draw | 视图舞台 | `Draw toolbar tool` | source=Draw | 有 | mock | - |
| F061 | Draw Ring | Mask View / Draw | 视图舞台 | `Draw toolbar tool` | source=Draw | 有 | mock | - |
| F062 | Draw Ring Sector | Mask View / Draw | 视图舞台 | `Draw toolbar tool` | source=Draw | 有 | mock | - |
| F063 | Draw Delete/Clear | Mask View / Draw | 视图舞台 | `Draw toolbar actions` | 可删时 | 有 | mock | - |
| F064 | Draw Shape Editor 各类型参数 | Mask View / Draw | 浮层 | `Shape editor portal` | 选中shape | 部分 | 无真实参数编辑器 | G |
| F065 | Draw shape 数量提示 | Mask View / Draw | 视图舞台 | `Draw hint` | source=Draw | 部分 | mock | - |
| F066 | Mask export Cells 多选 | Mask View / Draw | 浮层 | `Export scope.cells` | File/Export打开 | 有 | mock不等价 | X |
| F067 | Mask export Layers 多选 | Mask View / Draw | 浮层 | `Export scope.layers` | File/Export打开 | 有 | mock不等价 | X |
| F068 | Mask Export SVG | Mask View / Draw | 浮层 | `Export menu item` | More打开 | 有 | mock | - |
| F069 | Mask Export GDS | Mask View / Draw | 浮层 | `Export menu item` | More打开 | 有 | mock | - |
| F070 | Mask Export OAS | Mask View / Draw | 浮层 | `Export menu item` | More打开 | 有 | mock | - |
| F071 | Fast / Quality | 3D View | 视图工具栏 | `Render quality select` | 3D可见 | 有 | mock按钮 | X |
| F072 | 3D Border | 3D View | 浮层 | `Display checkbox` | Display打开 | 有 | mock Dialog | X |
| F073 | 3D Opacity | 3D View | 浮层 | `Display slider` | Display打开 | 有 | mock Dialog | X |
| F074 | 3D Fit | 3D View | 视图工具栏 | `Fit action` | 3D可见 | 有 | mock | - |
| F075 | 3D Max | 3D View | 视图工具栏 | `Max action` | 3D可见 | 有 | mock | - |
| F076 | 3D Export GLB | 3D View | 浮层 | `GLB export` | More打开 | 有 | mock | - |
| F077 | 3D Export PNG 3× | 3D View | 浮层 | `PNG export` | More打开 | 有 | mock PNG非3× | X |
| F078 | Cancel GLB | 3D View | 浮层 | `Abort export action` | 导出中 | 部分 | mock disabled | X |
| F079 | 3D stats / readout | 3D View | 视图舞台 | `3D readout` | 有模型 | 有 | mock | - |
| F080 | 3D canvas | 3D View | 视图舞台 | `RendererHost three` | 有模型 | 有 | 最终缩略图mock | - |
| F081 | 3D Loading / Unavailable | 3D View | 视图舞台 | `Renderer fallback` | 加载/失败时 | 部分 | 无 | G |
| F082 | Section A–B 标题/元数据 | Section | 视图工具栏 | `Section title/readout` | 可见时 | 有 | 壳/mocked | - |
| F083 | Scale Auto / 1:1 | Section | 视图工具栏 | `Scale select` | Section可见 | 有 | 设置Dialog mock | X |
| F084 | Z Break 入口 | Section | 视图工具栏 | `Z Break button` | Section可见 | 有 | mock | - |
| F085 | Z Break Enable | Section | 浮层 | `Z Break toggle` | 编辑器打开 | 有 | mock | X |
| F086 | Z Break 上下界数字输入 | Section | 浮层 | `Boundary fields` | Z Break展开 | 有 | mock | X |
| F087 | Z Break 上下界拖动 handles | Section | 视图舞台+浮层 | `Ruler handles` | Z Break展开 | 有 | 无 | G |
| F088 | Z Break snap to layer | Section | 浮层 | `Snap checkbox` | Z Break展开 | 部分 | 无 | G |
| F089 | Z Break Front/Back scale | Section | 浮层 | `Scale fields` | Advanced展开 | 有 | mock | X |
| F090 | Z Break equal scale | Section | 浮层 | `Linked scale checkbox` | Advanced展开 | 有 | 无 | G |
| F091 | Section Border | Section | 浮层 | `Display button` | Display展开 | 有 | mock Dialog | X |
| F092 | Section A/B readout | Section | 视图舞台 | `Readout` | Section可见 | 有 | mock | - |
| F093 | Detail ROI 入口 | Section | 浮层 | `Detail ROI action` | More展开 | 有 | mock | X |
| F094 | Detail ROI 四角 handles | Section | 视图舞台 | `ROI resize handles` | ROI选择中 | 有 | 无 | G |
| F095 | Detail magnifier inset | Section | 视图舞台 | `Inset CanvasHost` | 有ROI | 有 | 无 | G |
| F096 | Detail shape square/circle | Section | 视图舞台 | `Inset shape toggle` | Inset显示 | 部分 | 无 | G |
| F097 | Detail zoom/drag/close | Section | 视图舞台 | `Inset toolbar` | Inset显示 | 有 | mock仅设置 | X |
| F098 | Section SVG Export | Section | 浮层 | `Export SVG` | More打开 | 有 | mock | - |
| F099 | Section Max | Section | 视图工具栏 | `Max` | Section可见 | 有 | mock | - |
| F100 | Section Legend 折叠 | Section | 视图工具栏 | `Layers action` | 窄屏/legend可见 | 有 | mock | - |
| F101 | Section Legend 容器尺寸 | Section | 视图舞台 | `#layerLegend dock` | Section可见 | 有 | mock宿主 | - |
| F102 | Base 编辑入口 | Base | 侧面板 | `Project.Base slot` | Project打开 | 部分 | 只有Rebuild按钮 | G |
| F103 | Rectangle / Circle | Base | 侧面板 | `Shape segmented` | Base编辑时 | 部分 | 无 | G |
| F104 | Width W | Base | 侧面板 | `Length field` | Base编辑时 | 部分 | 无 | G |
| F105 | Height H | Base | 侧面板 | `Length field` | Rectangle | 部分 | 无 | G |
| F106 | Thickness Z | Base | 侧面板 | `Length field` | Base编辑时 | 部分 | 无 | G |
| F107 | Apply base | Base | 侧面板 | `Base apply` | Base编辑时 | 部分 | mock Rebuild | G |
| F108 | Revert base | Base | 侧面板 | `Base revert` | 已改Base时 | 无 | 无 | U |
| F109 | Keep / Clear 历史确认 | Base | 浮层 | `Base rebuild confirm` | 已有History | 有 | mock | - |
| F110 | Import GDS/GDSII/OAS/OASIS | Mask Browser | 侧面板 | `Layout import` | File模式 | 有 | mock Inspect sample | X |
| F111 | KLayout samples select | Mask Browser | 侧面板 | `Sample select` | File模式 | 部分 | 无对应select | G |
| F112 | Cells tree root | Mask Browser | 侧面板 | `#cellTree host` | 文件已载入 | 有 | mock树，无稳定ID | X |
| F113 | Cell caret展开/折叠 | Mask Browser | 侧面板 | `Tree item caret` | 有子cell | 有 | mock递归但无相同操作 | X |
| F114 | Cell name选择 | Mask Browser | 侧面板 | `Tree item action` | 已载入 | 有 | mock | - |
| F115 | Cell instance count | Mask Browser | 侧面板 | `Tree item badge` | 子实例存在 | 部分 | mock shapeCount | X |
| F116 | Layers list | Mask Browser | 侧面板 | `#maskLayerList host` | 文件已载入 | 有 | mock，无稳定ID | X |
| F117 | Layer/Datatype checkbox | Mask Browser | 侧面板 | `Layer checkbox` | File模式 | 有 | mock | - |
| F118 | Layer hover/disabled | Mask Browser | 侧面板 | `Layer hover state` | 选中scope影响 | 部分 | 无 | G |
| F119 | Alignment X/Y/S/R | Mask Browser | 浮层 | `Mask Alignment` | 文件模式/设置 | 有 | mock Dialog，与侧面板原型待核 | X |
| F120 | Mask no-file empty state | Mask Browser | 侧面板 | `EmptyState` | 未载入文件 | 有 | mock | - |
| F121 | Process Manual/Recipe/Diagnostics 模式 | Process / Step | 侧面板 | `Submode tabs` | Process打开 | 部分 | Manual/Recipe/Code，无Diagnostics | G |
| F122 | Deposit | Process / Step | 侧面板 | `Operation option` | Step模式 | 有 | mock | - |
| F123 | Extend | Process / Step | 侧面板 | `Operation option` | Step模式 | 有 | mock | - |
| F124 | Etch | Process / Step | 侧面板 | `Operation option` | Step模式 | 有 | mock | - |
| F125 | Implant | Process / Step | 侧面板 | `Operation option` | Step模式 | 有 | mock | - |
| F126 | Electrical | Process / Step | 侧面板 | `Operation option` | Step模式 | 有 | mock | - |
| F127 | Record | Process / Step | 侧面板 | `Operation option` | Step模式 | 有 | mock | - |
| F128 | Lift-off (main新增) | Process / Step | 侧面板 | `Operation option` | Step模式 | 无 | mock 选项 / sacrificial 选择 | U |
| F129 | Front/Back face | Process / Step | 侧面板 | `Face select` | 材料操作 | 有 | mock Rear标签不一致 | X |
| F130 | Selected/Invert/Whole face | Process / Step | 侧面板 | `Area select` | 适用操作 | 有 | mock area不等价 | X |
| F131 | Material / Target layer | Process / Step | 侧面板 | `Material select` | Deposit/Extend/Etch | 有 | mock | - |
| F132 | Layer Name | Process / Step | 侧面板 | `Text field` | Deposit | 有 | mock不完整 | X |
| F133 | Thickness / Depth | Process / Step | 侧面板 | `Length field` | 适用操作 | 有 | mock | - |
| F134 | Coverage Directional/Conformal | Process / Step | 侧面板 | `Coverage select` | Deposit/Extend | 有 | mock | - |
| F135 | Transfer / Laminate | Process / Step | 侧面板 | `Coverage option` | Deposit | 无 | 无 | U |
| F136 | Transfer Placement Follow/Flat | Process / Step | 侧面板 | `Placement select` | Transfer | 部分 | mock挂在Extend下 | X |
| F137 | Etch Directional | Process / Step | 侧面板 | `Profile select` | Etch | 有 | mock | - |
| F138 | Etch Isotropic | Process / Step | 侧面板 | `Profile select` | Etch | 有 | mock | - |
| F139 | Etch Planarize/CMP | Process / Step | 侧面板 | `Profile select` | Etch | 无 | 无 | U |
| F140 | Etch Undercut | Process / Step | 侧面板 | `Profile select` | Etch | 无 | 无 | U |
| F141 | Etch material-selective target | Process / Step | 侧面板 | `Target select` | Etch | 部分 | mock泛化材料 | X |
| F142 | Surface Smooth/Rough/Pyramid | Process / Step | 侧面板 | `Surface select` | Directional Etch | 有 | mock | - |
| F143 | Rough Feature XY/CV | Process / Step | 侧面板 | `Rough fields` | textured Etch | 部分 | 无完整字段 | G |
| F144 | Rough Height/CV | Process / Step | 侧面板 | `Rough fields` | textured Etch | 部分 | 无完整字段 | G |
| F145 | Rough Orientation/Seed | Process / Step | 侧面板 | `Rough fields` | textured Etch | 部分 | 无 | G |
| F146 | Implant Tilt/Depth/Name | Process / Step | 侧面板 | `Implant fields` | Implant | 有 | mock | - |
| F147 | Electrical Type/Source/Depth | Process / Step | 侧面板 | `Electrical fields` | Electrical | 有 | mock | - |
| F148 | Record Process/Temp/Time/Ambient/Note | Process / Step | 侧面板 | `Record metadata` | Record | 部分 | mock不全 | X |
| F149 | Also add to Recipe | Process / Step | 侧面板 | `Checkbox` | Step模式 | 无 | 无 | U |
| F150 | Apply | Process / Step | 侧面板 | `Primary apply action` | Step模式 | 有 | mock simulate | - |
| F151 | Undo/Redo (manual) | Process / Step | 侧面板 | `Step history actions` | Apply下方 | 有 | mock | - |
| F152 | Process visual guide before/after | Process / Step | 侧面板 | `Guide expander` | 选操作时 | 无 | 无 | U |
| F153 | Process guide Wiki link | Process / Step | 侧面板 | `External link` | Guide打开 | 无 | 无 | U |
| F154 | Recipe name | Recipe | 侧面板 | `Recipe text field` | Recipe模式 | 有 | mock | - |
| F155 | Recipe Template select | Recipe | 侧面板 | `Template picker` | Recipe模式 | 有 | mock | - |
| F156 | Template preview/替换确认 | Recipe | 浮层 | `Template modal` | 选模板 | 有 | mock | - |
| F157 | Steps / Code switch | Recipe | 侧面板 | `Recipe submode` | Recipe模式 | 有 | Code独立domain mock | X |
| F158 | Recipe Undo/Redo | Recipe | 侧面板 | `Recipe history actions` | Recipe模式 | 有 | mock | - |
| F159 | Add kind 7种 | Recipe | 侧面板 | `Step kind select` | Recipe模式 | 有 | mock | - |
| F160 | Add Step | Recipe | 侧面板 | `Add action` | Recipe模式 | 有 | mock | - |
| F161 | Step 行编号与摘要 | Recipe | 侧面板 | `StepRow` | 有steps | 有 | mock | - |
| F162 | Step 完成/失败/未运行状态 | Recipe | 侧面板 | `StepState` | 执行后 | 有 | mock | - |
| F163 | Step 选择 | Recipe | 侧面板 | `Selected step state` | 有steps | 有 | mock | - |
| F164 | Step operation change | Recipe | 侧面板 | `Step editor select` | 选中step | 有 | mock | - |
| F165 | Move Up/Down | Recipe | 侧面板 | `Step editor actions` | 选中step | 有 | mock | - |
| F166 | Copy/Delete step | Recipe | 侧面板 | `Step editor actions` | 选中step | 有 | mock | - |
| F167 | Step Face/Area/Target/Length | Recipe | 侧面板 | `Step parameter fields` | 适用step | 有 | mock部分 | X |
| F168 | Step Rough/Implant/Electrical/Record fields | Recipe | 侧面板 | `Conditional step editor` | 按step类型 | 部分 | mock部分 | X |
| F169 | Captured Mask summary | Recipe | 侧面板 | `Mask context` | area=mask/invert | 部分 | 无稳定host | G |
| F170 | Use current Mask | Recipe | 侧面板 | `Mask capture action` | mask类step | 部分 | 无 | G |
| F171 | Code textarea | Recipe | 侧面板 | `Code editor` | Code模式 | 有 | mock | - |
| F172 | Apply code / Format | Recipe | 侧面板 | `Code actions` | Code模式 | 有 | mock | - |
| F173 | Validate/errors/warnings | Recipe | 侧面板 | `Validation report` | 按需 | 有 | mock | - |
| F174 | Run Start Continue/Rebuild | Recipe | 侧面板 | `Run mode select` | Recipe模式 | 有 | mock buttons形式 | X |
| F175 | Run to Step | Recipe | 侧面板 | `RunTo action` | 选中step | 有 | mock | - |
| F176 | Run All | Recipe | 侧面板 | `RunAll primary action` | Recipe模式 | 有 | mock | - |
| F177 | Stop | Recipe | 侧面板 | `Stop action` | 运行中 | 有 | mock取消 | X |
| F178 | Progress/count/Bar | Recipe | 侧面板 | `Progress block` | 执行中 | 有 | mock | - |
| F179 | Run Summary/失败定位 | Recipe | 侧面板 | `Run status` | 完成/失败 | 有 | mock | - |
| F180 | Recipe Lift-off step | Recipe | 侧面板 | `Operation select` | Recipe模式 | 无 | mock 选项 / sacrificial 字段 | U |
| F181 | Diagnostics 入口 | Diagnostics | 侧面板 | `Process.Diagnostics tab` | Process模式 | 无 | 壳/命名子槽与mock占位 | - |
| F182 | Analyze geometry | Diagnostics | 侧面板 | `Analyze action` | Diagnostics模式 | 无 | 无 | G |
| F183 | 状态:未运行/正在运行/完成/过期 | Diagnostics | 侧面板 | `Status text` | 按状态 | 无 | 无 | G |
| F184 | Errors/warnings/Z gaps | Diagnostics | 侧面板 | `Summary row` | 分析完成 | 无 | 无 | G |
| F185 | Material volume/Regions/Array instances | Diagnostics | 侧面板 | `Metrics grid` | 分析完成 | 无 | 无 | G |
| F186 | Gap volume/XY voids/slits/Appearances | Diagnostics | 侧面板 | `Metrics grid` | 分析完成 | 无 | 无 | G |
| F187 | Materials 行/厚度范围 | Diagnostics | 侧面板 | `Material list` | 分析完成 | 无 | 无 | G |
| F188 | Findings/位置/次数 | Diagnostics | 侧面板 | `Finding list` | 有问题 | 无 | 无 | G |
| F189 | Partial scan/omitted/stale 警告 | Diagnostics | 侧面板 | `Caution text` | 分析不完整 | 无 | 无 | G |
| F190 | History 容器及独立滚动 | History / Variants | 侧面板 | `#snapshotList / scroll host` | History打开 | 有 | mock但无稳定ID | X |
| F191 | Variant 树递归及起点 | History / Variants | 侧面板 | `VariantTree` | History有节点 | 有 | mock | - |
| F192 | Variant 展开/折叠 | History / Variants | 侧面板 | `Variant toggle` | 有子节点 | 有 | mock | - |
| F193 | Variant 名称及 step count | History / Variants | 侧面板 | `VariantHeader` | 有分支 | 有 | mock | - |
| F194 | 切换 Variant HEAD | History / Variants | 侧面板 | `Switch action` | 分支可恢复 | 有 | mock | - |
| F195 | Variant Rename 双击/按钮 | History / Variants | 侧面板 | `Inline rename` | 可编辑 | 有 | mock有限 | X |
| F196 | Delete Variant | History / Variants | 浮层 | `Variant action/Confirm` | 非main/无依赖时 | 有 | mock有限 | X |
| F197 | Step marker/名称/meta | History / Variants | 侧面板 | `StepRow` | 有steps | 有 | mock | - |
| F198 | Step HEAD/cursor 区分 | History / Variants | 侧面板 | `Step status` | 按当前游标 | 有 | mock | - |
| F199 | Step restore | History / Variants | 侧面板 | `Step row action` | 有checkpoint | 有 | mock | - |
| F200 | Legacy unavailable step | History / Variants | 侧面板 | `Disabled step` | 无checkpoint | 部分 | 无完整状态 | G |
| F201 | Step ⋯菜单 | History / Variants | 浮层 | `Step action menu` | 有steps | 有 | mock | - |
| F202 | Edit Step | History / Variants | 浮层 | `Step action item` | 可replay | 有 | mock | - |
| F203 | Insert before | History / Variants | 浮层 | `Step action item` | 有前驱 | 部分 | 无 | G |
| F204 | Continue from here | History / Variants | 浮层 | `Step action item` | 非HEAD可恢复 | 有 | mock恢复分支非等价 | X |
| F205 | New Variant from here | History / Variants | 浮层 | `Step action item` | 可恢复 | 有 | mock | - |
| F206 | Delete last Step | History / Variants | 浮层 | `Step action item` | HEAD可删 | 部分 | 无 | G |
| F207 | Add bookmark | History / Variants | 浮层 | `Step action item` | 可恢复 | 部分 | 无 | G |
| F208 | Bookmark 子组展开 | History / Variants | 侧面板 | `Bookmark list/details` | 有书签 | 有 | mock总列表非嵌套 | X |
| F209 | Bookmark Rename/Delete | History / Variants | 浮层 | `Bookmark actions` | 有书签 | 部分 | 无 | G |
| F210 | Legacy bookmark Restore | History / Variants | 侧面板 | `Legacy restore` | legacy bookmark | 无 | 无 | U |
| F211 | Historical edit/insert Banner | History / Variants | 侧面板 | `Continuation context` | 浏览旧step | 有 | mock有限 | X |
| F212 | Return to HEAD/Cancel edit/insert | History / Variants | 侧面板 | `Context action` | 历史编辑中 | 有 | mock不等价 | X |
| F213 | #layerLegend 宿主/滚动 | Layer Legend | 视图舞台 | `Legend dock` | Section可见 | 有 | mock且硬编码 | X |
| F214 | 宽屏侧排/窄屏折叠 | Layer Legend | 视图舞台+视图工具栏 | `Legend responsive layout` | 1440/1024/768/390 | 有 | 壳/mocked | - |
| F215 | Layers 标题 | Layer Legend | 视图舞台 | `Legend header` | 有材料 | 有 | mock | - |
| F216 | 全局 Balanced/Airy/Warm/Cool | Layer Legend | 视图舞台 | `Palette select` | Legend打开 | 部分 | 无，当前单行色板 | G |
| F217 | 全局 Random palette | Layer Legend | 视图舞台 | `Palette random action` | Legend打开 | 部分 | 仅行random mock | X |
| F218 | Material 颜色/重命名 | Layer Legend | 视图舞台 | `Material row` | 有层 | 有 | mock颜色/纯文本名 | X |
| F219 | Material Visible | Layer Legend | 视图舞台 | `Visibility checkbox` | 有层 | 有 | mock仅显示 | X |
| F220 | Material 缺失/不可用状态 | Layer Legend | 视图舞台 | `Disabled material row` | 无材料 | 部分 | 无 | G |
| F221 | Implant gradient/Name/Visible | Layer Legend | 视图舞台 | `Implant row` | 有implant | 有 | mock只读 | X |
| F222 | Electrical color/Name/Visible | Layer Legend | 视图舞台 | `Electrical row` | 有Electrical | 有 | mock只读 | X |
| F223 | Depth profile Smooth/Follow offset | Layer Legend | 浮层 | `Depth-profile popover` | Implant/Electrical | 部分 | 无 | G |
| F224 | 单行预制 Palette/Random color | Layer Legend | 浮层 | `Palette popover` | 选择颜色时 | 有 | mock | - |
| F225 | Project Name | Project / Recovery | 侧面板 | `Text field` | Project打开 | 有 | mock | - |
| F226 | New project | Project / Recovery | 侧面板 | `New action` | Project打开 | 有 | mock | - |
| F227 | Open .wafercad/.json | Project / Recovery | 侧面板 | `File input` | Project打开 | 有 | mock Load入口，非文件 | X |
| F228 | Local Save checkpoint | Project / Recovery | 侧面板 | `Save action` | Project打开 | 有 | mock Save UI draft | X |
| F229 | Export .wafercad | Project / Recovery | 侧面板 | `Export action` | Project打开 | 有 | mock Export UI draft | X |
| F230 | Recovery checkpoint select | Project / Recovery | 侧面板 | `Recovery select` | 有恢复点 | 有 | mock无真实select | X |
| F231 | Restore recovery | Project / Recovery | 侧面板 | `Restore action` | 可写入+选恢复点 | 有 | mock Review recovery | X |
| F232 | Clear recovery | Project / Recovery | 侧面板 | `Clear action` | 可写入+有恢复点 | 部分 | 无 | G |
| F233 | XYZ nm/µm/mm | Project / Recovery | 侧面板 | `Unit select` | Project打开 | 有 | mock | - |
| F234 | Project autosave owner状态 | Project / Recovery | 状态栏 | `Autosave owner` | 已装载 | 部分 | 无 | G |
| F235 | Global status text/等级 | Status / Dialogs | 状态栏 | `Status text` | 持续 | 有 | 壳mock消息 | - |
| F236 | Autosave Unsaved/Saving/Saved | Status / Dialogs | 状态栏 | `Save state` | 业务变更时 | 部分 | 无真实内容 | G |
| F237 | Autosave paused/conflict | Status / Dialogs | 状态栏 | `Save state warning` | 他端占用 | 部分 | 无 | G |
| F238 | Safe Reload | Status / Dialogs | 状态栏 | `Reload action` | 有更新时 | 部分 | 无 | G |
| F239 | GitHub/commit link | Status / Dialogs | 状态栏 | `Version links` | 常驻 | 部分 | 无 | G |
| F240 | Process Task elapsed/stage | Status / Dialogs | 浮层 | `Task dialog` | Worker执行中 | 有 | mock进度内嵌侧面板 | X |
| F241 | Process Task Abort | Status / Dialogs | 浮层 | `Abort action` | 可中止时 | 有 | mock Cancel按钮 | X |
| F242 | Conflict dialog/Take over | Status / Dialogs | 浮层 | `Conflict dialog` | 非writer tab | 有 | 无 | G |
| F243 | Confirmation title/message/detail | Status / Dialogs | 浮层 | `Confirmation dialog` | 危险/替换操作 | 有 | mock局部 | X |
| F244 | Confirmation actions (danger/cancel) | Status / Dialogs | 浮层 | `Dialog actions` | 弹窗打开 | 有 | mock局部 | X |
| F245 | Popover Esc/外部点击/焦点归还 | Status / Dialogs | 浮层 | `Popover manager` | Popover展示 | 有 | More局部 | G |
| F246 | Dialog Esc/焦点Trap/返回 | Status / Dialogs | 浮层 | `Dialog manager` | Dialog展示 | 有 | mock局部 | G |
| F247 | Toast 宿主及生命周期 | Status / Dialogs | 浮层 | `Toast manager` | 事件发生 | 部分 | 无 | G |
| F248 | Boot/startup failure | Status / Dialogs | 浮层+状态栏 | `Startup fallback` | 启动失败 | 部分 | 无 | G |
| F249 | Start empty | Welcome（M3后置） | 顶栏 | `Welcome launch link` | 欢迎页 | 有 | 仅mock入口无产品跳转 | G |
| F250 | Open example | Welcome（M3后置） | 浮层 | `Welcome example CTA` | 欢迎页 | 有 | 无 | G |
| F251 | Import GDS/OAS | Welcome（M3后置） | 浮层 | `Welcome file input` | 欢迎页 | 有 | 无 | G |
| F252 | Open WaferCAD project | Welcome（M3后置） | 浮层 | `Welcome project input` | 欢迎页 | 有 | 无 | G |
| F253 | 7 example cards | Welcome（M3后置） | 视图舞台 | `ExampleCard grid` | 欢迎页 | 有 | 无 | G |
| F254 | Main/Mask/3D/Section preview tabs | Welcome（M3后置） | 视图工具栏 | `Example preview tabs` | 每个project card | 有 | 无 | G |
| F255 | Explore 3D / Retry preview | Welcome（M3后置） | 视图舞台 | `Preview controls` | 缩略图/失败时 | 有 | 无 | G |
| F256 | Card title/summary link | Welcome（M3后置） | 视图舞台 | `Example links` | 每卡 | 有 | 无 | G |
| F257 | Sources/DOI/Tags/+N | Welcome（M3后置） | 视图舞台 | `Example metadata` | 按example数据 | 有 | 无 | G |
| F258 | Workflow/Scope说明 | Welcome（M3后置） | 视图舞台 | `Static introduction` | 欢迎页 | 有 | 无 | G |
## 三类必须标出的差异

### G — 没有稳定落点/壳宿主（优先解决）
- **Base 域具名子容器**（Global / Workstation）：`Project.Base slot`；目前 **无**。
- **专属具名工具栏插槽**（共享 View Panel）：`ViewActions[view]`；目前 **无通用注册表**。
- **全局 Popover 宿主**（共享 View Panel）：`Popover portal`；目前 **只有More局部实现**。
- **全局 Dialog 宿主**（共享 View Panel）：`Dialog portal`；目前 **mock自行创建**。
- **全局 Toast 宿主**（共享 View Panel）：`Toast portal`；目前 **无**。
- **Main face 标签**（Main）：`Surface label`；目前 **无**。
- **A/B 端点拖动**（Main）：`Slice handles`；目前 **无真实handles**。
- **Mask 当前 Cell 标签**（Mask View / Draw）：`Cell label`；目前 **无独立label**。
- **Draw Shape Editor 各类型参数**（Mask View / Draw）：`Shape editor portal`；目前 **无真实参数编辑器**。
- **3D Loading / Unavailable**（3D View）：`Renderer fallback`；目前 **无**。
- **Z Break 上下界拖动 handles**（Section）：`Ruler handles`；目前 **无**。
- **Z Break snap to layer**（Section）：`Snap checkbox`；目前 **无**。
- **Z Break equal scale**（Section）：`Linked scale checkbox`；目前 **无**。
- **Detail ROI 四角 handles**（Section）：`ROI resize handles`；目前 **无**。
- **Detail magnifier inset**（Section）：`Inset CanvasHost`；目前 **无**。
- **Detail shape square/circle**（Section）：`Inset shape toggle`；目前 **无**。
- **Base 编辑入口**（Base）：`Project.Base slot`；目前 **只有Rebuild按钮**。
- **Rectangle / Circle**（Base）：`Shape segmented`；目前 **无**。
- **Width W**（Base）：`Length field`；目前 **无**。
- **Height H**（Base）：`Length field`；目前 **无**。
- **Thickness Z**（Base）：`Length field`；目前 **无**。
- **Apply base**（Base）：`Base apply`；目前 **mock Rebuild**。
- **KLayout samples select**（Mask Browser）：`Sample select`；目前 **无对应select**。
- **Layer hover/disabled**（Mask Browser）：`Layer hover state`；目前 **无**。
- **Process Manual/Recipe/Diagnostics 模式**（Process / Step）：`Submode tabs`；目前 **Manual/Recipe/Code，无Diagnostics**。
- **Lift-off (main新增)**（Process / Step）：已补 Step mock 选项和 sacrificial 选择；M1.5 尚缺入口设计，真实行为留 M3。
- **Rough Feature XY/CV**（Process / Step）：`Rough fields`；目前 **无完整字段**。
- **Rough Height/CV**（Process / Step）：`Rough fields`；目前 **无完整字段**。
- **Rough Orientation/Seed**（Process / Step）：`Rough fields`；目前 **无**。
- **Captured Mask summary**（Recipe）：`Mask context`；目前 **无稳定host**。
- **Use current Mask**（Recipe）：`Mask capture action`；目前 **无**。
- **Recipe Lift-off step**（Recipe）：已补 Recipe mock 选项及 sacrificial 字段；M1.5 尚缺入口设计，真实 replay 留 M3。
- **Diagnostics 入口**（Diagnostics）：M2.5 已放入 Process 注册式子导航和具名宿主；内容仍是 M3 占位。
- **Analyze geometry**（Diagnostics）：`Analyze action`；目前 **无**。
- **状态:未运行/正在运行/完成/过期**（Diagnostics）：`Status text`；目前 **无**。
- **Errors/warnings/Z gaps**（Diagnostics）：`Summary row`；目前 **无**。
- **Material volume/Regions/Array instances**（Diagnostics）：`Metrics grid`；目前 **无**。
- **Gap volume/XY voids/slits/Appearances**（Diagnostics）：`Metrics grid`；目前 **无**。
- **Materials 行/厚度范围**（Diagnostics）：`Material list`；目前 **无**。
- **Findings/位置/次数**（Diagnostics）：`Finding list`；目前 **无**。
- **Partial scan/omitted/stale 警告**（Diagnostics）：`Caution text`；目前 **无**。
- **Legacy unavailable step**（History / Variants）：`Disabled step`；目前 **无完整状态**。
- **Insert before**（History / Variants）：`Step action item`；目前 **无**。
- **Delete last Step**（History / Variants）：`Step action item`；目前 **无**。
- **Add bookmark**（History / Variants）：`Step action item`；目前 **无**。
- **Bookmark Rename/Delete**（History / Variants）：`Bookmark actions`；目前 **无**。
- **全局 Balanced/Airy/Warm/Cool**（Layer Legend）：`Palette select`；目前 **无，当前单行色板**。
- **Material 缺失/不可用状态**（Layer Legend）：`Disabled material row`；目前 **无**。
- **Depth profile Smooth/Follow offset**（Layer Legend）：`Depth-profile popover`；目前 **无**。
- **Clear recovery**（Project / Recovery）：`Clear action`；目前 **无**。
- **Project autosave owner状态**（Project / Recovery）：`Autosave owner`；目前 **无**。
- **Autosave Unsaved/Saving/Saved**（Status / Dialogs）：`Save state`；目前 **无真实内容**。
- **Autosave paused/conflict**（Status / Dialogs）：`Save state warning`；目前 **无**。
- **Safe Reload**（Status / Dialogs）：`Reload action`；目前 **无**。
- **GitHub/commit link**（Status / Dialogs）：`Version links`；目前 **无**。
- **Conflict dialog/Take over**（Status / Dialogs）：`Conflict dialog`；目前 **无**。
- **Popover Esc/外部点击/焦点归还**（Status / Dialogs）：`Popover manager`；目前 **More局部**。
- **Dialog Esc/焦点Trap/返回**（Status / Dialogs）：`Dialog manager`；目前 **mock局部**。
- **Toast 宿主及生命周期**（Status / Dialogs）：`Toast manager`；目前 **无**。
- **Boot/startup failure**（Status / Dialogs）：`Startup fallback`；目前 **无**。
- **Start empty**（Welcome（M3后置））：`Welcome launch link`；目前 **仅mock入口无产品跳转**。
- **Open example**（Welcome（M3后置））：`Welcome example CTA`；目前 **无**。
- **Import GDS/OAS**（Welcome（M3后置））：`Welcome file input`；目前 **无**。
- **Open WaferCAD project**（Welcome（M3后置））：`Welcome project input`；目前 **无**。
- **7 example cards**（Welcome（M3后置））：`ExampleCard grid`；目前 **无**。
- **Main/Mask/3D/Section preview tabs**（Welcome（M3后置））：`Example preview tabs`；目前 **无**。
- **Explore 3D / Retry preview**（Welcome（M3后置））：`Preview controls`；目前 **无**。
- **Card title/summary link**（Welcome（M3后置））：`Example links`；目前 **无**。
- **Sources/DOI/Tags/+N**（Welcome（M3后置））：`Example metadata`；目前 **无**。
- **Workflow/Scope说明**（Welcome（M3后置））：`Static introduction`；目前 **无**。

这些 G 包括但不限于：五域里的 Base 子宿主、Diagnostics 子域、真正的 Draw Shape Editor、History bookmark/legacy actions、通用 Popover/Dialog/Toast portal、Safe Reload/Conflict、真实 renderer fallback。部分 mock 有“看似类似”的内容，但没有可供 M3 控制器长期挂载的固定节点。

### U — M1.5 未给出完整设计
- **ROI Rect/Circle/Sector**：目标 `ROI shape picker`；批准原型中没有同等深度的明确设计，需要在正式接线前补设计。
- **ROI Start/End angle**：目标 `ROI sector angle`；批准原型中没有同等深度的明确设计，需要在正式接线前补设计。
- **Revert base**：目标 `Base revert`；批准原型中没有同等深度的明确设计，需要在正式接线前补设计。
- **Transfer / Laminate**：目标 `Coverage option`；批准原型中没有同等深度的明确设计，需要在正式接线前补设计。
- **Etch Planarize/CMP**：目标 `Profile select`；批准原型中没有同等深度的明确设计，需要在正式接线前补设计。
- **Etch Undercut**：目标 `Profile select`；批准原型中没有同等深度的明确设计，需要在正式接线前补设计。
- **Also add to Recipe**：目标 `Checkbox`；批准原型中没有同等深度的明确设计，需要在正式接线前补设计。
- **Process visual guide before/after**：目标 `Guide expander`；批准原型中没有同等深度的明确设计，需要在正式接线前补设计。
- **Process guide Wiki link**：目标 `External link`；批准原型中没有同等深度的明确设计，需要在正式接线前补设计。
- **Legacy bookmark Restore**：目标 `Legacy restore`；批准原型中没有同等深度的明确设计，需要在正式接线前补设计。

### X — M2 已有位置与原型/旧契约不一致
- **WaferCAD 品牌 / 返回首页**：预期 `Brand link`，目前 壳，品牌非链接；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **视图标题**：预期 `Shared PanelHeader`，目前 Mock里统一；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **通用 Fit**：预期 `Shared Toolbar.fit slot`，目前 mock控制器；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **通用 Max**：预期 `Shared Toolbar.max`，目前 mock控制器；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **通用 Readout**：预期 `Shared Readout`，目前 mock控制器；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **科学画布稳定挂载点**：预期 `CanvasHost[view]`，目前 壳，但子节点会替换；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Slice 入口**：预期 `Slice action`，目前 more中Section line mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **A/B 坐标 X/Y**：预期 `Slice coordinate fields`，目前 设置Dialog mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **ROI 宽高/半径**：预期 `ROI fields`，目前 mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **ROI reference/position**：预期 `ROI anchor XY`，目前 mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Zoom + / -**：预期 `Shared zoom controls`，目前 mock泛化Zoom；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **File / Draw source**：预期 `Source select`，目前 侧面板和画布mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Mask ROI Size/Radius/Rotation**：预期 `Mask ROI fields`，目前 mock通用ROI；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Mask ROI reference/X/Y**：预期 `Mask ROI position`，目前 mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Mask opacity**：预期 `Opacity slider`，目前 mock设置区；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Mask export Cells 多选**：预期 `Export scope.cells`，目前 mock不等价；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Mask export Layers 多选**：预期 `Export scope.layers`，目前 mock不等价；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Fast / Quality**：预期 `Render quality select`，目前 mock按钮；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **3D Border**：预期 `Display checkbox`，目前 mock Dialog；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **3D Opacity**：预期 `Display slider`，目前 mock Dialog；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **3D Export PNG 3×**：预期 `PNG export`，目前 mock PNG非3×；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Cancel GLB**：预期 `Abort export action`，目前 mock disabled；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Scale Auto / 1:1**：预期 `Scale select`，目前 设置Dialog mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Z Break Enable**：预期 `Z Break toggle`，目前 mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Z Break 上下界数字输入**：预期 `Boundary fields`，目前 mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Z Break Front/Back scale**：预期 `Scale fields`，目前 mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Section Border**：预期 `Display button`，目前 mock Dialog；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Detail ROI 入口**：预期 `Detail ROI action`，目前 mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Detail zoom/drag/close**：预期 `Inset toolbar`，目前 mock仅设置；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Import GDS/GDSII/OAS/OASIS**：预期 `Layout import`，目前 mock Inspect sample；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Cells tree root**：预期 `#cellTree host`，目前 mock树，无稳定ID；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Cell caret展开/折叠**：预期 `Tree item caret`，目前 mock递归但无相同操作；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Cell instance count**：预期 `Tree item badge`，目前 mock shapeCount；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Layers list**：预期 `#maskLayerList host`，目前 mock，无稳定ID；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Alignment X/Y/S/R**：预期 `Mask Alignment`，目前 mock Dialog，与侧面板原型待核；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Front/Back face**：预期 `Face select`，目前 mock Rear标签不一致；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Selected/Invert/Whole face**：预期 `Area select`，目前 mock area不等价；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Layer Name**：预期 `Text field`，目前 mock不完整；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Transfer Placement Follow/Flat**：预期 `Placement select`，目前 mock挂在Extend下；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Etch material-selective target**：预期 `Target select`，目前 mock泛化材料；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Record Process/Temp/Time/Ambient/Note**：预期 `Record metadata`，目前 mock不全；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Steps / Code switch**：预期 `Recipe submode`，目前 Code独立domain mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Step Face/Area/Target/Length**：预期 `Step parameter fields`，目前 mock部分；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Step Rough/Implant/Electrical/Record fields**：预期 `Conditional step editor`，目前 mock部分；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Run Start Continue/Rebuild**：预期 `Run mode select`，目前 mock buttons形式；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Stop**：预期 `Stop action`，目前 mock取消；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **History 容器及独立滚动**：预期 `#snapshotList / scroll host`，目前 mock但无稳定ID；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Variant Rename 双击/按钮**：预期 `Inline rename`，目前 mock有限；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Delete Variant**：预期 `Variant action/Confirm`，目前 mock有限；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Continue from here**：预期 `Step action item`，目前 mock恢复分支非等价；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Bookmark 子组展开**：预期 `Bookmark list/details`，目前 mock总列表非嵌套；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Historical edit/insert Banner**：预期 `Continuation context`，目前 mock有限；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Return to HEAD/Cancel edit/insert**：预期 `Context action`，目前 mock不等价；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **#layerLegend 宿主/滚动**：预期 `Legend dock`，目前 mock且硬编码；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **全局 Random palette**：预期 `Palette random action`，目前 仅行random mock；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Material 颜色/重命名**：预期 `Material row`，目前 mock颜色/纯文本名；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Material Visible**：预期 `Visibility checkbox`，目前 mock仅显示；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Implant gradient/Name/Visible**：预期 `Implant row`，目前 mock只读；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Electrical color/Name/Visible**：预期 `Electrical row`，目前 mock只读；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Open .wafercad/.json**：预期 `File input`，目前 mock Load入口，非文件；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Local Save checkpoint**：预期 `Save action`，目前 mock Save UI draft；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Export .wafercad**：预期 `Export action`，目前 mock Export UI draft；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Recovery checkpoint select**：预期 `Recovery select`，目前 mock无真实select；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Restore recovery**：预期 `Restore action`，目前 mock Review recovery；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Process Task elapsed/stage**：预期 `Task dialog`，目前 mock进度内嵌侧面板；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Process Task Abort**：预期 `Abort action`，目前 mock Cancel按钮；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Confirmation title/message/detail**：预期 `Confirmation dialog`，目前 mock局部；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。
- **Confirmation actions (danger/cancel)**：预期 `Dialog actions`，目前 mock局部；迁移时核对 M1.5 视图/侧面板/浮层的职责及状态。

**注意：**X 包括形式差异与 mock 功能语义不完整两种，不应将它们全部认定为 M1.5 “视觉设计错误”；M2 以壳版式验收，M3 才处理模拟内容到真实组件的接线。

## 三个架构问题（仅诊断，不修改）

| 问题 | 结论 | 证据 / 文件位置 | 风险 |
| --- | --- | --- | --- |
| 壳是否为每个域提供**具名插槽**？ | **否。**只有泛化 `renderEditor` / `renderView` 回调；`view-panel.js` 特判科学内容和 Legend；五个域无固定 DOM 宿主。 | `site/ui-v2/workstation-v2.js:5-11, 168-193`；`mock-domain-panels.js:896-922`；`view-panel.js:6-39` | M3 接线需改壳/重挂业务容器，旧 renderer/焦点/滚动可能丢失 |
| 新增入口是否需要改**壳代码**？ | **需要。**导航域与模式按钮、Section/Split 固定枚举；新增一级域需改壳，新增子模式仍需在 mock/真实 adapter 中手工路由。 | `workstation-v2.js:14-35,36-106`；`mock-domain-panels.js:433-458,896-922`；`mock-workspace.js:545-604` | 每个控制器都可能侵入固定导航模型，位置漂移 |
| 壳里是否含**业务知识**？ | **有。**History 空态、History/branch focus/scroll判断、Process/Recipe domain placement、Task busy 时遍历禁用业务输入、dirty/readonly 文案由壳决定。 | `workstation-v2.js:22-27,150-193,220-250` | 壳难以复用，M3 真实业务条件导致旧 mock 冲突 |

### 额外结构问题（必须先隔离）

1. **共享外框没有单一所有者：**`mock-views.js:350-524` 负责标题、Fit/Pan/Zoom、More、Max、readout；`view-panel.js:6-39` 只缓存/替换 section。M2 要求这些公共元素统一在共享 view-panel 组件，专属控件插槽属于独立 owner。
2. **稳定容器仍被重渲染拆解：**`workstation-v2.js:229-240` 每次替换 `.p-body` 子树；`view-panel.js:12-38` 每次替换 `.p-science` 的所有 children 并特判 `#layerLegend` / `.v2-legend-list`。虽然外层 panel 对象可能复用，真实 canvas/renderer、焦点和订阅并不受到保证。M3 必须让容器 ownership 与内容生命周期分离。
3. **Popover/Dialog/Toast 的所有权分裂：**`native-components.js:109-180` 只提供 More 的原生 Popover；`mock-workspace.js:186-224` 每次在 mock 中创建 Dialog，`openViewSettings:366-538` 把 Main/Mask/3D/Section 设置放入大 Dialog；并无通用三种 overlay 的宿主/API。缺失全局一致的 Esc/外部点击/焦点恢复测试。
4. **Base / Diagnostics 域路由不完整：**`workstation-v2.js:14-35` 一级导航只有四个；`mock-domain-panels.js:896-922` 仅 project/mask/process/recipe/code/history，无 Base/Diagnostics；`processPanel:433-459` 仅 Manual/Recipe/Code。应把 Base 与 Diagnostics 变成**具名子域**，不改用户已批准的一层导航。
5. **Legend 耦合：**`view-panel.js:26-35` 按 `#layerLegend` 及内部 `.v2-legend-list` 特殊修补，`section-legend.js:92-118` 已创建 mock 列表并占用这个 ID。M2 应只拥有 `#layerLegend` 宿主，行内容与重命名/显隐/profile 归 M3；不得并行出现两个同 ID 节点。
6. **业务 mock 虚假等价：**`mock-domain-panels.js:282-341,433-497` 把 Transfer Placement 挂在 Extend，省略 CMP/Undercut、Invert Mask 等；`mock-workspace.js:366-538` 合并不同 ROI 设置；这些不属于 M2 壳验收结果。主线新增 Lift-off 与旧 Contract 基点不同，必须在 M3 第一阶段对最新 main 审计。

## 推荐：保留 A 布局，**先微调壳的区域/插槽模型，再按表落位**（不推翻布局）

**选择理由：**顶部视图模式、左导航+侧面板、Section dock 和四档响应式已在 M1.5 批准，没证据需要整套换成 B/C 布局。但当前抽象不足以安全容纳动态业务；直接“重摆放”会迫使 M3 每次进 shell 增 hardcoded 条件和替换子树。

**审核后的实施建议（本轮不执行）：**

1. **M2 补足区域模型**：定义 `topbar.project`、`navigation.primary`、`panel.project/base/mask/process/history`、`panel.process.step/recipe/code/diagnostics`、`view.[main|mask|three|section].header/actions/stage/readout/overlays`、`portal.popover/dialog/toast`、`status.message/save/version` 的具名宿主；Base 是 Project 子域。保持 shared ViewPanel 独占公共工具栏模板。
2. **Shell 只管理布局、模式及生命周期**：新入口注册走配置而非修改 `nav()` 硬编码；禁用/忙/历史空态由外部展示状态与回调通知，壳不直接读 `task`、`history`、`placement`、`dirty`。
3. **保证 DOM identity**：一次创建五域容器和四视图科学 canvas hosts，切换通过 hidden/布局移动真实节点；不要 `replaceChildren` 删除 renderer 子节点。M3 所有权由 production adapter 分别控制。
4. **补齐浮层通用合同**：Popover/Dialog/Toast 统一 mount/close、Esc、点击外部、焦点返还、aria-haspopup/expanded/controls；业务只注入内容，不自行在壳外再造 modal。
5. **逐域迁移**：按 Feature Inventory A/B/C/D 验收，先公共 view 工具栏，再 Mask/Project/Process/Recipe/History/Section/3D/Welcome；逐行清除 G/U/X，记录不能避免的设计决策，绝不凭 Mock 宣告功能正确。
6. **守住边界**：M2 不合入科学核心、M3 不改视觉规范；保留两个 sessionStorage 键与 `html[data-ui=v2]`，不得使 legacy `.workstation-ui-v2` 的 CSS 生效。M4 才跑生产实例三合一验收。

## 审核出口

**已批准**：(a) Base=Project 具名子槽，Diagnostics=Process 子域；(c) 保留 A 版式并调整内部具名插槽/DOM 生命周期。**仍待后续设计确认**：(b) CMP/Undercut/Lift-off、完整 Z Break/History bookmark/Process Guide 等未设计细节。本轮仅 M2.5，不进入 M3，也不补原型。

本轮仅创建/更新文档，**不做任何 UI 代码更改、merge、部署、CI/视觉基线更新**。
