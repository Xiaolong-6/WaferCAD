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

## M3 前置 main 审计差异（2026-10-10）

完整按域“静态控件 / 动态生成 / 状态 / 事件与导航 / 真实事务回调”表见 [M3 latest-main audit](M3_MAIN_AUDIT_2026-10-10.md)。本轮只写文档，无产品接线。以下编号在 I01–I10 的历史问题上递增，未表示已有核心修改授权。

| ID | 发现与影响 | 处理边界 / 验收条件 | 状态 |
| --- | --- | --- | --- |
| I11 | `main` 的 `site/app.html` 现有 **267/267** 唯一静态 ID（含 Lift-off 3 个、Diagnostics 5 个）；M0 自动生成的 `CONTRACT.md` / `contract.json` 仍是 **259**。原 205 dynamic classes / 843 operations / 5 unresolved **不能**自动视为最新。 | 取得可执行 checkout 后先用 `node scripts/ui-contract-extract.mjs --write` 与 `--check` 共同刷新机器清单和人类文档；逐项复核新增控件引用及动态表达式；禁止直接手写假的 AST 数量。 | **P1 / D1 前资产门槛未通过**；本轮仅核对当前静态 HTML |
| I12 | `site/app-v2.html` 仍运行 mock，`site/ui-v2/app.html` 是未接生产服务的 shell，`site/app.html` 是真正产品入口。v2 没有已验证的独立生产 bootstrap；可能发生 double-bind 或仍展示演示数据。 | 建议稳定 `site/app-v2.html` 做未来生产 route；保留单独 mock/gallery 入口。先定义 shell-first / single-owner / mount→bind→restore 契约，D1 需真实运行时验证；不得擅自切默认入口。 | **P1 / D1 设计前置**，待 D1 批准 |
| I13 | 源分支 `codex/ui-v2-m2-handoff-2026-10-09` 当前 `e706f38`，比远端 `main` `dc2cb2d` **领先 99 commits**；`main` 没有 `site/app-v2.html` 或 `docs/ui-v2/`。历史文档“已合并 main”的措辞与现在远端状态不符。 | 按用户指定从源分支开 M3 分支，不合并 main；下个域启动前重新比对远端，另行获准方可进行最终集成。 | **P1 / 集成事实已确认；合入主线未获授权** |
| I14 | `main` 已纳入 4,725-site TiO₂ full-array Welcome 项目及 Lift-off / Geometry Diagnostics；巨型数组恢复和报告 partial/stale、Recipe/History 源 ID、renderer ready 与完整帧之间存在跨域契约。 | D3/D4/D5/D6/D8/D9 各自加入实际源工程场景；确认 full array 的 compiled grid 不代表 full Recipe Run All；Diagnostics 不能将 skipped/partial 检查说成无问题。只读科学/worker/IO 保持不变。 | **P1 / 映射已录，runtime 待 M3** |
| I15 | 当前审计环境无可用本地工作区；只有 GitHub API 源码读取和引用对比，不能执行 `npm ci`、AST 生成、Node/浏览器或视觉验收；用户计划中的“重新跑契约”尚缺执行证据。 | 在 D1 前取得可执行 checkout，实际执行且记录命令、退出码、浏览器/OS 与清单差异。既有 60 shell checks 是历史报告，不当作本分支重新跑出的结果。 | **P1 / 未通过 runtime 门槛；不得以文档完成宣告 D1 可自动启动** |

### M3 检查点纪律

- 当前分支：`codex/ui-v2-m3-main-audit-20261010`，初始基点 `e706f38`。只完成可连接 API 的静态审计与文档记录；**没有启动 D1**。
- D1 前置决策与运行时审计必须汇报并获用户批准；每域开始记录回滚基点 commit，不打 tag；同样的批准门槛适用于 D2–D9。
- BC-03–BC-08 由其指定 M3 域验收覆盖，不新增 mock 功能作为替代，不改已批准视觉基线。
