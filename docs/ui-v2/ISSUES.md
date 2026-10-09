# UI v2 问题与决策边界 — M0

基点 `fbbb2f9f3a585574e20ed706c34653164f13440c`。M0 不修改产品源码，也不修改科学核心、Workers、持久化或已批准视觉基线。下列项目仅登记，未批准任何核心修改。

| ID  | 发现                                                                                                                                                                       | 处理建议 / 决策时点                                                                                                             | 当前状态                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| I01 | 计划将 `wafercad.workstation-view-mode.v1` / `wafercad.workstation-split-views.v1` 称为 localStorage 键；源码实际使用 sessionStorage，跨刷新保留但不提供一般跨会话持久化。 | 默认保留键名与现有 sessionStorage 语义。若希望改为 localStorage，需要明确选择和独立迁移/跨标签测试；M2 前解决。                 | 待确认语义；M0 无写入。                 |
| I02 | app.js 创建 Workstation 时立即装配，启动自检硬编码旧 class/rail/stage；旧 `workstation-ui-v2` 实际属于 legacy。                                                            | v2 选择独立 factory 并按 data-ui 分支自检；在控制器首次查 ID 前构造壳。不能全局换掉 legacy 装配。                               | 已定位，M2 范围内处理。                 |
| I03 | startup-controller 的 `history.replaceState` 也硬编码 app.html。                                                                                                           | M3 Welcome 域通过可注入入口或独立 v2 adapter 保留新 URL；仅修改 welcome.js 不足。                                               | UI 控制器允许范围，未修改。             |
| I04 | History Edit Step 在 app.js 中用旧 rail selector 执行导航，Recipe 在 bind 内写 innerHTML，并有 dataset.ready 门卫。                                                        | 使用显式导航回调与组件创建策略，保留原 History/Recipe 事务 API。Recipe 的一级工作区/Process 模式由 M1.5 原型比较决定。          | M1.5/M3 待实施。                        |
| I05 | Section Z Break 会把原 dialog 移到 body top layer；viewPopover.closest(view-panel) 随之失效，关闭时另回挂。                                                                | v2 统一 popup owner/focus 生命周期，保留 showModal/close 和收起 Section 入口；不改物理 Z。                                      | M2/M3 待实施。                          |
| I06 | PR #161 CI 记录 1.7857px Main/3D ROI 纵向偏移；改变 canvas 布局会影响所有 DOMRect 坐标路径。                                                                               | M3 保留指针级严格对齐断言，必要时先诊断。若需要改 plan-renderers/three-view 等只读模块，先报告，不在 UI 重构中顺手修改。        | 失败已证实，根因未独立复现。            |
| I07 | 计划的 workspace-persistence*.js 只读范围包含 controllers/workspace-persistence-controller.js。                                                                            | 将恢复、writer lease 和 safe reload 作为只读事务服务；仅 adapter/DOM contract 对接。若 DOM 绑定必须改到此文件，先请求范围批准。 | 无核心修改需求已获批准。                |
| I08 | AST 可明确收录字面类名，但变量/helper、模板插值、动态 input.id 不能从静态库存推出所有运行时值。                                                                            | 库存记录表达式与未解析点；每域迁移补运行时样例核对。不能以静态 259 ID 覆盖率代表动态域完整。                                    | 见 contract.json unresolvedOperations。 |
| I09 | legacy 单视图集合只包括 Main/Mask/3D；Section 是 dock，Welcome preview 才有四个独立 view。                                                                                 | 原型显式演示 Section 与其他视图的组合、Maximize、Z Break/ROI。保留旧行为契约；新增 Section 一级模式如涉及语义变化在 M1.5 评审。 | 待原型选择。                            |
| I10 | legacy Node 测试读取 HTML/CSS/旧 Workstation 源码，browser helper 要求旧 rail/flyout/祖先关系。                                                                            | 新脚本置于 scripts/v2 并硬校验入口；legacy 原入口和断言不改。科学/History/恢复断言共享必须通过 adapter，不降低标准。            | M4 设计约束。                           |

需要用户选择的产品事项集中在 M1/M1.5：浅色设计系统、2–3 布局取舍、Recipe 位置；本轮不代选。唯一新增的源实现是审计脚本，不是产品 UI。

## M1.5 / M2 决策更新（2026-10-09）

上表保留 M0 审计原貌。当前结果见 [M2 检查点](M2_CHECKPOINT.md)：

- **I01 已确认并实现**：按源码保留两个 sessionStorage 键，不使用 localStorage；模式默认值、Split 去重/交换、跨刷新与拒绝存储均有 v2 检查。
- **I04 已选定 UI 位置**：A 布局，Recipe / Code 在 Process 内；真实事务适配与跨域导航仍待 M3。
- **I06 检查提前至 M2**：1440/1024px mock 壳层 Main/3D ROI 上下边界偏移均 0px，阈值 0.25px。真实 3D renderer / 指针 ROI 验收仍待 M3，不宣告旧 CI 根因已解决。
- **I09**：保留 Section dock；窄屏单独访问 Section 不扩展 legacy 的存储模式集合。
- **I08**：5 个未解析动态表达式仍未覆盖，M3 逐项追踪。

## M2 补漏自查

Section Legend 已补只读材料/注释显示和响应式布局，真实编辑待 M3。
其余原型缺口见 [M2 自查](M2_GAP_AUDIT.md) G01–G08：尤其 History 仍平铺、Manual 缺 Extend / Etch 分类不一致 / Tilt 不支持负值。
这些未完成的界面项不计入已覆盖，不以 M2 浏览器检查通过代替全工作区验收。用户允许本地提交；停下审核，不进入 M3。
