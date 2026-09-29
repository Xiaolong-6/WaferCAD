# Usage

## 1. Create the base

The default base is circular.

Set:

- W in the currently selected global XY display unit;
- H in the same display unit for rectangular bases;
- Z as a relative thickness.

Use **Apply base** to create or rebuild it.

If the structure already contains operations, WaferCAD asks for confirmation. Use **Revert** or **Undo** to restore the previous state.

## 2. Import a mask

Use **Import GDS**.

WaferCAD reads the GDSII `UNITS` record and converts XY coordinates to internal µm. Imported geometry remains at native scale. The application does not resize the mask to fit the base.

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
- XY axes in the selected global display unit;
- live XY cursor coordinates in the same unit.

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

The Section A–B layer legend is also the layer manager.

Each row lets you edit the layer name. Color is intentionally a secondary visual setting: choose from the active curated palette by clicking the layer swatch. The legend header provides several preset palettes and a Random action that generates a harmonious palette. Arbitrary color-picker input is not exposed.

Layer identity is stored separately from the visible name, so renaming or recoloring does not break Grow, Etch, Undo, or saved projects.

## 8. Inspect Main and Section

Main can display the front or back surface.

Drag A–B in Main to define the section line. Section A–B updates from the same vector model.

Use the global XY unit selector in the top toolbar to switch nm / µm / mm. This only converts display and XY input values; geometry is unchanged. Z values remain relative.

## 9. Snapshots

Use **Save snapshot** in the left sidebar to capture the current workspace immediately.

A new snapshot uses the current local timestamp as its default name. Rename it directly in the row if needed. **Restore** replaces the current workspace with the checkpoint; **×** deletes only that snapshot.

Snapshots are immutable workspace checkpoints and have no thumbnail dependency. Restoring and then continuing to edit does not mutate the saved checkpoint.

## 10. Save and open

Use **Save** to export the current project as JSON. Snapshot records are included.

Use **Open** to restore a project written by the current vector format. Project and snapshot payloads are validated before they can replace live editor state.
