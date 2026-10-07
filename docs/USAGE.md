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

The ROI affects 3D rendering only. The full model is preserved. If a ROI is active, **GLB** exports the currently clipped 3D content; clearing ROI exports the full model. ROI clipping also creates inspection sidewalls: buried Implant regions crossed by that cut remain hidden as volumes at 100% material opacity, but their cut faces are visible with the same surface-to-depth gradient convention used by Section A–B. Lowering 3D opacity additionally reveals the internal Implant volume.

The 3D ROI boundary is not automatically the Section A–B line. Section samples A–B, while 3D exposes the ROI perimeter. For annular/radial structures these paths can cross contacts at different positions; align A–B with the ROI edge you want to compare when a one-to-one cross-section is required.

## 6. Apply an operation

Choose Front or Back.

Choose an action:

- Deposit new layer — Directional, Conformal, or **Transfer / Laminate**;
- Extend existing layer — Directional or Conformal;
- Etch / subtract — Directional, Isotropic release, **Planarize / CMP**, or **Undercut release**;
- Implant;
- Electrical Region;
- Record process step.

Choose an area:

- Selected mask;
- Invert mask;
- Whole face.

For normal Deposit and Extend, choose:

- Directional;
- Conformal.

**Transfer / Laminate** is available when depositing a new layer. **Follow surface** is the default for newly created transfers: each supported XY region starts at its own local exposed surface Z, so transferred 2D materials do not float above lower local topography, and true through-voids stay empty. **Flat bridge** keeps the membrane behavior at the highest exposed plane in the selected front-face area (the lowest exposed plane on the back face), allowing a film to bridge openings without filling the void beneath it. Legacy project/replay steps that predate the placement selector keep Flat-bridge semantics.

For **Directional Extend**, only currently exposed portions of the target layer are thickened. **Conformal Extend** behaves like continuing a conformal deposition of that same material: the target must be exposed somewhere in the selected area, then the selected area is coated on every exposed surface using the target layer id, with step/sidewall coverage generated by the same kernel as Conformal Deposit.

Etch has no deposition coverage setting. Its **Profile** selector defaults to **Directional**, preserving the established vertical subtraction path. Directional Etch can remove exposed materials in stack order or, when one Material is selected, remove only that exposed material and stop at a different material or a true released void. **Planarize / CMP** trims material down to an absolute target Z plane without inventing fill below that plane. **Undercut release** requires one exposed sacrificial material and propagates laterally into that material to create canonical released cavities/overhangs.

**Isotropic release** is the physical undercut profile. It requires one exposed target Material and interprets **Radius** as the geometric etch distance. The front propagates inward and laterally from exposed target-material openings, so it can undercut that same material beneath a non-target mask and create canonical air gaps, suspended films, and support pedestals. Non-target materials are preserved. Release geometry is part of the canonical model, therefore Section, 3D, project persistence, and physical GLB export see the cavity/overhang rather than a display-only effect.

For Directional Etch, **Surface** supports **Smooth**, **Rough**, and **Pyramid**. Rough is stochastic correlated relief; Pyramid is a deterministic square-pyramid array. Both expose **Orientation**: Normal points features outward and Inverted mirrors the same field inward. Rough additionally exposes Feature/Height CV controls. Surface morphology is render-only metadata on the newly exposed face; it does not alter the canonical material Z stack. Section and 3D sample the same deterministic field. Rough/Pyramid are intentionally unavailable for Isotropic release because release already changes physical geometry.

Electrical Region is a separate schematic annotation for p/n regions, inversion, accumulation, depletion, or custom induced/doped/interface regions. Set Name, Type, Source, Area, and Depth. It does not create material and it does not solve electrostatics or carrier transport. Later Etch clips the region against surviving material, and Layers controls its name, palette color, and visibility.

Implant is a structural visualization primitive rather than a dopant-physics solver. Set Name, Area, Depth, and optional signed **Tilt X**; Apply records the existing exposed implant volume without creating a material layer. Color is assigned from the active 20-color structure palette after Apply and is edited from the Layers legend. Later Etch operations clip the surviving Implant volume instead of regenerating a new full-depth marker.

Z is physical and stored internally in µm. Deposit/Extend use Z as film thickness; Directional Etch, Implant, and Electrical Region use it as depth; Isotropic release uses the same field as a physical etch radius. Conformal is evaluated as Directional coverage first, followed by an outward normal sidewall offset by the same physical thickness. For example, Z = 0.5 µm gives a 0.5 µm vertical film and a 0.5 µm lateral normal offset. Section defaults to **Auto**, where X and Z fit independently and the header reports the Z exaggeration (for example `Z ×43`). Click **Auto** to switch to **1:1**, where X and Z use the same px/µm and sidewall display widening is disabled. 3D can still exaggerate Z for readability without changing geometry. See [Process benchmarks and limits](PROCESS_BENCHMARKS.md), [surface morphology](ROUGHNESS_MORPHOLOGY.md), and [Implant modeling scope](IMPLANT.md).

## 7. Manage layers

The Section A–B **Layers** legend is also the display manager for material layers, Implant annotations, and Electrical Region annotations.

