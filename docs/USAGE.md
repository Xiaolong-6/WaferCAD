# Usage

## 1. Create the base

The default base is circular.

Set:

- W in µm;
- H in µm for rectangular bases;
- Z as a relative thickness.

Use **Apply base** to create or rebuild it.

If the structure already contains operations, WaferCAD asks for confirmation. Use **Revert** or **Undo** to restore the previous state.

## 2. Import a mask

Use **Import GDS**.

WaferCAD reads the GDSII `UNITS` record and converts XY coordinates to µm. Imported geometry remains at native scale. The application does not resize the mask to fit the base.

Use Alignment only when an actual geometric transform is required.

## 3. Select Cells and Layers

The Mask panel contains two parallel browsers:

- **Cells** — hierarchical cell tree;
- **Layers** — global unique `layer/datatype` list.

Selecting a cell changes the active hierarchy scope.

The Layers list always remains complete. A layer that is absent from the active cell/subtree is dimmed and struck through rather than removed.

Selecting a layer selects that `layer/datatype` across the active subtree.

## 4. Inspect the Mask view

The Mask view shows:

- base outline;
- imported mask geometry;
- selected layers;
- XY axes in µm;
- live XY cursor coordinates.

Use the wheel or − / + / Fit controls to change the view. View fitting does not alter geometry.

## 5. Limit 3D rendering

Use **Rect** or **Circle** in the Mask toolbar to draw a 3D focus region.

The focus region affects rendering only. The full model is preserved.

## 6. Apply an operation

Choose Front or Back.

Choose an action:

- Add new layer;
- Grow current layer;
- Etch / subtract.

Choose an area:

- Selected mask;
- Invert mask;
- Whole face.

For Add and Grow, choose:

- Direct;
- Conformal.

Etch has no growth setting.

Z Δ is a relative thickness.

## 7. Manage layers

The 3D legend is also the layer manager.

Each row lets you:

- edit the layer name;
- change its color.

Layer identity is stored separately from the visible name, so renaming does not break Grow, Etch, Undo, or saved projects.

## 8. Inspect Main and Section

Main can display the front or back surface.

Drag A–B in Main to define the section line. Section A–B updates from the same vector model.

XY is shown in µm. Z values are labeled as relative.

## 9. Save and open

Use **Save** to export the current project as JSON.

Use **Open** to restore a project written by the current vector format.
