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

## 4. Inspect and author the Mask view

The Mask header starts in **File** mode. Click **File** to toggle to **Draw**; the same button then reads **Draw**.

**File** mode keeps imported GDSII/OASIS behavior:

- imported vector layout above the neutral dashed active-face structure reference;
- global layer/datatype selection and hierarchy browsing;
- X/Y/scale/rotation alignment;
- Mask Opacity for visual alignment.

**Draw** mode keeps the imported file untouched and exposes a project-local temporary-mask toolbar directly over the Mask canvas:

- **Select** — existing shapes remain directly editable;
- **Rect** — drag once to create a rectangle;
- **Circle** — drag from center to radius;
- **Polygon** — click vertices and double-click the final point to finish and close automatically; Enter also finishes;
- **Ring** — drag center → outer radius; the default inner radius is half the outer radius;
- **Ring Sector** — drag center → outer radius; starts at 0°→90° and exposes inner/outer radius plus start/end angle;
- **Delete** — remove the selected shape;
- **Clear** — clear the Draw mask after confirmation.

Creation tools are one-shot. After creation, the tool returns to Select behavior. Drag a shape body to move it; drag rectangle corners, circle radius, polygon vertices, Ring radii, or Ring Sector radii/angle handles to edit directly. Click Rectangle/Circle/Ring/Ring Sector geometry to open its exact parameter popover; double-click a Polygon to edit all vertices in a KLayout-style multiline `x, y` text field. Escape cancels an unfinished creation. Delete/Backspace removes the selected shape.

File and Draw state are independent: switching source never unloads the imported layout or deletes drawn shapes. Draw geometry is stored with the project, snapshots, and browser workspace recovery. It is not merged into the imported GDS/OAS source file.

Process **Selected mask** and **Invert mask** always use the currently active source. In Draw mode, all drawn shapes compose by union.

Use **Opacity** to fade whichever source is active. The neutral dashed structure reference, axes, and cursor readout are unaffected.

Double-click Mask or use **Fit** to restore the Mask view. Fit considers the active source while keeping the wafer in view.

## 5. Limit 3D rendering with an ROI

Open **ROI** in the Main view, then choose **Rect**, **Circle**, or **Sector** and drag once to create the region. Sector is circle-based: after drawing the radius, enter **Start °** and **End °** to define the angular range. Wrapped ranges are supported, for example 300° → 60°.

After creation, drag inside the ROI to reposition it or use the four corner handles to resize it. The ROI editor exposes width/height or radius, a reference point, X/Y coordinates, and sector angles for exact input.

Changing Reference changes the coordinate readout without moving or resizing the ROI. Circle and Sector corner resize keep a circular radius and follow the pointer across the fixed corner.

The ROI affects 3D rendering only. The full model is preserved. If a ROI is active, **GLB** exports the currently clipped 3D content; clearing ROI exports the full model.

## 6. Apply an operation

Choose Front or Back.

Choose an action:

- Deposit new layer;
- Extend existing layer;
- Etch / subtract;
- Implant **(experimental)**.

Choose an area:

- Selected mask;
- Invert mask;
- Whole face.

For Deposit and Extend, choose:

- Directional;
- Conformal.

For **Directional Extend**, only currently exposed portions of the target layer are thickened. **Conformal Extend** behaves like continuing a conformal deposition of that same material: the target must be exposed somewhere in the selected area, then the selected area is coated on every exposed surface using the target layer id, with step/sidewall coverage generated by the same kernel as Conformal Deposit.

Etch has no coverage setting. Its **Surface** selector supports **Smooth**, **Rough**, and **Pyramid**. Rough is stochastic correlated relief; Pyramid is a deterministic square-pyramid array. Both expose **Orientation**: Normal points features outward and Inverted mirrors the same field inward. Rough additionally exposes Feature/Height CV controls. Surface morphology is render-only metadata on the newly exposed face; it does not alter the canonical material Z stack. Section and 3D sample the same deterministic field.

