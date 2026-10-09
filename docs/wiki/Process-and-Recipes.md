# Process and Recipes

[Home](Home) · [Recipe Code Tutorial](Recipe-Code-Tutorial) · [中文教程](Recipe-Code-Tutorial-zh-CN) · [Illustrated operations](Process-Operations)

## Manual Process

![Conformal deposition before and after](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/deposit-conformal.svg?sanitize=true)

_The same schematic geometry source is used here and in the expandable Process guide. These drawings do not depict the currently opened project._

**New to Process?** Follow the [First 10 Minutes](First-10-Minutes) walkthrough for exact controls, numbers and before/after checks. The live Process panel now uses a single **Operation** selector; archived screenshots from the older multi-button layout should not be used to identify current controls.

The **Step** form places **Operation** and **Surface** selectors side by side. A contextual parameter heading follows: **Area** and material/target fields span the form, and **Coverage** and **Thickness** share a row for applicable operations. **Apply** performs the selected operation. **Also add to Recipe** is unchecked by default, requiring explicit opt-in to append a successful manual Step to Recipe; History is still recorded. **How it works** expands conceptual Before → After diagrams and caveats, not a live simulation of the opened project.

The main Actions are **Deposit**, **Extend**, **Etch**, **Implant**, **Electrical**, and **Record**. An active **Mask ROI** clips even **Whole face** Process operations; clear it before applying truly wafer-wide steps. The [Process Operations](Process-Operations) reference documents each supported submode, its inputs and modeling limits.

### Special cases

- **Conformal** covers horizontal surfaces and true sidewalls. It uses geometric normal-offset sidewall bands; it does not predict conformal growth kinetics.
- **Transfer / Laminate** has **Follow surface** (local exposed planes) and **Flat bridge** (one global plane spanning openings).
- **Directional Etch** can be unselective through continuous stack layers or material-selective, stopping at a different material.
- **Isotropic release** and **Undercut release** create canonical cavities. Rough/Pyramid forms are deterministic visual metadata on directional etch faces.
- **Planarize / CMP** removes material beyond an **absolute Z** plane, without adding fill.
- **Implant/Electrical** create separate annotations. **Record** only adds process metadata to History.

## Process Recipe

Switch from **Step** to **Recipe** to build an ordered list of typed operations. The Recipe panel separates step building, readiness checking and execution. Template selection only previews its steps; **Load template** must be clicked to apply it, and replacing an existing Recipe requires another explicit confirmation. **Cancel** leaves the Recipe unchanged. An existing Recipe can be restored with **Undo** during the same editing session; confirmed replacement also saves the previous project and Recipe in browser-local **Recovery** before committing the new template. The Undo stack is not a persistent version archive. An unapplied Code draft is not included in Recovery, so apply or copy it before replacement. The guided editor supports step creation, reorder, parameter inspection, validation and per-step execution. Its restricted Code editor is a declarative recipe format; it is **not** an arbitrary JavaScript execution environment.

Recipe uses the same Process worker/kernel as Manual. Typed physical lengths retain their exact normalized µm values independently of the Manual editing grid and current display unit; nonfinite conversions are rejected. A Recipe is stored in the exported `.wafercad` project. Applying it again to an already processed model repeats its geometry operations; use the fresh-Base start option if you need a reproducible new lineage.

**Learn the syntax:** Follow the [complete Recipe Code Tutorial](Recipe-Code-Tutorial) (also available [in Chinese](Recipe-Code-Tutorial-zh-CN)). It includes a copy-ready oxide/ALD example, all seven supported commands, Mask capture, rough/pyramid morphology, a masked contact-window flow, and Run All/replay checks. Code drafts must be applied with **Apply code** before execution, and `area: "mask"` / `"invert"` steps require a captured File or Draw Mask context.

**Starting state:** **Continue current model** appends changes to the current geometry. **Rebuild Base first (new Main)** is the clean-replay option, subject to the confirmation and History handling. **Replay 1 → Step** replays the prefix from Step 1; **Stop** retains steps that already committed.

## Geometry Diagnostics

Expand **Geometry Diagnostics** in the Process tab and click **Analyze geometry** to inspect the **current** canonical model without creating a History node or editing the Recipe. The analysis worker reports per-material geometric volumes and min/max local Z-segment thicknesses; it also checks nonpositive Z intervals, missing layer references, overlaps within one region's Z stack, non-overlapping XY region ownership, and XY void/crack classification using the Conformal topology tolerance.

An empty Z interval between two materials is reported as a **cavity observation**, not automatically a fabrication defect. A canonical uncovered XY opening is also an observation; an uncovered sub-grid slit is flagged as a possible numerical crack. Large/complex geometry may exceed the explicit coverage budget, in which case this check is shown as incomplete. Reports include representative XY bounds and Z intervals, when available. After changing the model, rerun Analyze: earlier results are marked stale.

For a canonical wafer array, volumes and region counts are weighted across _all_ instances; the XY overlap test runs within each referenced template and **does not certify boundaries between adjacent array instances**. A complexity limit or a polygon error explicitly marks overlap coverage incomplete. “No findings” means only that the implemented geometry checks did not detect issues. This is not a process intent, transport physics, Rough/Pyramid microgeometry, Implant concentration or electrical validation.

Current limitations and staged proposals are documented in the [geometry/process roadmap](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/PROCESS_GEOMETRY_ROADMAP_2026-10-09.md).

## Replay and versions

Successful Step-mode operations can be added into Recipe when **Also add to Recipe** is enabled. Older project files can use historical execution semantics, such as legacy Transfer defaulting to Flat bridge. Always distinguish historic saved behavior from current UI defaults.
