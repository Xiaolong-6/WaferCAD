# Process and Recipes

[Home](Home) · [Illustrated operations](Process-Operations)

## Manual Process

The Process panel has **Front/Back**, Action, Area, Coverage/Profile, material, thickness/depth and optional morphology fields. Under **Apply** is an inline Before → After schematic that changes with Action and submode. The text below it describes important edge cases. The card is a conceptual Section diagram, not a prediction from the current project.

The main Actions are **Deposit**, **Extend**, **Etch**, **Implant**, **Electrical**, and **Record**. The [Process Operations](Process-Operations) reference documents each supported submode, its inputs and modeling limits.

### Special cases

- **Conformal** covers horizontal surfaces and true sidewalls. It uses geometric normal-offset sidewall bands; it does not predict conformal growth kinetics.
- **Transfer / Laminate** has **Follow surface** (local exposed planes) and **Flat bridge** (one global plane spanning openings).
- **Directional Etch** can be unselective through continuous stack layers or material-selective, stopping at a different material.
- **Isotropic release** and **Undercut release** create canonical cavities. Rough/Pyramid forms are deterministic visual metadata on directional etch faces.
- **Planarize / CMP** removes material beyond an **absolute Z** plane, without adding fill.
- **Implant/Electrical** create separate annotations. **Record** only adds process metadata to History.

## Process Recipe

Switch from **Manual** to **Recipe** to build an ordered list of typed operations. The guided editor supports step creation, reorder, parameter inspection, validation and per-step execution. Its restricted Code editor is a declarative recipe format; it is **not** an arbitrary JavaScript execution environment.

Recipe uses the same Process worker/kernel as Manual. A Recipe is stored in the exported `.wafercad` project. Applying it again to an already processed model repeats its geometry operations; use the fresh-Base start option if you need a reproducible new lineage.

## Replay and versions

Recorded successful Manual operations can be added into Recipe. Older project files can use historical execution semantics, such as legacy Transfer defaulting to Flat bridge. Always distinguish historic saved behavior from current UI defaults.