Implant is a structural visualization primitive rather than a dopant-physics solver. Set Name, Area, Depth, and optional signed **Tilt X**; Apply records the existing exposed implant volume without creating a material layer. Color is assigned from the active 20-color structure palette after Apply and is edited from the Layers legend. Later Etch operations clip the surviving Implant volume instead of regenerating a new full-depth marker.

Z is physical and stored internally in µm. Deposit/Extend use Z as film thickness; Etch and Implant use it as depth. Conformal is evaluated as Directional coverage first, followed by an outward normal sidewall offset by the same physical thickness. For example, Z = 0.5 µm gives a 0.5 µm vertical film and a 0.5 µm lateral normal offset. Section defaults to **Auto**, where X and Z fit independently and the header reports the Z exaggeration (for example `Z ×43`). Click **Auto** to switch to **1:1**, where X and Z use the same px/µm and sidewall display widening is disabled. 3D can still exaggerate Z for readability without changing geometry. See [Process benchmarks and limits](PROCESS_BENCHMARKS.md), [surface morphology](ROUGHNESS_MORPHOLOGY.md), and [experimental Implant](IMPLANT_EXPERIMENTAL.md).

## 7. Manage layers

The Section A–B **Layers** legend is also the display manager for material layers and Implant annotations.

Each material row lets you edit the layer name. Color is intentionally a secondary visual setting: choose from the active curated palette by clicking the layer swatch. Implant rows use the same palette system, expose independent visibility checkboxes, and keep the checkbox at the right edge with the delete control alignment. The built-in palettes and Random palette contain 20 colors; Random recolors both material layers and implants. Arbitrary color-picker input is not exposed in the Process form.

Layer and Implant identities are stored separately from visible names/colors, so renaming or recoloring does not break Extend, Etch, Implant clipping, Undo, or saved projects.

## 8. Inspect Main and Section

Main can display the front or back surface. Non-smooth wafer regions keep the same material color with a subtle darkening, while Implant uses a light overlay so the base pattern remains readable. Section shows the actual Rough/Pyramid profile and clipped Implant gradient volume; 3D uses geometry-displaced morphology and a translucent surviving internal Implant volume.

Existing Slice geometry is always editable in **Main**: drag A or B directly, or drag the A–B line itself to translate the whole slice. The **Slice** button opens the A–B coordinate panel and starts one-shot creation mode; drag anywhere in Main to create a replacement A→B line, then creation mode ends automatically while the existing slice remains editable. Closing the panel does not lock the slice. A focused endpoint also accepts arrow keys (one screen pixel, or ten with Shift). Numeric inputs provide exact coordinate editing. Front/Back uses the same canonical coordinates with a mirrored view.

The **ROI** control also lives in Main. Existing ROI geometry remains movable/resizable with the ROI popover closed. Open ROI only to choose Rect/Circle/Sector or edit exact values. Drawing a new ROI is one-shot. Slice and ROI popovers are mutually exclusive so only one Main geometry editor is expanded at a time.

Double-click **Main** or **Mask** to fit that 2D view. **Fit** in 3D frames the active ROI when one exists, otherwise it frames the full model.

On desktop landscape layouts, the workspace is arranged as **Main / Mask / Function** on the first row and **3D / Section** on the second row. The original panel proportions are retained. At widths up to 900 px, the existing three-row layout remains **Function/3D**, **Main/Mask**, then **Section**.

Each scientific view has **Max**. It expands Main, Mask, 3D, or Section to the available browser workspace without opening a new window; the button changes to **Restore**, and Escape also restores the normal layout.

Main and Section A–B provide **SVG** export. Mask provides **SVG, GDSII, and OASIS** export. File-mask export keeps the selected Cell/Layer filters, while Draw Mask exports the drawn geometry; when a Mask ROI is active, all three Mask export formats are cropped to that ROI. GDSII/OASIS export writes the current aligned world geometry rather than the original untransformed file coordinates. The 3D view provides **GLB** and **PNG**: GLB contains physical geometry in glTF metre units (WaferCAD µm are converted by 1e-6), while PNG captures the current 3D camera at 3× resolution.

