# M1.5：A 方案 / Recipe 在 Process 内（第二轮）

双击 `index.html` 即可；无构建、无 HTTP 服务要求、无 fetch、无模块导入。
九页 = A/B/C 三种布局 × Process/Recipe/History 三个屏幕。
每页调试条：1440/1024/768/390 宽度、空/有列表、Recipe 失败步骤、Recipe 两种位置。
空列表不会清空实际科学模型。原型无核心接线、无产品存储写入。
不使用 Playwright，不交截图。用户已选 A / Process 内 Recipe，第二轮完成后停下等确认，不进入 M2。

## 当前入口

`index.html` 列出全部入口；`a-full/index.html` 是选定方案的完整半静态原型，直接双击即可。
顶部调试条有 1440/1024/768/390 真实内部视口、两份真实示例、工作区、空 History、Recipe 失败、字体切换。
产品主导航只有 Project / Mask / Process / History；Recipe 是 Process 内模式，不是一级工作区。
补齐四视图工具栏、Split / Maximize、Section Z-break、原生 Popover 溢出菜单、面板头、可拖/键盘分隔条、列表行、数值步进、busy/progress 与 empty state。
图标为原创 30 枚 16px / 1.6px round-stroke / currentColor 的内联 SVG symbol sprite，无依赖。

`a-full/fonts.html` 并列比较系统栈 / 本地 Inter Variable，11/12/13px、数字与中文回退；用户已选 B · Inter Variable WOFF2 / system fallback，现为原型默认字体。
本地候选 352,240 字节，OFL 1.1，许可证在 `a-full/fonts/`；不修改已批准的 M1 tokens。

## 数据与边界

M3D 27 层 / 551 区域 / 35 步 / 36 History 节点 / 1 源分支；Photodetector 5 最终层 / 46 节点 / 7 源分支。
Main/Mask 为实际源几何；3D 为已有真实最终缩略图，Section 为实际区域堆栈示意而非计算截面。
File Mask 使用真实 GDS 的 cells / layers 元数据演示，明确不做核心导入；New / Save / Recovery / Apply / Recipe 操作是 UI draft / 模拟，不改变源模型或产品存储。
空 History 收回 inspector；1024px 始终 Grid 停靠；768/390px 预览在上、编辑在下，无 flyout，返回结果可达。
ROI 图形仅 UI 演示；PR #161 的 Main/3D 垂直对齐专项检查仍是 M2 壳层后、接核心前的检查点，不算此轮通过。
5 个未解析动态表达式仍留 M3；M4 视觉基线浏览器仍需用户确认。

## 重建与轻量自查

在 WaferCAD 仓库运行：

```powershell
node scripts/v2/build-a-prototype-fixtures.mjs --write
node scripts/v2/build-a-static-prototype.mjs --write
node scripts/v2/build-static-prototypes.mjs --write
node scripts/v2/check-static-prototypes.mjs
```

三个生成器不带 `--write` 校验确定性。浏览器端无 fetch / 模块导入，直接打开不需要 HTTP。
仅轻量本地链接 / JS 语法 / 原生 Chrome DOM 加载和页面错误检查；不运行 Playwright、截图、全量测试或 legacy 格式修复。
基点仍为已批准的 M1 `c7856da`；已获取 upstream main `b81598b`，本轮未合并，M2 前同步并重验。

入口逐项列出 #161 的三个失败和 A/B/C 各自处理方式、优缺点与适用尺寸。
轻量自查：原生 Chrome 直接加载全部十二个 HTML，页面错误为 0，所有本地链接存在。
历史截图仍只留在工作区上级归档，不作为交付；第二轮复用其原生模板、组件、SVG 和本地字体，转换为可直接打开的静态 HTML。

页面由 `node scripts/v2/build-static-prototypes.mjs --write` 从完整 M3D / Photodetector 源文件生成。
不带 `--write` 校验输出确定性。Main 为源多边形，3D 为已有真实最终缩略图；不是科学渲染验收。
