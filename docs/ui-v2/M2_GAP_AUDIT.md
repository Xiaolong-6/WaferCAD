# M2 自查：剩余界面缺口与 M3 边界

2026-10-09；分支 `refactor/ui-v2-m0`。对照 r2、M0 的 CONTRACT / IMPLICIT_DEPS、原版 `app.html` 及相关控制器。
这是源码与 mock 壳层检查，不是全功能验收；不能因浏览器检查通过而宣告每个工作区完成。

## 本轮已补

Section Legend：宽屏侧排、窄屏画布下方、收起/恢复、独立滚动、稳定容器；层名、色块、稳定 ID 来自完整工程。
额外读取所有历史模型中的 Implant / Electrical 注释元数据；Photodetector 当前模型的两个 Implant 已显示，未复制注释物理几何或执行模型计算。
Legend 目前只读；可见性、重命名、颜色和 profile 的真实编辑仍须调用原服务，不能另写模型 mutation。

## 界面遗漏 / 不一致：未完成，不能直接归为“只差接线”

| ID  | 缺口及源码依据                                                                                       | 当前表现 / 后续验收                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G01 | History 必须在 origin Step 下嵌套 Variant；`IMPLICIT_DEPS.md` D30、`project-controller.js`           | `mock-domain-panels.js` 只有平铺 Variants 和单层箭头。Photodetector 7 分支数量正确不代表树关系正确。须展示 main → black-si → final/qa、main → ge-common → a/b 的真实起点和 HEAD/cursor 区别。    |
| G02 | Manual 操作完整性；`app.html` 的 `operationType` / `etchProfile` / `etchSurfaceMode` / `implantTilt` | 缺 Extend；Etch 将 Rough 混在 Profile 中，旧版是 Directional/Isotropic 与 Smooth/Rough/Pyramid 分开；Tilt 步进硬限 ≥0，旧版允许 −80…80。mock 表单不得作为 M3 参数语义来源。                      |
| G03 | Recipe 构建流程；`process-recipe-controller.js` 的 `initMarkup`、步骤生成函数                        | 缺 Add/Delete/Move、模板预览/替换确认、Recipe Undo/Redo、完整 Validate/字段错误与执行起点表单。现有长列表、参数草稿、失败定位和模拟 Continue/Rebuild 不代表完整编辑器。                          |
| G04 | Main / ROI / Slice；`app.html` 的 `sectionControlsBtn` / `sectionAx` 等、`roi-controller.js`         | 只有工具按钮/示意 ROI，缺 A/B 数值编辑、ROI 形状和位置/尺寸/清除表单。真实拖动另外属于 M3。                                                                                                      |
| G05 | Mask；`app.html` 的 Draw / alignment / File 导出控制                                                 | Draw 只有 Rectangle/Ring；缺其余绘制/选择/删除/清除工具、对齐变换、完整 ROI、File 层显隐/Cell 层级与导出范围。真实 GDS 12 Cells 是元数据平铺，不是导入或层级行为验收。                           |
| G06 | Section；`app.html` 的 `sectionScaleModeBtn` / `sectionBordersBtn` / Z Break editor                  | 缺 Auto/1:1、Border、完整 Z-break 参数与 Detail ROI/inset 参数 UI。当前 Z-break 仅开关/说明，不等于完整编辑器；Legend 已补，但编辑控件位置仍待迁移。                                             |
| G07 | 导出与显示；`app.html` 的 Mask GDS/OAS、3D GLB/PNG/cancel、opacity                                   | 3D 合并成模拟 image/GLB，缺独立 GLB/PNG 与取消、透明度；Mask 缺 GDS/OAS。共享 More 还含未逐视图区分的泛化动作，需要逐域收敛。Mask 功能面板仍有独立 Export Draw SVG，须与“Export 收进 More”统一。 |
| G08 | 全局工具；`app.html` 的 `xyUnitSelect` / `undoBtn` / `redoBtn`                                       | 缺 nm/µm/mm 显示输入单位选择及全局 Undo/Redo 入口；不能重缩放 canonical µm。Project Base 的 Keep/Clear/Cancel 只有说明，没有完整分支选择 UI。                                                    |

这些是此前原型覆盖的欠账，不再称为“第二轮全部补齐”。优先确认 G01/G02，再按原版契约补齐领域模板。
本轮用户要求补 Legend 和自查，没有擅自进入 M3 或扩展到全部界面重做。

## 按计划尚未接线：不是本轮真实功能完成

- Project 文件导入导出、Base 事务、Recovery/IndexedDB/writer lease/safe reload；现为显式 UI 模拟。
- Process workers、失败回滚、Recipe parser/validator/replay、History restore/fork/HEAD/bookmark 事务；均未接入。
- 四个真实 renderer、指针坐标路径、科学截面、3D Fast/Quality/物理 GLB；3D 为固定最终缩略图，Section 为实际堆栈的等高示意。History 选择并不会同步重建真实三视图。
- 259 静态 ID / 动态库存不是已通过覆盖率；5 个未解析动态表达式仍需 M3 逐项追踪。
- Welcome 启动/示例卡、状态和错误降级在 M3；默认入口与 legacy 未切换。
- 上游 `origin/main` 已获取至 `b81598b`，尚未合并，真实控制器接线前必须同步检查。
- M4 双通道完整回归和大阵列、视觉基线均未执行；基线浏览器仍须用户选择。

## 实际检查与未宣称的结果

Windows / Node 26.7.0 / 原生 Chrome 155.0.8059.40。
`node --test scripts/v2/view-state.test.mjs` 5/5；`node scripts/v2/check-m2-shell.mjs` 19 项通过，无页面/控制台错误，不用 Playwright、不截图。
新增 Legend 包含源名称/颜色/ID、collapse/restore、容器稳定、768/390 下方文档流和 Photodetector 两条真实注释检查。
1440/1024 mock Main/3D ROI top/bottom 均 0px，阈值 0.25px；不是实际 3D 投影或 #161 根因解决证明。
ESLint 覆盖 `site/ui-v2/**/*.js` 和 `scripts/v2/*.mjs`；格式检查仅 v2 新增文件，未修 main 的 18 个既有失败。
`node scripts/v2/build-m2-mock-data.mjs` 检查数据确定性及完整源工程 hash，源码核心和 legacy 路径 diff 为空。

停在 M2 审阅检查点。允许本地 commit；没有 push、部署、触发 CI 或开始 M3。
