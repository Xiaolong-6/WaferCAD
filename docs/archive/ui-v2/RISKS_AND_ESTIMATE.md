# UI v2 风险与工作量 — M0

主线 `fbbb2f9f3a585574e20ed706c34653164f13440c`。估算以源码耦合和计划验收范围为依据，不是工期承诺；用户原型迭代和批准等待不计入实现时间。源码目录有 31 个控制器，不能把它们全部视为需要重写的核心模块。

## 迁移范围

- 装配层：五个明确允许重写函数之外，还要替换 initialize/bind 的滚动导航、Split title selectors、Section dock、resize/compact state、项目名同步和自定义事件。旧 Workstation 约 780 行，预计新装配/模板/导航合计约 600–1000 行；不是给旧 CSS 增补一份覆盖。
- DOM 密集域：Recipe、Project/History、Mask browser、Layer legend、Draw editor、Confirmation 六个生成器是优先审计范围。56 处动态 DOM ID 声明/调用并非全都同时出现，变量表达式还需逐域解释；数据模型的 Step ID 赋值已从 DOM 计数排除。
- 直接 DOM/导航适配：预计 18–24 个控制器或 UI adapter，加 app.js/Welcome 入口层。只改 DOM 引用、组件类名、focus/owner 或导航回调；事务、科学/文件/恢复算法不迁移。
- 只读服务：Process workers、模型、project/schema/IO、snapshot graph、持久化、renderer/parser 通过现有 API 使用。禁止修改清单优先于“控制器 DOM 绑定可修改”的一般许可。
- 回归：v2 需独立 bootstrap/locator adapter 和计划要求的十类 suite；原科学断言复用、legacy 入口原结果保留。Recipe 安全性和 Section/Z Break 是跨域检查，不止截图。

## 风险优先级

| 风险                                                 | 级别 | 成功证据                                                                                  |
| ---------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------- |
| 装配顺序造成缺失引用或双绑定                         | 高   | 新入口独立 factory、自检、所有控件先建后 bind，控制台无错误，一次 Apply 只提交一次 Step。 |
| 1440/1024 面板抢占科学视野，手机不能完成 edit→view   | 高   | M1.5 真实工程四档逐屏评审；密集 Recipe/History 和展开 popup 状态都能操作。                |
| Recipe/History 动态 DOM 与稳定 Step/Variant 身份失配 | 高   | 编辑、Run to Step/Run All、失败定位/继续/重建、Variant origin tree 和还原完整场景。       |
| canvas reparent/resize/More 改变指针坐标             | 高   | Main/Mask/Section/3D ROI、Slice、detail drag、maximize 后严格像素/几何一致性。            |
| localStorage/sessionStorage 和入口 URL 语义误改      | 高   | 保留原键与存储域；v2 URL 自检、刷新/恢复/跨 tab/staged start 核对。                       |
| 把材料色误当 UI token 或缩放影响物理单位             | 高   | UI 色与科学数据色明确所有权；模型/export/History 的 µm 值保持原断言。                     |
| dialog/portal 所有权和 Esc/焦点冲突                  | 中高 | Nested More、原生 Section modal、Confirmation 与 worker task 组合测试。                   |
| 静态 inventory 误当完成证明                          | 中   | 标记未解析表达式、真实运行时核对、功能/视觉/流程三项记录。                                |
| 双通道脚本重复而产生断言漂移                         | 中   | 明确 shared assertion owner、仅入口/selector adapter 可变，v2 开头硬校验。                |
| Preview/视觉 baseline 提前发布或污染 legacy          | 中   | 独立主机/目录；基线与默认入口分别在 M4/M5 请求明确批准。                                  |

## 按阶段估算

| 阶段 | 实现与验证工作日（单人等效） | 最大不确定性                                                      |
| ---- | ---------------------------- | ----------------------------------------------------------------- |
| M1   | 1–2                          | 组件 focus/error 状态与字体批准。                                 |
| M1.5 | 3–5                          | 2–3 布局、Recipe 两位置、真实复杂数据、四档截图及用户迭代。       |
| M2   | 2–4                          | 状态所有权与 shared view 模板，避免旧装配双启动。                 |
| M3   | 7–12                         | 九域逐个双验收、动态模板和 popup 生命周期；只读耦合可能扩大等待。 |
| M4   | 3–5                          | 十类双通道、真实工程流程、环境差异、严格 ROI 和恢复检查。         |
| M5   | 1–2                          | 隔离主机、用户批准、清理/规范/handoff。                           |

后续合计约 **17–30 工作日**，按可评审阶段拆交付。遇到核心修改请求、真机差异或多轮原型改选，重新估算；不以 CSS 行数或 ID 数承诺提前完成。
