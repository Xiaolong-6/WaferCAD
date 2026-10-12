# Getting Started

[Home](Home) · [**First 10 Minutes: Hands-on Tutorial**](First-10-Minutes) · [Next: Workspace and Views](Workspace-and-Views)

## Choose an easy first task

**Never used a mask-based process editor?** Follow [First 10 Minutes](First-10-Minutes). It gives **exact values and the expected result after every Apply**: a 100 × 100 µm Base rectangle (treated as Si in this exercise), a 200 nm layer named SiO2 and a single etched window. You can draw the mask in the browser without importing any files.

**Prefer to explore first?** Open [WaferCAD](https://xiaolong-6.github.io/WaferCAD/), then select one of the eight example projects by clicking its **title or description** on the Welcome page. The preview shows a curated state; opening the project exposes History, Variants, Mask and process data. **The preview can appear before the full project finishes opening**: wait for the project to load and for 3D to finish rendering before editing. Avoid rerunning a Recipe until you have exported a personal backup.

![Photodetector example — genuine WaferCAD 3D preview](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/photodetector-literature-three.webp)

_Example preview; the ten-minute tutorial creates a much simpler geometry._

## How the workspace fits together

- **Project:** Select **New**, **Open**, **Save**, **Export** and **Recovery**. Under **Display**, choose the **XYZ unit** before typing dimensions.
- **Base:** In **Project → Base**, choose **Rectangle** or **Circle**, enter width/height/diameter and thickness, then click **Rebuild Base**. The legacy button is **Apply base**. Base is a generic starting geometry; its default layer is labeled **Base**.
- **Mask:** switch the Mask source from **File** to **Draw**, select **Rect** on the Mask canvas toolbar and drag a rectangle. No GDS/OAS file is required for the first tutorial.
- **Process → Manual:** Choose **Surface (Front/Back)**, **Operation**, **Area**, and an applicable layer/material and **Thickness / depth**; click **Apply** once. Leave **Also add to Recipe → No** for a manual-only exercise.
- **Main / Section A–B / 3D:** See a top view, a slice along A–B, and a rotatable 3D view. Move the A–B line through the feature you want to inspect.
- **Process → Recipe:** Collect several Process operations into an ordered procedure. Use **Validate** before execution and choose the starting state carefully.

**Section first:** When assessing deposition, etch, a void or an internal layer, inspect **Section A–B**. **Auto** fits XY and Z separately and may visually exaggerate the film thickness; **1:1** shows the same physical scale on both axes. 3D transparency and borders are display controls, not etch operations.

![Directional deposition — schematic Before and After](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/deposit-directional.svg?sanitize=true)

_Illustration of a directional film on a flat face; the geometry and scaling depend on your actual project._

## Four choices that change the outcome

- **Front vs Back:** which side of the device receives a manual operation. Recipe Code also supports `face: 'both'` for supported operations, with separate Front/Back layers. The current workstation's Manual Surface selector offers Front/Back.
- **Area:** **Whole face** applies without a mask; **Selected mask** acts within the current File/Draw mask; **Invert mask** acts in its complement.
- **Coverage / Profile:** **Directional** grows/etches along Z; **Conformal** deposition follows true exposed sidewalls; isotropic/undercut release removes material laterally.
- **Thickness and units:** Choose **XYZ display unit** first. `0.2` with unit **µm** means **200 nm**; it differs from `0.2` in **nm**. Base Thickness is physical substrate height; manual Process Thickness/depth represents film thickness or etch depth as applicable.

**Two distinct ROIs:** An active **Mask ROI** clips Process operations, **including Whole face**, as well as mask export. Clear it for a true full-face operation. A **3D ROI** (Main view) limits 3D inspection/GLB export, **not** Process. See [Masks and ROI](Masks-and-ROI).

## Keep your work safe

**Save** writes a browser-local Recovery checkpoint; **Export** downloads a portable `.wafercad` project. Clearing browser storage or changing devices can remove locally stored checkpoints. Export before switching devices, rebuilding a complex example or experimenting with Recipe replay.

**Recipe warning:** Running the same operation list on an already processed model changes it again. **Rebuild Base first (new Main)** is the clean-replay path, and replacing existing History needs a deliberate keep/clear decision. See [History, Variants and Recovery](History-Variants-and-Recovery).

## Next chapters

After the [ten-minute tutorial](First-10-Minutes), use [Workspace and Views](Workspace-and-Views), [Masks and ROI](Masks-and-ROI), the [illustrated Process Operations](Process-Operations) and [Troubleshooting](Troubleshooting). Advanced users can continue with [Using WaferCAD with AI](AI-Assisted-Workflows) or the [Recipe Code Tutorial](Recipe-Code-Tutorial).

**Model limit:** WaferCAD computes mask-conditioned geometric layers. Rough/Pyramid morphology is display-only; Implant/Electrical are annotations and Record does not execute thermal or chemical reactions. See [Examples and Modeling Limits](Examples-and-Modeling-Limits) before interpreting a reconstructed research device as a physical prediction.