Use **Project → XYZ unit** to switch nm / µm / mm. This converts X, Y and Z display/input values while canonical geometry remains stored in µm. Manual length fields are displayed and committed to **1 nm precision** (0.001 µm or 0.000001 mm). Internal calculations retain their working precision; project export normalizes persisted physical lengths and coordinates to **0.1 nm** (0.0001 µm) so floating-point tails such as `24999.999999999996` are not stored.

## 9. Process history, milestones, and variants

Every successful **Apply** appends a restorable process-history node to the active variant. The tree records the operation metadata and the exact workspace state produced by that step. Click any non-HEAD process row to restore that step directly; the editor enters **Historical working state** and can either return to HEAD or continue into a new variant. Failed, aborted, busy, or no-change operations do not create history nodes or empty variants.

Use **Save milestone** when a process state is worth naming. A milestone is an immutable checkpoint attached to the current process-history node and captures the complete restorable workspace state.

The **Current variant** selector switches the workspace to that variant's latest **HEAD**. Restoring an older process step, restoring a milestone, or using Undo can move the editor behind HEAD; the History panel then shows a **Historical working state** banner. Non-process edits made there stay in the working state. If the next Apply succeeds, WaferCAD creates a new `Variant N` from that exact working state and records the successful process step there. The original variant and its HEAD remain unchanged. If Apply fails, is aborted, is busy, or produces no geometry change, no variant is created.

**Variant from here** creates a process variant from a milestone. When continuation follows Undo and no milestone exists at that exact process node, WaferCAD creates a branch-point milestone attached to that historical graph position. A milestone used as a variant origin is protected from deletion so provenance cannot be silently rewritten. Non-Main leaf variants can be deleted; child variants must be removed first.

Variant HEAD state also includes non-process project edits such as ROI/view/project settings. It is synchronized before persistence/export and before switching variants, so returning to a variant restores its actual latest working HEAD rather than only its last process operation.

A project stores at most 100 named milestones, 32 variants, and 1000 process-history nodes. Snapshot-branch format v3 requires every new process node to carry a restorable state. Autosave and export pack repeated layout/model assets through the shared-asset layer to reduce duplication. Older v2 projects remain readable; an old intermediate process row can only be restored when that file already contains an equivalent milestone or branch HEAD state, because earlier versions did not save every intermediate state. Existing projects without process-history metadata continue to open as a linear **Main** variant.

## 10. Save and open

Project includes an editable **Project name**. Export uses that name as the default `.wafercad` filename. **New** and **Open** both warn before replacing the current workspace.

The **Project** tab is first and is the default tool tab when the workspace starts.

**Save** writes the current project into browser storage and creates an explicit local **Recovery** checkpoint. Recovery points are listed in the Project tab, can be restored later, and can be cleared manually. Clearing Recovery checkpoints does not delete the current autosaved workspace. Continuous IndexedDB autosave still protects the latest working state between manual Save checkpoints and across reloads.

**Export** downloads the current project as a `.wafercad` file. Process history, milestones, variants, and their restore states are included. Repeated layout/model assets are stored through the shared-asset layer so unchanged data is not copied once per checkpoint.

Use **Project → Open** to restore an exported project file. Older supported project files are migrated to the current **v13** format before validation. v13 adds Pyramid morphology while preserving v12 stochastic morphology/polarity and older project semantics. Export and Open enforce the same 256 MB safety limit.


### Base lifecycle and Process

The **Base** is a physical material in the vector stack, while `model.boundary` remains the process-domain footprint used for mask alignment and editing. Partial through-etches are valid holes. A whole-face over-etch may remove all material; the workspace remains valid so Undo, snapshots, masks, ROI and project state can still be used. Process operations are disabled until a Base is recreated when no material remains.

**Process → Extend** lists only layers exposed on the active face in the selected process area. **Base** is a valid Extend target whenever it is exposed. Buried layers are not offered as Extend targets.

Workspace feedback is centralized in the bottom status bar. Passive, progress, success, warning, and error states use distinct status-bar treatments so the same runtime message is not repeated in the Process panel or a toast.
