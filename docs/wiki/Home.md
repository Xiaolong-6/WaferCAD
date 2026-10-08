# WaferCAD · Product User Manual

**WaferCAD** is a browser-based Visual Process CAD for mask-driven semiconductor and micro-/nanofabrication. It builds and inspects a geometric layered device from a wafer, masks and an ordered process flow. It is **not a calibrated process TCAD**.

[Open WaferCAD](https://xiaolong-6.github.io/WaferCAD/) · [Illustrated Process Atlas](https://xiaolong-6.github.io/WaferCAD/guide/) · [Source repository](https://github.com/Xiaolong-6/WaferCAD)

## Read the manual

1. [Getting Started](Getting-Started) — your first masked structure.
2. [Workspace and Views](Workspace-and-Views) — Main, Mask, Section, 3D, and navigation.
3. [Masks and ROI](Masks-and-ROI) — imported layout, Draw, target area and inspection boundaries.
4. [Process and Recipes](Process-and-Recipes) — manual operations, guided Recipe and code syntax.
5. [Process Operations](Process-Operations) — complete descriptions of all variants, constraints and examples.
6. [History, Variants and Recovery](History-Variants-and-Recovery) — replays, branches, snapshots and saving.
7. [Import and Export](Import-and-Export) — project, mask and geometry interchange.
8. [Examples and Modeling Limits](Examples-and-Modeling-Limits) — Black-Si/Ge photodetector and scientific scope.
9. [Troubleshooting](Troubleshooting) — common UI and geometry questions.

## Documentation contract

This wiki mirrors the reviewed Markdown in the main repository under `docs/wiki/`. Each **main** push checks the generated Process reference and compares the managed pages with the published wiki. Only changed pages are committed. A failed sync is reported by GitHub Actions.

The interactive schematic guide shares its Process names and descriptions with the generated [Process Operations](Process-Operations) page. Detailed model contracts remain in the [source documentation](https://github.com/Xiaolong-6/WaferCAD/tree/main/docs).

> Schematic figures explain geometry operations. They are not wafer-fabrication predictions or results calculated from real experimental parameters.
