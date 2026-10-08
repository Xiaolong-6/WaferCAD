# WaferCAD · Product User Manual

**WaferCAD** is a browser-based visual editor for **building and inspecting layered semiconductor structures**. You can start with a silicon wafer, draw or import a mask, and apply Deposit, Etch and other operations. **No installation is required.**

[**Open WaferCAD**](https://xiaolong-6.github.io/WaferCAD/) · [**Try the 10-minute tutorial**](First-10-Minutes) · [Browse example devices](Examples-and-Modeling-Limits)

![Real 3D view from the shipped Photodetector example](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/photodetector-literature-three.webp)

_Real preview of a bundled device. Your first structure will be simpler._

## Choose your path

| I want to… | Start here |
| --- | --- |
| **See what WaferCAD can do without editing** | [Explore a ready-made example](Examples-and-Modeling-Limits#how-to-explore-or-reproduce-an-example); click the **title or description** of an example on Welcome. |
| **Build something for the first time** | [First 10 Minutes](First-10-Minutes): make a substrate, deposit an oxide, draw a rectangle and etch one window. No mask file needed. |
| **Understand the controls** | [Getting Started](Getting-Started) and [Workspace and Views](Workspace-and-Views). |
| **Import a GDS/OAS mask** | [Masks and ROI](Masks-and-ROI) and [Import and Export](Import-and-Export). |
| **Run a multi-step process** | [Process and Recipes](Process-and-Recipes); for writing Recipe code, use the [English tutorial](Recipe-Code-Tutorial) or [中文教程](Recipe-Code-Tutorial-zh-CN). |
| **Find a process's before/after drawing** | [Illustrated Process Operations](Process-Operations) — all 18 operation variants. |
| **Fix something unexpected** | [Troubleshooting](Troubleshooting). |

## Three things to understand

1. **Mask** decides **where** a patterned operation acts. **Mask ROI** limits processing; **Main ROI** clips the 3D view only.
2. **Section A–B** shows a slice *along the A–B line*. If the line misses an opening, the section will miss it too. The 3D view helps orientation.
3. **Save** makes a **browser Recovery checkpoint**; **Export** downloads a portable `.wafercad` file. Export is the safer way to keep a project outside this browser.

WaferCAD calculates **idealized geometric material stacks**, not physically calibrated manufacturing outcomes. Surface roughness/pyramids can be display-only; implant and electrical regions are annotations. For research interpretation, read the [example provenance and modeling limits](Examples-and-Modeling-Limits).

## Complete reference

- [Masks and ROI](Masks-and-ROI) — File/Draw sources, mask selection and clipping.
- [Process and Recipes](Process-and-Recipes) — individual operations, guided recipes and execution safety.
- [History, Variants and Recovery](History-Variants-and-Recovery) — previous states, alternate branches and browser checkpoints.
- [Import and Export](Import-and-Export) — project, mask and 3D interchange.
- [Examples and Modeling Limits](Examples-and-Modeling-Limits) — the six shipped Welcome example families and scientific caveats.
- [Process Recipe Code Tutorial](Recipe-Code-Tutorial) ([中文](Recipe-Code-Tutorial-zh-CN)) — seven supported commands, mask capture and replay.

## For documentation maintainers

This wiki is generated from reviewed Markdown under `docs/wiki/` on the repository's `main` branch. Each main push checks and synchronizes managed pages. The [Process Operations](Process-Operations) illustrations share their source with the in-app Process guide. For authoring and publication rules, read the [Wiki sync contract](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/WIKI_SYNC.md) and [source documentation](https://github.com/Xiaolong-6/WaferCAD/tree/main/docs).

> All before/after illustrations are conceptual. They are not predictions from fabrication parameters or the currently open project.
