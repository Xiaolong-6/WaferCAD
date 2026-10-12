# 人工 UI 迭代后的代码与架构审阅

日期：2026-10-12。工作分支 `ui/human-review-2026-10-12`，基线 `77957774`。用户在审阅后授权将本轮修改提交到新分支，并推送至 origin。本文件随该提交保存，具体提交 ID 和远端状态以 Git 历史为准。

## 工作边界

本轮以用户与 Codex 共同查看 localhost:4182 的 dev 页面进行快速人工迭代。用户明确要求不提交，并于审阅期间明确要求停止本地自动化测试。后续收尾仅作静态代码与架构审阅；不把先前测试结果当作最终人工验收，也不继续扩大测试范围。

## 架构判断

- Workstation 壳层继续负责导航、槽位、尺寸与视图模式；Mask、Section 和工作流适配器负责真实控件的接线与展示。
- Recipe 折叠、排序和清空沿用既有控制器及稳定 Step ID。排序与清空进入 Recipe 的原有 Undo/Redo；不执行物理 Process 操作。
- 共享 Recipe 与 Project 控制器的新展示选项默认关闭；Legacy 保留模板和原有 History 展示。Mask 样例选择改为可选控件，避免 v2 移除入口后启动崩溃。
- 几何核心、worker 事务、工程 schema 和 History 分支算法未改动。Layers 宽度仅为 sessionStorage 视图偏好；Mask opacity 使用既有状态和渲染路径。
- Code 文本框随内容增长，Recipe/Code 各由一个面板承接滚动；执行与编辑动作放在文本上方。隐藏节点规则必须保持有效，避免 display 规则覆盖 hidden。
- History 控制器保留菜单内容所有权；v2 通过显式 decorateHistoryMenu 回调接入 native popover 和共享 overlay 生命周期。没有新增运行时依赖。

## 审阅收尾

- 紧凑 History 菜单可能被列表滚动容器裁切：改用 native top layer，并保留嵌套书签菜单的父弹层。
- 旧的桌面最小高度会在短窗口形成额外页面滚动：限制最小高度不超过工作区可用视口高度。最终短窗口视觉表现仍按 dev 页面人工验收。
- Variant 重命名编辑器的 grid 被后面的通用 flex 规则覆盖：去掉冲突选择器。
- 面板默认宽度改为约视口三分之一后，分隔条的无障碍范围仍沿用旧的 400px：同步实际允许范围和当前宽度。
- 既有同步检查中移除的 Sample 控件引用改为导入同一 GDS fixture；紧凑列表的滚动场景改用短窗口。按用户要求不再本地重跑。

## 已有验证证据与限制

在用户要求停止本地测试之前，Windows / Node 26.7.0 / Playwright 1.55.1 / 已安装 Chrome / 本地 Three 0.179.1 环境运行过：

- npm test：635 项通过。
- npm run docs:check：通过。
- check-startup：通过。
- 原有 check-review-interactions 的五种窗口/触控检查及 Electrical 控件检查：通过。
- process-geometry-regression --recipe-only：通过。
- npm run check：未整体通过；全仓格式检查报告 18 个本轮未修改文件，未混入无关格式重写。
- check-sync：部分契约通过，随后因已移除控件的旧 selector 停止；最后的 selector 修正未重跑。

审阅中临时扩展的自动化场景已撤回。最终修复没有完整自动化回归结论，后续以 dev 页面人工确认。运行日志在忽略目录 test-results/ui-review/，不作为跨环境可复现的唯一证据。

参照：[M2 检查点](../archive/ui-v2/M2_CHECKPOINT.md)、[开发规范](../DEVELOPMENT.md)、[测试所有权](../testing.md)。
