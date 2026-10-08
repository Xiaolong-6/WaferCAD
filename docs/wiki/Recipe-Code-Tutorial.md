# Process Recipe Code Tutorial

[Home](Home) · [Process and Recipes](Process-and-Recipes) · [Examples](Examples-and-Modeling-Limits) · [中文教程](Recipe-Code-Tutorial-zh-CN)

WaferCAD Recipe v1 is a **restricted, declarative process language**. Each command describes a step executed through the same Process Geometry Kernel used by the Manual panel. It is not general JavaScript and it is not calibrated TCAD. This tutorial documents the implementation on `feat/process-recipe-v1`.

## 1. Five-minute quick start

Begin with a project containing a suitable **Base** substrate (for example, Si); applying a Recipe does not create the Base. Navigate to **Process → Recipe → Code**, paste:

```javascript
// Simple oxide and ALD passivation
snapshot('00 - Si Base');
deposit({
  material: 'SiO2',
  thickness: '200 nm',
  coverage: 'directional',
  face: 'front',
  area: 'full',
});
snapshot('01 - Oxide');
deposit({
  material: 'Al2O3',
  thickness: '30 nm',
  coverage: 'conformal',
  face: 'front',
  area: 'full',
});
record({
  process: 'anneal',
  label: 'Post-deposition anneal',
  temperatureC: 350,
  durationMin: 30,
  ambient: 'N2',
});
snapshot('02 - Passivated');
```

1. Click **Apply code** to commit the text into the editable Steps list.
2. Click **Validate**. Fix errors before running.
3. For a fresh rebuild, choose **Start → Rebuild Base first (new Main)**. The confirmation/history choice matters: inspect it before accepting.
4. Click **Run All**. Inspect each state in **Main**, **Section**, **3D**, **History**, and **Snapshots**.
5. **Export** the resulting `.wafercad` project and re-import it to verify portability.

The example assumes a Si Base already exists. The `record()` command stores process metadata; it does **not** anneal or diffuse material.

## 2. Syntax and units

Each statement is `command({ key: value, ... });`; `snapshot("Name");` is shorthand for a snapshot. Statements may contain line comments (`//`) and block comments (`/* ... */`), strings, numbers, arrays, objects, `true`, `false`, and `null`.

Valid lengths include `"30 nm"`, `"0.5 µm"`, `"2 um"`, and `"0.001 mm"`. Bare numbers use **µm**; including units explicitly is safer. Thickness/depth must be positive for ordinary steps. Planarize instead accepts an **absolute Z coordinate**.

The parser deliberately rejects variables, expressions, loops, arbitrary function calls, and undeclared commands. It enforces source/step/structure budgets. The code editor is for **literal process descriptions**, not a JavaScript interpreter.

### Shared parameters

| Field                 | Values                         | Meaning                                          |
| --------------------- | ------------------------------ | ------------------------------------------------ |
| `face`                | `"front"`, `"back"`            | Which exposed face is processed (default: front) |
| `area`                | `"full"`, `"mask"`, `"invert"` | Entire face, selected Mask, or complement        |
| `mask`                | Captured File/Draw context     | Required for masked or inverted steps            |
| `thickness` / `depth` | Positive physical length       | How much to deposit, extend, etch, or annotate   |

A **Mask ROI** clips masked Process operations; a **Main ROI** controls inspection/export view and does not limit Apply. See [Masks and ROI](Masks-and-ROI).

## 3. Command reference

| Command             | Required or principal fields                  | Notes                                                  |
| ------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `deposit({...})`    | `material`, `thickness`, `coverage`           | New material; `directional`, `conformal`, `transfer`   |
| `extend({...})`     | `material`, `thickness`, `coverage`           | Material must already exist and have an exposed target |
| `etch({...})`       | `depth` or `targetZ`, `profile`               | `directional`, `isotropic`, `undercut`, `planarize`    |
| `implant({...})`    | `name`, `depth`, optional `tilt`              | Structural annotation; tilt from −80° to +80°          |
| `electrical({...})` | `name`, `depth`, `regionType`, `source`       | Non-material electrical region                         |
| `record({...})`     | `process`, `label`, optional thermal metadata | History entry only; no geometric reaction              |
| `snapshot("...")`   | Milestone name                                | Named inspection/restoration marker                    |

