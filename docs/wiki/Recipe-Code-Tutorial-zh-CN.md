# WaferCAD Process Recipe 编程教程（中文）

[首页](Home) · [English tutorial](Recipe-Code-Tutorial) · [Process 与 Recipe](Process-and-Recipes) · [示例项目](Examples-and-Modeling-Limits)

本教程基于 `feat/process-recipe-v1` 的实际解析器和执行逻辑。**Recipe 是受限的声明式工艺语言，不是任意 JavaScript**。它与 Manual Process 复用几何 Kernel，适合从论文工艺描述生成可执行的逐步结构流程。它不计算真实工艺速率或电学性能。

## 一、五分钟编写第一个 Recipe

先在 Project 中准备好 Si 等材料的 **Base**。切换到 **Process → Recipe → Code**，粘贴：

~~~javascript
// 简单的氧化物 + ALD 钝化结构
snapshot("00 - Initial Si");
deposit({
  material: "SiO2",
  thickness: "200 nm",
  coverage: "directional",
  face: "front",
  area: "full"
});
snapshot("01 - Oxide");
deposit({
  material: "Al2O3",
  thickness: "30 nm",
  coverage: "conformal",
  face: "front",
  area: "full"
});
record({
  process: "anneal",
  label: "Post-deposition anneal",
  temperatureC: 350,
  durationMin: 30,
  ambient: "N2"
});
snapshot("02 - Passivated");
~~~

操作顺序：

1. 点击 **Apply code** 将文本正式应用到 Recipe Steps。
2. 点击 **Validate**，修复参数或依赖错误。
3. Start 选择 **Rebuild Base first (new Main)**。如出现 History 处理确认，应先理解其影响。
4. 点击 **Run All**，然后检查 Main、Section、3D、History 和 Snapshots。
5. 用 Export 导出完整 `.wafercad` 项目，再重新导入确认结构可以恢复。

这里的 `record()` 仅记录退火温度、时间等信息，**不会进行真实扩散、激活或氧化反应计算**。

## 二、核心语法和单位

标准形式为：

~~~javascript
deposit({
  material: "SiO2",
  thickness: "100 nm",
  coverage: "directional",
  area: "full"
});
~~~

支持对象、数组、字符串、数字、布尔值、null，以及 `//` 和 `/* ... */` 注释；不支持变量、循环、表达式或任意 JS 函数调用。

长度可以写 `"30 nm"`、`"0.5 µm"`、`"2 um"` 或 `"0.001 mm"`。**裸数字默认 µm**，建议显式写单位。

| 通用字段 | 可用值 | 含义 |
| --- | --- | --- |
| `face` | `"front"`、`"back"` | 加工正面或背面 |
| `area` | `"full"`、`"mask"`、`"invert"` | 全表面、Mask 区域或反选 |
| `mask` | File / Draw 上下文 | `mask` 与 `invert` 操作必需 |
| `thickness` / `depth` | 正长度 | 沉积、扩展、刻蚀或标记深度 |

**Mask ROI 会限制 Mask 工艺作用范围，Main ROI 不限制 Apply**。参阅 [Masks and ROI](Masks-and-ROI)。

## 三、七条支持的命令

| 命令 | 用途 | 主要参数 |
| --- | --- | --- |
| `deposit()` | 新材料沉积 | material、thickness、coverage |
| `extend()` | 增厚现有材料 | material、thickness、coverage |
| `etch()` | 刻蚀、释放或平坦化 | target、depth / targetZ、profile |
| `implant()` | 深度渐变注入标记 | name、depth、tilt |
| `electrical()` | 电学区域标记 | name、depth、regionType、source |
| `record()` | 非几何工艺记录 | process、label、temperatureC、durationMin |
| `snapshot()` | 命名快照 | 快照名称 |

### 1. Deposit 和 Extend

~~~javascript
deposit({
  material: "SiO2", thickness: "100 nm",
  coverage: "directional", area: "full"
});
extend({
  material: "SiO2", thickness: "50 nm",
  coverage: "conformal", area: "full"
});
deposit({
  material: "MoS2", thickness: "1 nm",
  coverage: "transfer", placement: "flat",
  area: "full"
});
~~~

- `directional`：主要覆盖暴露的水平面。
- `conformal`：在真实侧壁上构造几何包覆层。
- `transfer`：薄膜转移；`placement: "follow"` 沿局部表面，`"flat"` 形成跨桥平面。
- `extend` 的目标材料必须在已有模型或前面的步骤中存在，且目标表面实际暴露。

### 2. Etch

~~~javascript
deposit({ material: "SiO2", thickness: "500 nm" });
etch({
  target: "SiO2",
  depth: "200 nm",
  profile: "directional",
  area: "full"
});
~~~

`profile` 支持：

- `"directional"`：竖直刻蚀；省略 target 时对暴露的连续材料进行非选择性减材。
- `"isotropic"`：有侧向扩展的几何刻蚀；需明确 target。
- `"undercut"`：牺牲层横向底切；需明确 target。
- `"planarize"`：理想平坦化；使用 `targetZ` 指定**绝对 Z 平面**，不是刻蚀厚度。

例如 CMP：

~~~javascript
etch({
  profile: "planarize",
  targetZ: "2 µm",
  area: "full"
});
~~~

### 3. 黑硅、粗糙表面与金字塔

在定向刻蚀步骤中添加 `surface`：

~~~javascript
etch({
  target: "Si",
  depth: "2 µm",
  profile: "directional",
  area: "full",
  surface: {
    morphology: "rough",
    polarity: "normal",
    featureSize: "500 nm",
    meanHeight: "1 µm",
    featureCv: 0.25,
    heightCv: 0.30,
    seed: 12345
  }
});
~~~

