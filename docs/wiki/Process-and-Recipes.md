# Process and Recipes

[Home](Home) · [Recipe Code Tutorial](Recipe-Code-Tutorial) · [中文教程](Recipe-Code-Tutorial-zh-CN) · [Illustrated operations](Process-Operations)

## Manual Process

![Conformal deposition before and after](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/deposit-conformal.svg?sanitize=true)

_The same schematic geometry source is used here and in the expandable Process guide. These drawings do not depict the currently opened project._

**New to Process?** Follow the [First 10 Minutes](First-10-Minutes) walkthrough for exact controls, numbers and before/after checks. The live Process panel now uses a single **Operation** selector; archived screenshots from the older multi-button layout should not be used to identify current controls.

The **Step** mode has Front/Back, one **Operation** selector, Area, Coverage/Profile, material, thickness/depth and optional morphology fields. **Apply** performs the current operation. **Also add to Recipe** controls whether a successful Step-mode operation is appended to the Recipe. Below Apply, **How it works** expands a conceptual Before → After schematic and caveats; it is not a live prediction from the current project.

The main Actions are **Deposit**, **Extend**, **Etch**, **Implant**, **Electrical**, and **Record**. The [Process Operations](Process-Operations) reference documents each supported submode, its inputs and modeling limits.

### Special cases

- **Conformal** covers horizontal surfaces and true sidewalls. It uses geometric normal-offset sidewall bands; it does not predict conformal growth kinetics.
- **Transfer / Laminate** has **Follow surface** (local exposed planes) and **Flat bridge** (one global plane spanning openings).
- **Directional Etch** can be unselective through continuous stack layers or material-selective, stopping at a different material.
- **Isotropic release** and **Undercut release** create canonical cavities. Rough/Pyramid forms are deterministic visual metadata on directional etch faces.
- **Planarize / CMP** removes material beyond an **absolute Z** plane, without adding fill.
- **Implant/Electrical** create separate annotations. **Record** only adds process metadata to History.

## Process Recipe

Switch from **Step** to **Recipe** to build an ordered list of typed operations. The Recipe panel separates step building, readiness checking and execution. Template selection only previews its steps; **Load template** must be clicked to apply it, and replacing an existing Recipe requires another explicit confirmation. **Cancel** leaves the Recipe unchanged. An existing Recipe can be restored with **Undo** during the same editing session; that Undo stack is not a persistent version archive. The guided editor supports step creation, reorder, parameter inspection, validation and per-step execution. Its restricted Code editor is a declarative recipe format; it is **not** an arbitrary JavaScript execution environment.

Recipe uses the same Process worker/kernel as Manual. Typed physical lengths retain their exact normalized µm values independently of the Manual editing grid and current display unit; nonfinite conversions are rejected. A Recipe is stored in the exported `.wafercad` project. Applying it again to an already processed model repeats its geometry operations; use the fresh-Base start option if you need a reproducible new lineage.

**Learn the syntax:** Follow the [complete Recipe Code Tutorial](Recipe-Code-Tutorial) (also available [in Chinese](Recipe-Code-Tutorial-zh-CN)). It includes a copy-ready oxide/ALD example, all seven supported commands, Mask capture, rough/pyramid morphology, a masked contact-window flow, and Run All/replay checks. Code drafts must be applied with **Apply code** before execution, and `area: "mask"` / `"invert"` steps require a captured File or Draw Mask context.

**Starting state:** **Continue current model** appends changes to the current geometry. **Rebuild Base first (new Main)** is the clean-replay option, subject to the confirmation and History handling. **Replay 1 → Step** replays the prefix from Step 1; **Stop** retains steps that already committed.

## Replay and versions

Successful Step-mode operations can be added into Recipe when **Also add to Recipe** is enabled. Older project files can use historical execution semantics, such as legacy Transfer defaulting to Flat bridge. Always distinguish historic saved behavior from current UI defaults.