### Deposit, Extend and Transfer

```javascript
deposit({
  material: 'SiO2',
  thickness: '100 nm',
  coverage: 'directional',
  area: 'full',
});
extend({
  material: 'SiO2',
  thickness: '50 nm',
  coverage: 'conformal',
  area: 'full',
});
deposit({
  material: 'MoS2',
  thickness: '1 nm',
  coverage: 'transfer',
  placement: 'flat',
  area: 'full',
});
```

Directional covers exposed horizontal surfaces. Conformal also creates ideal geometric sidewall bands. For transfer, `placement: "follow"` follows local exposed planes; `"flat"` places a global bridge plane. Neither models deposition kinetics or mechanical sag.

### Etch, release and planarization

```javascript
deposit({ material: 'SiO2', thickness: '500 nm', area: 'full' });
etch({
  target: 'SiO2',
  depth: '150 nm',
  profile: 'directional',
  area: 'full',
});
etch({
  target: 'SiO2',
  depth: '100 nm',
  profile: 'isotropic',
  area: 'full',
});
```

An omitted `target` in directional etch means unselective geometric removal through exposed adjacent materials. `isotropic` and `undercut` require an explicit existing `target`. For CMP, use `etch({ profile: "planarize", targetZ: "2 µm", area: "full" });` (absolute model Z, **not** removed thickness). See [Process Operations](Process-Operations) for modeling details.

### Rough and pyramid appearance

Rough/Pyramid are attributes of **directional etch**. They are deterministic display morphology and do not change the ideal geometry processed by later kernel operations.

```javascript
etch({
  target: 'Si',
  depth: '2 µm',
  profile: 'directional',
  area: 'full',
  surface: {
    morphology: 'rough',
    polarity: 'normal',
    featureSize: '500 nm',
    meanHeight: '1 µm',
    featureCv: 0.25,
    heightCv: 0.3,
    seed: 12345,
  },
});
```

`morphology` accepts `"rough"` / `"stochastic"` or `"pyramid"`; `polarity` is `"normal"` (outward peaks) or `"inverted"` (recessed pits). `featureSize` and `meanHeight` are positive lengths, `meanHeight` cannot exceed directional etch depth, CV values are 0–1 or percentages 0–100, and `seed` is a non-negative 32-bit integer.

### Implant, Electrical, Record and Snapshot

```javascript
implant({
  name: 'B implant',
  depth: '300 nm',
  tilt: 7,
  area: 'full',
});
electrical({
  name: 'Induced p-layer',
  depth: '50 nm',
  regionType: 'p-inversion',
  source: 'induced',
  area: 'full',
});
record({
  process: 'anneal',
  label: 'Activation',
  temperatureC: 1000,
  durationMin: 1,
  ambient: 'N2',
});
snapshot('After activation');
```

Implant marks a depth-graded area but does not simulate dose, energy, activation, or diffusion. Electrical marks a region; it does not solve electrostatics. Record keeps chronological metadata without mutating geometry. For `regionType` the editor offers p/n type, inversion, accumulation, depletion and custom; `source` includes induced, doped, interface and custom.

## 4. Mask-specific recipes

**File Mask:** Import a GDSII/OASIS layout first. The Cell and layer/datatype must actually exist. For example `"3|0"` means GDS layer 3 / datatype 0; `"3/0"` is also normalized.

```javascript
// Requires a loaded layout with Cell TOP and layer 3/datatype 0.
deposit({
  material: 'SiO2',
  thickness: '200 nm',
  area: 'full',
});
etch({
  target: 'SiO2',
  depth: '200 nm',
  profile: 'directional',
  area: 'mask',
  mask: {
    source: 'file',
    cell: 'TOP',
    layers: ['3|0'],
  },
});
snapshot('Oxide contact window');
```

**Draw Mask:** Use the Mask view to draw Rectangle, Circle, Polygon, Ring or Ring Sector, then in the target Recipe Step choose **Area: Selected mask** and click **Use current Mask**. WaferCAD captures the actual `drawMask` shapes, optional ROI, transform and selection into that Step. Switch to **Code** to inspect/copy its serialized context. A `mask: { source: "draw" }` object alone is incomplete: it needs captured shapes.