Each material row lets you edit the layer name, palette color, and **visibility**. Material visibility is inspection-only: hiding a layer removes it from Main / Section / 3D rendering and reveals the visible material below it, but does not delete process geometry, increment the process revision, or change what later Process operations act on. Physical material removal belongs in Process History through Etch/Release rather than the Layers legend.

Implant and Electrical Region rows use the same palette system and expose independent visibility checkboxes. The built-in palettes and Random palette contain 20 colors; Random recolors material layers, implants, and Electrical Regions. Arbitrary color-picker input is not exposed in the Process form.

Layer, Implant, and Electrical Region identities are stored separately from visible names/colors, so renaming, recoloring, or toggling display visibility does not break Extend, Etch, annotation clipping, Process History, or saved projects.

## 8. Inspect Main and Section

Main can display the front or back surface. Non-smooth wafer regions keep the same material color with a subtle darkening, while Implant uses a light overlay and Electrical Region uses a lighter filled/dashed annotation so the base pattern remains readable. Section shows the actual Rough/Pyramid profile, clipped Implant gradient volume, and uniform Electrical Region band; 3D uses geometry-displaced morphology plus distinct translucent surviving annotation volumes.

Existing Slice geometry is always editable in **Main**: drag A or B directly, or drag the A–B line itself to translate the whole slice. The **Slice** button opens the A–B coordinate panel and starts one-shot creation mode; drag anywhere in Main to create a replacement A→B line, then creation mode ends automatically while the existing slice remains editable. Closing the panel does not lock the slice. A focused endpoint also accepts arrow keys (one screen pixel, or ten with Shift). Numeric inputs provide exact coordinate editing. Front/Back uses the same canonical coordinates with a mirrored view.

The **ROI** control also lives in Main. Existing ROI geometry remains movable/resizable with the ROI popover closed. Open ROI only to choose Rect/Circle/Sector or edit exact values. Drawing a new ROI is one-shot. Slice and ROI popovers are mutually exclusive so only one Main geometry editor is expanded at a time.

Double-click **Main** or **Mask** to fit that 2D view. **Fit** in 3D frames the active ROI when one exists, otherwise it frames the full model.

On desktop landscape layouts, the workspace is arranged as **Main / Mask / Function** on the first row and **3D / Section** on the second row. The original panel proportions are retained. At widths up to 900 px, the existing three-row layout remains **Function/3D**, **Main/Mask**, then **Section**.

Each scientific view has **Max**. It expands Main, Mask, 3D, or Section to the available browser workspace without opening a new window; the button changes to **Restore**, and Escape also restores the normal layout.

Main and Section A–B provide **SVG** export. Mask provides **SVG, GDSII, and OASIS** export. File-mask export keeps the selected Cell/Layer filters, while Draw Mask exports the drawn geometry; when a Mask ROI is active, all three Mask export formats are cropped to that ROI. GDSII/OASIS export writes the current aligned world geometry rather than the original untransformed file coordinates. The 3D view provides **GLB** and **PNG**: GLB uses glTF metre units (WaferCAD µm are converted by 1e-6) and embeds the topology-owned Rough/Pyramid surface relief using a camera-independent export mesh. Morphology export has a strict 900,000-triangle hard cap; if the base mesh alone would exceed it, narrow the 3D ROI or simplify the visible morphology. Morphology tessellation runs in the same worker pipeline used by the interactive rough renderer, reports progress, and can be cancelled by terminating the export worker; the final bounded GLB encoding step remains on the main thread. PNG captures the current 3D camera at 3× resolution.

Use **Project → XYZ unit** to switch nm / µm / mm. This converts X, Y and Z display/input values while canonical geometry remains stored in µm. Manual length fields are displayed and committed to **0.1 nm precision** (0.0001 µm or 0.0000001 mm). Internal calculations retain their working precision; project export uses the same **0.1 nm** normalization for persisted physical lengths and coordinates so floating-point tails such as `24999.999999999996` are not stored.

## 9. History: Steps, Variants, and bookmarks

Every successful **Apply** creates one **Step** in History. A Step contains the operation metadata and the exact validated workspace state produced by that operation, so every newly created Step is directly restorable. Failed, aborted, busy, or no-change operations create no Step.

The History panel is a process tree. **Main** is the root Variant. A Variant created from a Step is rendered directly beneath that origin Step, and child Variants can branch again from later Steps. Click a Variant name to switch to its latest **HEAD**. Use the pencil beside the Variant name, or double-click the name, to rename it inline.

Click any restorable Step to inspect that exact state. The editor then shows **Historical state** and offers a route back to the current Variant HEAD. If the next Apply succeeds, WaferCAD creates a new Variant from that Step/state and records the successful operation there; the existing Variant and HEAD remain unchanged.

New Steps also store a compact versioned **replay contract** containing the actual process parameters and area mode. The exact Mask/ROI context is reconstructed from that Step's already-saved workspace state, so large GDS/OAS element arrays are not duplicated into every operation.

