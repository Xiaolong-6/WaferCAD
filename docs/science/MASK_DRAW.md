# Mask File / Draw contract

Mask has two independent project-local sources: **File** and **Draw**. Switching source does not destroy either source.

## File source

File mode uses imported GDSII/OASIS hierarchy, Cells/Layers selection, and the explicit alignment transform. Imported layout geometry remains authoritative and immutable. The viewport Alignment editor owns all changes: XY drag and numerical edits produce a renderer-only draft; Apply commits the transform, while Cancel/close/Escape discard it. The drag uses the fixed viewport CSS-pixel-to-µm projection and leaves Scale/Rotation unchanged. Draft changes do not update the structural model, Process selection, exports, History, or persisted alignment. After Apply the existing selection/export consumers read the committed transform. File overlay translations may use a bounded raster cache during interactive preview; committed rendering and exports remain vector geometry. Draw source never inherits File alignment.

## Draw source

Draw mode supports Rectangle, Circle, Polygon, Ring, and Ring Sector primitives. Shapes can be created, selected, moved, resized, and edited numerically. Draw geometry is stored in canonical wafer/world micrometres and is preserved by project storage, History states, autosave, and Recovery.

## Process selection

The active File/Draw source feeds **Selected mask** and **Invert mask** through the shared selection-geometry path. **Whole face** does not use a Mask pattern. A separate **Mask ROI** can be Rect or Circle; when active, it intersects the final Process area for **all three Area choices**, including Whole face. Clear the Mask ROI before a genuinely full-face operation. The ROI limits the operation domain, not the imported source polygons.

Mask ROI is independent from Main ROI and Section A–B. It is project/view working state and does not rewrite canonical material geometry.

## Export

Mask export can emit **SVG, GDSII, or OASIS** from the active source. When Mask ROI is active, export is clipped to that ROI. File-source export can select Cells/Layers; Draw export serializes the current drawn geometry through the same explicit export UI.

## Ownership

- `site/controllers/draw-mask-controller.js` owns Draw interaction state.
- `site/draw-mask-geometry.js` owns pure Draw geometry conversion/editing helpers.
- `site/selection-geometry.js` owns active-source and Mask ROI process-selection geometry.
- Project schema/storage owns persisted Draw and Mask ROI state.

The older [Mask File / Draw plan](../archive/MASK_DRAW_PLAN.md) is retained as historical design evidence and must not be used as the current behavior contract.
