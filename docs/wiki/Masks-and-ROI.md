# Masks and ROI

[Home](Home) · [Process and Recipes](Process-and-Recipes)

## File masks

Import GDSII (`.gds`, `.gdsii`) or OASIS (`.oas`, `.oasis`). Hierarchical **Cells** and global **Layers** are independent selections. The layout keeps its physical database units on import; alignment may change X/Y translation, scale and rotation. Zero-width linework is visible but not an operable area.

## Draw masks

The Draw source keeps independently editable Rectangle, Circle, Polygon, Ring, and Ring Sector objects. A double-click completes a Polygon, and existing shapes can be dragged or edited numerically. Switching File ↔ Draw does not replace the original file layout. Draw shapes combine by union for Process selection.

## Process Area

| Choice | Affected area |
| --- | --- |
| **Selected mask** | Selected File geometry or union of current Draw geometry. |
| **Invert mask** | Complement of the current mask within the Process domain. |
| **Whole face** | Entire active Front/Back face, regardless of mask selection. |

**Mask ROI** clips both Selected mask / Invert mask operations and SVG/GDSII/OASIS mask exports. It never rewrites the source layout. It is independent of the Main ROI and A–B line.

## Main ROI

**Main ROI** may be rectangular, circular or sector-shaped. It limits the 3D viewport and GLB export; it does **not** limit Apply. This is a frequent source of confusion: to restrict Process, use **Mask ROI**.

## Troubleshooting selections

If a Process changes the wrong area, verify which mask source is active, which File cell/layers are selected, whether Invert is enabled, and whether Mask ROI is still active. Imported mask geometry is not automatically resized to the base.
