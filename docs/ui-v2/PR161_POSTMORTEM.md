# PR #161 复盘 — M0

审查日期：2026-10-09。主线基点 `fbbb2f9f3a585574e20ed706c34653164f13440c`；PR head `9dda779b7c74c83bbef9e8e7fcdbd8cc5d9682dd`，测试 merge `a1db8154fb75344e9fb842dda42ce46c1b41d2bb`。证据来自 [PR 描述与 diff](https://github.com/Xiaolong-6/WaferCAD/pull/161)、讨论接口、工作流 steps 和两个失败 job 的完整日志。读取时 PR 是 Open / Draft / REJECTED，未合并，14 个变更文件、1151 行新增、80 行删除；评论接口返回空列表，没有额外评论可佐证。

## 结论

失败有三个独立层面：工作区信息架构没有完成、响应式布局不成立、验收没有覆盖真实使用场景。后续 CI 还证实 interaction 与格式检查存在具体失败。因此不能归因为“只是 CSS 不好看”，也不能以专用截图脚本的绿色结果代表产品通过。

## 可复核证据

| 问题                   | 描述/diff/日志证据                                                                                                                                                                                                         | 对 r2 的影响                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 桌面空面板占用大块视野 | PR 自审记录 344px inspector + 52px rail，但空 History 只有小卡片；diff 的 wc-tool-width/wc-rail-width 对应 344/52，docked grid 强制 304–344px 面板列。                                                                     | 原型必须用填满的 History/多 Variant 和真实 Recipe，而不是只看空项目；面板宽度、折叠行为与科学视野一起审。          |
| 1024px 画布遮挡        | createIntelligentUi 的 dock 门槛为 1180px；1024px 自动回落到旧 overlay flyout，PR 自审确认挡住 canvas/Section。                                                                                                            | 1024px 是单独验收档，不能只做桌面/手机两套媒体查询。                                                               |
| 手机工作流缺失         | PR 自审记录约 340px flyout 覆盖 390px viewport，手机上仍显示无法实际 dock 的切换。diff 复用 workstation-tool-flyout。                                                                                                      | M1.5 要演示 view/edit/draw 的进出流程、参数提交和返回结果，不只缩小桌面面板。                                      |
| 导航和 Recipe 没有重构 | diff 保留五域 TOOL_META 和 Process 内 Recipe 模式，改滚动面板为独占 inspector，再外挂 command palette；图标 rail 仍依赖 tooltip。                                                                                          | M1.5 先比较 2–3 布局与 Recipe 两种位置，由用户选定；导航标签和状态所有权必须先定。                                 |
| CSS 层叠式迁移         | 增加 intelligent-ui.css，并在原 style.css/workstation.css 后加载，使用 intelligent-ui + workstation-ui-v2 guard 覆盖；增加 intelligent-ui.js，同时保留旧结构。                                                             | r2 的双入口和独立 token/组件/装配才是本次路线；旧资源保持原路径，避免再次全局叠加覆盖。                            |
| 测试场景不足           | intelligent-ui-regression 仅 1440/1024/390 三档，从 welcomeEmptyBtn 启动，打开 History、切 Mask、测 command palette 和桌面 dock rect，然后截屏；没有 768、M3D/Photodetector、Recipe Run All/失败恢复或 populated History。 | 这些测试能证明按钮响应，不能证明信息密度、遮挡、四视图、Recipe/History 流程合理。M1.5 和 M4 必须实测计划 §4。      |
| 测试适配混合了旧入口   | PR 修改 history-regression，将可见 continuation banner 改为状态存在并等 operationTools 可见，以适配独占面板；没有独立 v2 通道。                                                                                            | 该变更不自动证明几何断言被削弱，但旧测试与新 shell 的责任混合；r2 保持 legacy 原断言，另设 app-v2 URL/标记硬校验。 |
| 没有可用的隔离 Preview | 专用 workflow 上传静态包，尝试 raw.githack HEAD，并把请求置于 continue-on-error；PR 描述明确记录没有可用独立在线 Preview。                                                                                                 | 上传 ZIP 或 URL HEAD 不证明应用可启动；M5 需要真实独立主机，并实际打开。不能用生产 Pages 覆盖换取 Preview。        |

## CI 的具体结果

[早期截图运行 37896042401](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37896042401) 的 Build and browser-check UI review job 成功，包含截图上传。但 PR 描述明确记录其人工视觉检查失败。这里引用的是作者对真实 artifact 的自审记录；本轮没有下载或亲自复看该截图，不能声称完成独立视觉验收。

最新 head 对应的 [Browser regression 37896914877](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37896914877) 测试了 merge `a1db815…`：

- Smoke、Workstation、Resilience、History、Persistence 成功。
- Chromium targeted job `113710385289` 在 Interaction 失败。日志原因为 Main 的 3D ROI 垂直注册偏差 **1.7857142857142918px**，断言位置 `scripts/interaction-regression.mjs:651`。后续 Examples/Product Layout/Renderer 未执行。这是具体的运行时坐标契约失败，不是纯视觉主观意见。
- 独立 Process Geometry job 成功；625-site renderer/edge-on 两个 job skipped。成功范围不能延伸到未执行场景。

[M3D conformal baseline audit 37896914888](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37896914888) 的 Candidate quality job `113710301063`：lint 成功，format:check 失败。日志列出五个文件：`site/app.js`、`site/intelligent-ui.css`、`site/intelligent-ui.js`、`site/tests/intelligent-ui.test.mjs`、`scripts/intelligent-ui-regression.mjs`。随后 docs:check skipped。两个 scientific baseline job 和当前 layout job 成功，历史像素比较是 diagnostic，不构成新视觉批准。

最新 Quality `37896914955` 与 Intelligent UI review `37896914907` 成功；Example Recipe Reconstruction、Native Fig3 全量 replay skipped。Quality 的 check:ci 不含 format:check，这解释了“Quality 绿但 Candidate quality 红”。

## 原因边界与措施

ROI 偏移由日志证实，diff 同时改变了 canvas 可用尺寸和 panel 重挂/定位；缺少同环境的 base/head 对照复现，不能把具体根因直接断言为某条 CSS。将其列为迁移高风险，M3/M4 用原严格对齐断言复测，保持 renderer 只读。格式错误与视觉拒绝是两个不同问题，修格式不会让布局获得批准。

M0 只生成证据与契约；M1 验证浅色 token/组件状态；M1.5 必须先通过真实复杂工程、四档宽度、两类 Recipe 位置比较；M2 重写新入口的装配层；M3 每域功能/视觉双验收；M4 双通道保持原科学与存储断言；M5 再提供隔离 Preview 和申请入口切换。
