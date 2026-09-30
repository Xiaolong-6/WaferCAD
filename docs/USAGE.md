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

Use **Import layout** for GDSII or OASIS files.

WaferCAD reads physical database-unit metadata from the source format and converts XY coordinates to internal µm. Imported geometry remains at native scale. The application does not resize the mask to fit the base.

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

## 5. Limit 3D rendering with an ROI

Open **ROI** in the Mask view, then choose **Rect** or **Circle** and drag once to create the region.

After creation, drag inside the ROI to reposition it or use the four corner handles to resize it. The ROI editor also exposes width/height or radius, a reference point, and X/Y coordinates for exact input.

Changing Reference changes the coordinate readout without moving or resizing the ROI. Circle corner resize keeps a circular shape and follows the pointer across the fixed corner.

The ROI affects 3D rendering only. The full model is preserved.

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

Z Δ is a relative thickness. Conformal is a 2.5D geometric approximation evaluated as Direct growth first, followed by an outward normal sidewall offset. The current convention uses the same numeric value for that XY offset in µm (for example Z Δ = 0.5 gives a 0.5 µm lateral offset). The 3D Z exaggeration is display-only. See [Process benchmarks and limits](PROCESS_BENCHMARKS.md).

## 7. Manage layers

The Section A–B layer legend is also the layer manager.

Each row lets you edit the layer name. Color is intentionally a secondary visual setting: choose from the active curated palette by clicking the layer swatch. The legend header provides several preset palettes and a Random action that generates a harmonious palette. Arbitrary color-picker input is not exposed.

Layer identity is stored separately from the visible name, so renaming or recoloring does not break Grow, Etch, Undo, or saved projects.

## 8. Inspect Main and Section

Main can display the front or back surface.

Use **A–B** to open the coordinate panel. Click **Drag A/B** to highlight the existing A/B handles, then drag either endpoint directly. **Done** locks the endpoints; the panel remains open until its collapse button is used. On narrow screens the controls appear below Main.

Coordinates and Section update while dragging. Grab offsets are preserved, and dragging can continue outside the canvas. Escape cancels the current drag; when idle it exits edit mode. A focused handle also accepts arrow keys (one screen pixel, or ten with Shift). Numeric inputs provide exact coordinate editing. Front/Back uses the same canonical coordinates with a mirrored view.

Double-click Main to fit the view. **Fit** in 3D frames the full model for the current panel aspect ratio.

Use **Settings → XY unit** to switch nm / µm / mm. This only converts display and XY input values; geometry is unchanged. Z values remain relative.

## 9. Snapshots

Open the **Snapshots** tab and use **Save snapshot** to capture the current workspace immediately.

A new snapshot uses the current local timestamp as its default name. Rename it directly in the row if needed. **Restore** replaces the current workspace with the checkpoint; **×** deletes only that snapshot.

Snapshots are immutable workspace checkpoints and have no thumbnail dependency. Restoring and then continuing to edit does not mutate the saved checkpoint. A project stores at most 100 snapshots so every UI-reachable state remains persistable.

## 10. Save and open

Use **Settings → Save** to export the current project as JSON. Snapshot records are included.

Use **Settings → Open** to restore a project. Older supported project files are migrated to the current format version before validation. Save and Open enforce the same 64 MB safety limit.
