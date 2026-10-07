# Mask File / Draw contract

Mask has two independent project-local sources: **File** and **Draw**. Switching source does not destroy either source.

## File source

File mode uses imported GDSII/OASIS hierarchy, Cells/Layers selection, and the explicit alignment transform. Imported layout geometry remains authoritative and immutable.

## Draw source

Draw mode supports Rectangle, Circle, Polygon, Ring, and Ring Sector primitives. Shapes can be created, selected, moved, resized, and edited numerically. Draw geometry is stored in canonical wafer/world micrometres and is preserved by project storage, History states, autosave, and Recovery.

## Process selection

The active File/Draw source feeds Selected mask and Invert mask through the shared selection-geometry path. A separate **Mask ROI** can be Rect or Circle. When active, the Mask ROI clips the selected mask geometry used by Process Apply.

Mask ROI is independent from Main ROI and Section A–B. It is project/view working state and does not rewrite canonical material geometry.

## Export

Mask export can emit **SVG, GDSII, or OASIS** from the active source. When Mask ROI is active, export is clipped to that ROI. File-source export can select Cells/Layers; Draw export serializes the current drawn geometry through the same explicit export UI.

## Ownership

- `site/controllers/draw-mask-controller.js` owns Draw interaction state.
- `site/draw-mask-geometry.js` owns pure Draw geometry conversion/editing helpers.
- `site/selection-geometry.js` owns active-source and Mask ROI process-selection geometry.
- Project schema/storage owns persisted Draw and Mask ROI state.

The older [Mask File / Draw plan](MASK_DRAW_PLAN.md) is retained as historical design evidence and must not be used as the current behavior contract.