A separate Mask context is stored on **each** masked Step, so two steps may use different Cells, layers, Draw shapes or ROIs. Editing today's Mask selection does not automatically rewrite previously captured step contexts. To avoid oversized and hard-to-maintain code, capture complex geometry through UI rather than transcribing shape internals by hand.

## 5. Worked device: simplified Si contact-window flow

Prerequisites: Si Base; imported File Mask Cell `TOP` containing layer `3|0`. This illustrates recipe syntax and geometry; it is **not** a validated real photodiode manufacturing protocol.

```javascript
snapshot('00 - Si Base');
deposit({
  material: 'SiO2',
  thickness: '200 nm',
  coverage: 'directional',
  area: 'full',
});
snapshot('01 - Oxide');
etch({
  target: 'SiO2',
  depth: '200 nm',
  profile: 'directional',
  area: 'mask',
  mask: { source: 'file', cell: 'TOP', layers: ['3|0'] },
});
implant({
  name: 'B implant',
  depth: '300 nm',
  tilt: 0,
  area: 'mask',
  mask: { source: 'file', cell: 'TOP', layers: ['3|0'] },
});
record({
  process: 'anneal',
  label: 'Activation record',
  temperatureC: 1000,
  durationMin: 1,
  ambient: 'N2',
});
deposit({
  material: 'Al2O3',
  thickness: '30 nm',
  coverage: 'conformal',
  area: 'full',
});
snapshot('02 - Passivated');
```

After **Apply code → Validate → Rebuild Base first → Run All**, inspect the mask footprint and true exposed materials in Section. If you want a full literature reconstruction, open a [bundled example](Examples-and-Modeling-Limits) and inspect its History/Variants and provenance instead.

## 6. Reliable replay and troubleshooting

- **Apply code** commits a draft; **Format** first applies valid code. Unapplied drafts block execution. Use **Validate** before replay.
- **Steps** and **Code** represent one ordered Recipe; adding/reordering steps in the guided editor updates the serialized code.
- **Continue current model** re-applies operations to the existing geometry and may duplicate films. **Rebuild Base first (new Main)** is the preferred clean-run path when the Base and imported Masks are correct; handle the History confirmation deliberately.
- **Replay 1 → Step** always executes from Step 1 to the selected Step, using the chosen start model. It is not a resume command.
- **Stop** requests cancellation; previously committed Steps remain. Do not treat Stop as transaction rollback.
- Preflight checks material dependencies and the existence of captured mask layers/Cells where verification is possible. A green Validate is **not** scientific, geometric, visual, or full-project replay certification.
- For missing layer errors, confirm the imported Cell/layer key (e.g. `7|2`), actual Mask geometry, its transform, and any Mask ROI.
- For missing material errors, check exact material names, exposure, preceding deposits, and whether a rebuilt Base would remove the needed material.
- Before calling a bundled project reproducible, run all Steps from its intended Base, verify Main/Section/3D, inspect Variant heads and snapshots, export the `.wafercad` file, re-import it, and independently export its Mask(s).
- Full-wafer array assembly and a stored 40-Step History do not alone prove that all Steps were freshly recomputed on the 625-site wafer. Check the relevant replay acceptance report.

## 7. Current v1 boundary and future syntax

The Recipe parser accepts **seven commands only**: deposit, extend, etch, implant, electrical, record and snapshot. It cannot declare new masks from geometric primitives, use named recipe variables, iterate wafer arrays, or branch conditionally. Prepare/capture Masks in the UI or supply an imported layout. Do not paste proposed `parameter()`, `mask()`, or `for` constructs into the v1 editor.

Source reference: [Recipe parser](https://github.com/Xiaolong-6/WaferCAD/blob/main/site/process-recipe.js), [Recipe execution controller](https://github.com/Xiaolong-6/WaferCAD/blob/main/site/controllers/process-recipe-controller.js), [Recipe tests](https://github.com/Xiaolong-6/WaferCAD/blob/main/site/tests/process-recipe.test.mjs).

For all manual submodes and visual diagrams, continue with [Process Operations](Process-Operations).
