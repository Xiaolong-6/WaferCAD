# Getting Started

[Home](Home) · [**First 10 Minutes: Hands-on Tutorial**](First-10-Minutes) · [Next: Workspace and Views](Workspace-and-Views)

## Choose an easy first task

**Never used a mask-based process editor?** Follow [First 10 Minutes](First-10-Minutes). It gives **exact values and the expected result after every Apply**: a 100 × 100 µm silicon rectangle, a 200 nm oxide layer and a single etched window. You can draw the mask in the browser without importing any files.

**Prefer to explore first?** Open [WaferCAD](https://xiaolong-6.github.io/WaferCAD/), then select one of the six example projects by clicking its **title or description** on the Welcome page. The preview shows a curated state; opening the project exposes History, Variants, Mask and process data. Avoid rerunning a Recipe until you have exported a personal backup.

![Photodetector example — genuine WaferCAD 3D preview](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/photodetector-literature-three.webp)

_Example preview; the ten-minute tutorial creates a much simpler geometry._

## How the workspace fits together

| Where                       | What you do                                                                                            | How to check                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| **Project**                 | Define the substrate with **Base → Apply base**; Save/Export the project.                              | Main shows the substrate; Section shows its thickness.                   |
| **Mask**                    | Import **File** layout or click **File** to change to **Draw**, then create a Rect/Circle/other shape. | The active mask is visible over the wafer reference.                     |
| **Process → Step**          | Choose **Front/Back**, **Operation**, **Area**, material/layer and a Z value; click **Apply** once.    | History advances, and Main/Section/3D show the changed structure.        |
| **Main / Section A–B / 3D** | Inspect the top view, an A–B cross-section, and a rotatable 3D reconstruction.                         | Move the A–B line through the feature you want to inspect.               |
| **Process → Recipe**        | Collect and execute several operations together.                                                       | Use **Validate** first and choose the intended start model deliberately. |

**Section first:** When assessing deposition, etch, a void or an internal layer, inspect **Section A–B**. **Auto** fits XY and Z separately and may visually exaggerate the film thickness; **1:1** shows the same physical scale on both axes. 3D transparency and borders are display controls, not etch operations.

![Directional deposition — schematic Before and After](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/deposit-directional.svg?sanitize=true)

_Illustration of a directional film on a flat face; the geometry and scaling depend on your actual project._

## Four choices that change the outcome

- **Front vs Back:** which side of the device receives the operation.
- **Area:** **Whole face** applies without a mask; **Selected mask** acts within the current File/Draw mask; **Invert mask** acts in its complement.
- **Coverage / Profile:** **Directional** grows/etches along Z; **Conformal** deposition follows true exposed sidewalls; isotropic/undercut release removes material laterally.
- **Z and units:** Choose **XYZ unit** first. `0.2` with unit **µm** means **200 nm**; it is different from `0.2` with unit **nm**. The base Z is a physical thickness; Process Z typically means film thickness or etch depth.

**Two distinct ROIs:** A **Mask ROI** limits selected/inverted-mask processing and mask export. A **Main ROI** limits 3D inspection/GLB export, **not** Process. See [Masks and ROI](Masks-and-ROI).

## Keep your work safe

**Save** writes a browser-local Recovery checkpoint; **Export** downloads a portable `.wafercad` project. Clearing browser storage or changing devices can remove locally stored checkpoints. Export before switching devices, rebuilding a complex example or experimenting with Recipe replay.

**Recipe warning:** Running the same operation list on an already processed model changes it again. **Rebuild Base first (new Main)** is the clean-replay path, and replacing existing History needs a deliberate keep/clear decision. See [History, Variants and Recovery](History-Variants-and-Recovery).

## Next chapters

After the [ten-minute tutorial](First-10-Minutes), use [Workspace and Views](Workspace-and-Views), [Masks and ROI](Masks-and-ROI), the [illustrated Process Operations](Process-Operations) and [Troubleshooting](Troubleshooting). Advanced users can continue to the [Recipe Code Tutorial](Recipe-Code-Tutorial) or [中文教程](Recipe-Code-Tutorial-zh-CN).

**Model limit:** WaferCAD computes mask-conditioned geometric layers. Rough/Pyramid morphology is display-only; Implant/Electrical are annotations and Record does not execute thermal or chemical reactions. See [Examples and Modeling Limits](Examples-and-Modeling-Limits) before interpreting a reconstructed research device as a physical prediction.
