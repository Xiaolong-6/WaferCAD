# Usage

## 1. Create the base

The default base is circular.

Set:

- W in the currently selected global XY display unit;
- H in the same display unit for rectangular bases;
- Z as a physical thickness in the selected display/input unit.

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

Open **ROI** in the Mask view, then choose **Rect**, **Circle**, or **Sector** and drag once to create the region. Sector is circle-based: after drawing the radius, enter **Start °** and **End °** to define the angular range. Wrapped ranges are supported, for example 300° → 60°.

After creation, drag inside the ROI to reposition it or use the four corner handles to resize it. The ROI editor exposes width/height or radius, a reference point, X/Y coordinates, and sector angles for exact input.

Changing Reference changes the coordinate readout without moving or resizing the ROI. Circle and Sector corner resize keep a circular radius and follow the pointer across the fixed corner.

The ROI affects 3D rendering only. The full model is preserved. If a ROI is active, **GLB** exports the currently clipped 3D content; clearing ROI exports the full model.

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

Z is physical and stored internally in µm. Add/Grow use Z as film thickness and Etch uses Z as etch depth. Conformal is evaluated as Direct growth first, followed by an outward normal sidewall offset by the same physical thickness. For example, Z = 0.5 µm gives a 0.5 µm vertical film and a 0.5 µm lateral normal offset. Section defaults to **Auto**, where X and Z fit independently and the header reports the Z exaggeration (for example `Z ×43`). Click **Auto** to switch to **1:1**, where X and Z use the same px/µm and sidewall display widening is disabled. 3D can still exaggerate Z for readability without changing geometry. See [Process benchmarks and limits](PROCESS_BENCHMARKS.md).

## 7. Manage layers

The Section A–B layer legend is also the layer manager.

Each row lets you edit the layer name. Color is intentionally a secondary visual setting: choose from the active curated palette by clicking the layer swatch. The legend header provides several preset palettes and a Random action that generates a harmonious palette. Arbitrary color-picker input is not exposed.

Layer identity is stored separately from the visible name, so renaming or recoloring does not break Grow, Etch, Undo, or saved projects.

## 8. Inspect Main and Section

Main can display the front or back surface.

Use **Slice** to toggle the A–B coordinate panel and endpoint editing together. Opening Slice shows the panel and immediately makes the existing A/B handles draggable; closing Slice hides the panel and locks both handles. On narrow screens the controls appear below Main.

Coordinates and Section update while dragging. Grab offsets are preserved, and dragging can continue outside the canvas. Escape cancels an in-progress drag; when idle it closes Slice and locks the endpoints. A focused handle also accepts arrow keys (one screen pixel, or ten with Shift). Numeric inputs provide exact coordinate editing. Front/Back uses the same canonical coordinates with a mirrored view.

Double-click Main to fit the view. **Fit** in 3D frames the active ROI when one exists, otherwise it frames the full model.

Each scientific view has **Max**. It expands Main, Mask, 3D, or Section to the available browser workspace without opening a new window; the button changes to **Restore**, and Escape also restores the normal layout.

Main, Mask, and Section A–B provide **SVG** export. The 3D view provides **GLB** and **PNG**: GLB contains physical geometry in glTF metre units (WaferCAD µm are converted by 1e-6), while PNG captures the current 3D camera at 3× resolution.

Use **Settings → XYZ unit** to switch nm / µm / mm. This converts X, Y and Z display/input values while canonical geometry remains stored in µm. Manual length fields are displayed and committed to **1 nm precision** (0.001 µm or 0.000001 mm). Internal calculations retain their working precision; project export normalizes persisted physical lengths and coordinates to **0.1 nm** (0.0001 µm) so floating-point tails such as `24999.999999999996` are not stored.

## 9. Snapshots

Open the **Snapshots** tab and use **Save snapshot** to capture the current workspace immediately.

A new snapshot uses the current local timestamp as its default name. Rename it directly in the row if needed. **Restore** replaces the current workspace with the checkpoint; **×** deletes only that snapshot.

Snapshots are immutable workspace checkpoints and have no thumbnail dependency. Restoring and then continuing to edit does not mutate the saved checkpoint. A project stores at most 100 snapshots so every UI-reachable state remains persistable.

## 10. Save and open

Use **Settings → Save** to export the current project as JSON. Snapshot records are included. Repeated snapshot mask/layout and unchanged model assets are stored once and referenced from each checkpoint, so large masks do not multiply the file size for every snapshot.

Use **Settings → Open** to restore a project. Older supported project files are migrated to the current format version before validation. Save and Open enforce the same 256 MB safety limit.
