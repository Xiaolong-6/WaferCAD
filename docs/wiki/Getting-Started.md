# Getting Started

[Home](Home) · [Next: Workspace and Views](Workspace-and-Views)

## Build a first masked contact

![Photodetector example — genuine WaferCAD 3D preview](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/photodetector-literature-three.webp)

*Representative structural output from the bundled example. This introductory procedure creates a much simpler structure.*

1. Open the [WaferCAD workspace](https://xiaolong-6.github.io/WaferCAD/) and start a new project or an example. The **Project** tab contains base setup and project commands.
2. Choose a circular or rectangular substrate, set its planar size and physical Z thickness, then use **Apply base**.
3. Open **Mask** and choose **File** to import a GDSII/OASIS layout or switch to **Draw** to create a Rectangle, Circle, Polygon, Ring, or Ring Sector.
4. Select a cell and layer in File mode, or draw a local shape in Draw mode.
5. Open **Process**, select **Front** (or **Back**), choose **Deposit**, **Etch**, **Extend**, **Implant**, **Electrical**, or **Record**.
6. Pick an **Area**: Selected mask, Invert mask or Whole face. If a Mask ROI is set, masked operations are confined to that area.
7. Set the material, coverage/profile and physical thickness/depth. Inspect the **Before → After** schematic immediately below Apply.
8. Click **Apply** and inspect **Main**, **Section A–B**, and **3D**. Use Undo/Redo or History to inspect earlier steps.
9. **Save** creates a local Recovery checkpoint. **Export** downloads a portable `.wafercad` project file. Export before moving machines or clearing browser data.

## Verify the structure

After Apply, inspect **Section A–B** before trusting a 3D appearance. In particular, check whether the mask opened the intended region and whether the new layer covers horizontal faces or also real sidewalls.

![Directional deposition — schematic Before and After](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/deposit-directional.svg)

For coating on real sidewalls, compare the [Conformal deposition example](Process-Operations#deposit-conformal).

## Units and scale

Coordinates are stored in **µm**. The UI can display nm, µm or mm. Section Auto scaling and 3D Z exaggeration help visualization; they do not alter the physical stack.

## What to expect

A simple directional deposition adds a layer on selected exposed horizontal surfaces. Conformal coating also follows genuine sidewalls. Directional etch removes material vertically. Always inspect Section to check where physical interfaces and voids ended up.

## Next steps

Learn [Mask and ROI semantics](Masks-and-ROI), the [Process Operations](Process-Operations) guide, and the [Recipe Code Tutorial](Recipe-Code-Tutorial) ([中文](Recipe-Code-Tutorial-zh-CN)) before reproducing a literature device. The [Examples catalog](Examples-and-Modeling-Limits) lists every family currently promoted on Welcome.