- `morphology`：`rough`、`stochastic` 或 `pyramid`。
- `polarity`：`normal` 外凸尖峰，`inverted` 内凹谷底。
- `featureSize`：平均横向特征尺寸。
- `meanHeight`：平均特征高度，不能大于当前刻蚀深度。
- `featureCv` 与 `heightCv`：变异系数，可写 0.25 或 25（即 25%）。
- `seed`：可重复显示形貌的非负 32 位随机种子。

**重要边界：当前 rough/pyramid 是显示形貌元数据。后续 Process 仍针对理想几何栈运算，不能把显示尖峰直接当作真实结构求解结果。**

### 4. Implant、Electrical、Record、Snapshot

~~~javascript
implant({
  name: "B implant", depth: "300 nm",
  tilt: 7, area: "full"
});
electrical({
  name: "Induced p-layer", depth: "50 nm",
  regionType: "p-inversion",
  source: "induced", area: "full"
});
record({
  process: "anneal",
  label: "Activation record",
  temperatureC: 1000,
  durationMin: 1,
  ambient: "N2"
});
snapshot("After activation");
~~~

Implant 是结构注入标记（倾角 −80° 至 +80°），不求剂量、能量及扩散。Electrical 是电学区域示意，支持 p/n 型、反型、积累、耗尽等，**不求电场或载流子分布**。Record 和 Snapshot 不增加物理材料层。

## 四、Mask 引用：真正复现器件工艺的关键

先在 Mask 中导入 GDSII/OASIS，再从项目里的真实 Cell / Layer 选择相应版图。

~~~javascript
// 运行前必须有 TOP Cell 和 3/0 图层
deposit({
  material: "SiO2", thickness: "200 nm", area: "full"
});
etch({
  target: "SiO2", depth: "200 nm",
  profile: "directional", area: "mask",
  mask: {
    source: "file",
    cell: "TOP",
    layers: ["3|0"]
  }
});
snapshot("Contact opening");
~~~

`"3|0"` 是 GDS Layer 3、Datatype 0；`"3/0"` 也会归一化。每个使用 `area: "mask"` 或 `"invert"` 的 Step 必须提供有效 Mask 上下文。

**Draw Mask 的推荐操作：** 先在 Mask 视图手动画 Rectangle/Circle/Polygon/Ring/Sector；再在 Recipe Steps 中选该步骤，点击 **Use current Mask** 捕获选中的图形、ROI、坐标变换等；切换 Code 即可查看可序列化的 `drawMask` 对象。单独写 `{ source: "draw" }` 而没有 shapes 不会通过预检。

每个步骤捕获自己的 Mask：以后改变当前 Mask 选择，并不会自动改写已经捕获的步骤。

## 五、实例：简化的 Si 探测器开窗、注入及钝化

准备条件：Si Base；GDS 中有 `TOP` Cell 和 `3|0` 接触开窗层。本例仅用于验证 Recipe 语法与几何 Kernel，**不代表完整的真实器件制造流程**。

~~~javascript
snapshot("00 - Si Base");
deposit({
  material: "SiO2", thickness: "200 nm", area: "full"
});
snapshot("01 - Oxide");
etch({
  target: "SiO2", depth: "200 nm",
  profile: "directional", area: "mask",
  mask: { source: "file", cell: "TOP", layers: ["3|0"] }
});
implant({
  name: "B Implant", depth: "300 nm", tilt: 0,
  area: "mask",
  mask: { source: "file", cell: "TOP", layers: ["3|0"] }
});
record({
  process: "anneal", label: "Activation record",
  temperatureC: 1000, durationMin: 1, ambient: "N2"
});
deposit({
  material: "Al2O3", thickness: "30 nm",
  coverage: "conformal", area: "full"
});
snapshot("02 - Passivated");
~~~

点击 **Apply code → Validate → Rebuild Base first → Run All**，逐步核对截面和掩膜作用范围。如果要研究实际文献器件，请进一步查看 [欢迎页已有的五个 Example 家族](Examples-and-Modeling-Limits) 和相应来源说明。

## 六、重建与验收注意事项

1. **Validate 通过仅证明参数和部分依赖检查通过**，不保证几何、科学物理或全部步骤重建成功。
2. **Continue current model** 会在现有结构上再次运行，可能重复沉积；完整重建优先选 **Rebuild Base first (new Main)**。
3. **Replay 1 → Step** 会从 Step 1 重新运行到选中的步骤，不是从上次结果继续。
4. **Stop** 不会回滚已经提交的 Steps。
5. 全部执行完成后检查 Main、Section、3D、History、Variants 和 Snapshot，导出 `.wafercad` 并重新导入，独立测试 Mask 导出。
6. 若出现缺少材料、Layer 或 Cell 错误，检查材料名称、起始 Base、真实 Mask Layer/Datatype、坐标变换及 Mask ROI。
7. 625-site 全晶圆文件包含 History 不等于已经证明所有步骤在整个阵列上重新由 Kernel 计算；应以单独的 full replay 验收结果为准。

## 七、当前 v1 的限制

现在只有七种命令。**不支持**在脚本中直接创建全新 Mask 图元、参数变量、循环阵列、条件分支、外部 JS。Mask 应从现有版图导入或在 UI 绘制后捕获。诸如 `parameter()`、`mask()`、`for(...)` 均属于未来可能的语法设计，不能在当前 Code 编辑器中运行。

完整英文命令说明、流程和源码链接见 [English Recipe Code Tutorial](Recipe-Code-Tutorial)，所有工艺模式的图示见 [Process Operations](Process-Operations)。