On a replayable Step, **Edit Step…** immediately restores that Step's mask/ROI/workspace context, rolls physical geometry back to its predecessor, opens Process, and loads the original operation parameters. Edit those parameters first; the Process action becomes **Save edited Step**. Only when saving does WaferCAD ask how to handle later Steps: **Replace & discard later Steps**, **Replace & replay later Steps** when replay metadata is available, or a new Variant. If another Variant depends on the Step/tail being edited, WaferCAD uses copy-on-write instead of blocking the edit: **New Variant · Edit & carry later Steps** replays the current Variant's later Steps onto the edited copy, while **Save as copy-on-write Variant** / **New Variant · Edited Step only** keeps only the edited Step. The source and dependent Variants remain unchanged. Replay stops at the first failed/no-change operation and never guesses missing legacy parameters. A Recovery checkpoint is created before the edit.

**Insert before…** creates a new process Step immediately before the selected Step using the selected Step's saved mask/ROI/workspace context and its predecessor geometry. Choose **Update current Variant** to insert and recompute the selected Step plus all later replayable Steps; **New Variant · Carry later Steps** to preserve the current Variant and replay that same tail in a child Variant; or **New Variant · Start from here** to create a child Variant containing only the newly inserted Step after the common history. When an inserted Deposit shifts generated material IDs, replay remaps downstream Extend/Etch targets to the recreated material rather than the newly inserted layer. Automatic carry/recompute is unavailable for legacy Steps without replay metadata, and current-Variant rewriting is disabled when a child Variant depends on the tail being replaced. A Recovery checkpoint is created before insertion.

For timeline editing without changing the selected Step, **Continue from here…** keeps that Step, deletes only later Steps on the same Variant, restores the selected Step as the new HEAD, and lets subsequent Apply operations continue from there. **New Variant from here** preserves the existing history and creates a child Variant rooted at the selected Step. A Variant HEAD exposes **Delete last Step** when a restorable predecessor exists; this restores the predecessor directly and does not depend on the legacy Undo stack. Child-Variant dependencies are protected rather than silently orphaned.

History labels resolve material, Implant, and Electrical Region names through their stable entity IDs. Renaming an entity updates the displayed labels and the restorable/replay metadata along that entity's process lineage, so restoring an older Step does not revert to a stale name. Independent Variants that happen to reuse the same internal numeric ID remain name-isolated.

Variant ancestry is defined by the process graph (`rootNodeId` plus explicit parent-Variant linkage), not by bookmarks. Older Steps without replay metadata remain restorable/branchable but are explicitly unavailable for automatic edit/replay.

A **bookmark** is only an optional label attached to a Step. **Bookmark current step** or **Add bookmark** does not create a second history checkpoint and is not required for restore or branching. Renaming or deleting a bookmark does not remove the Step. Older project files may expose snapshot-only states under **Legacy bookmarks** so their saved states remain accessible without pretending they are modern process Steps.

Variant HEAD state can include non-process edits such as ROI, display, or project settings. WaferCAD preserves that exact HEAD before History navigation. Merely browsing clean historical Steps does not consume Recovery slots; leaving a historical state after editing it creates a Recovery checkpoint.

A project supports at most 100 bookmark records, 32 Variants, and 1000 process Steps. Snapshot-branch format v3 requires every newly written Step to carry a restorable state. Autosave and export pack repeated layout/model assets through the shared-asset layer. Older v1/v2 data remains readable; an old intermediate row that was never persisted with a state is explicitly marked unavailable unless its exact state can be recovered from legacy saved data.

## 10. Save and open

Project includes an editable **Project name**. Export uses that name as the default `.wafercad` filename. **New** and **Open** both warn before replacing the current workspace.

The **Project** tab is first and is the default tool tab when the workspace starts.

**Save** writes the current project into browser storage and creates an explicit local **Recovery** checkpoint. Recovery points are listed in the Project tab, can be restored later, and can be cleared manually. Clearing Recovery checkpoints does not delete the current autosaved workspace. Continuous IndexedDB autosave still protects the latest working state between manual Save checkpoints and across reloads.

**Export** downloads the current project as a `.wafercad` file. Process Steps, Variants, bookmarks, and their restore states are included. Repeated layout/model assets are stored through the shared-asset layer so unchanged data is not copied once per checkpoint.

Use **Project → Open** to restore an exported project file. Older supported project files are migrated to the current **v14** format before validation. v13 adds Pyramid morphology; v14 adds Electrical Region annotations while preserving v12 stochastic morphology/polarity and older project semantics. Export and Open enforce the same 256 MB safety limit.

### Base lifecycle and Process

The **Base** is a physical material in the vector stack, while `model.boundary` remains the process-domain footprint used for mask alignment and editing. Partial through-etches are valid holes. A whole-face over-etch may remove all material; the workspace remains valid so Undo, History, masks, ROI and project state can still be used. Process operations are disabled until a Base is recreated when no material remains.

**Process → Extend** lists only layers exposed on the active face in the selected process area. **Base** is a valid Extend target whenever it is exposed. Buried layers are not offered as Extend targets.

Workspace feedback is centralized in the bottom status bar. Passive, progress, success, warning, and error states use distinct status-bar treatments so the same runtime message is not repeated in the Process panel or a toast.
