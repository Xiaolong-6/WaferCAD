# Mask File / Draw plan

## Implementation status

The v1 architecture in this document is implemented on the feature branch:

- File/Draw source toggle;
- Rect/Circle/Polygon/Ring/Ring Sector Draw geometry;
- one-shot creation with direct move/resize/vertex/angle editing afterwards;
- exact per-shape parameter popover, including multiline Polygon coordinates;
- Delete/Clear actions;
- File and Draw state preserved independently;
- Draw state was introduced in project v6 and migrates into the current v13 format; snapshots and autosave preserve it;
- active source feeds Process Selected mask / Invert mask;
- active source exports through Mask SVG;
- Mask Fit/zoom uses the active source;
- Draw geometry remains separate from imported GDS/OAS data.

Draw-to-GDS/OAS export remains a future extension.

## Goal

Add a **File / Draw** source switch to the Mask view without changing the meaning of imported GDSII/OASIS data.

- **File** is the default and keeps the current imported layout workflow.
- **Draw** exposes a lightweight geometry editor for project-local temporary mask shapes.
- Switching source never destroys either source.
- Process operations consume the currently active mask source through one geometry interface.

The Draw source is intentionally not a replacement for a layout editor. It exists for quick process experiments, teaching, alignment checks, and temporary mask construction.

## Product interaction

### Header

Add one compact Mask header control:

`File | Draw`

Default: **File**.

The control changes which source is rendered and which source feeds `Selected mask` / `Invert mask` in Process.

File-specific controls such as Cells / Layers / Alignment remain available in File mode. Draw-specific controls replace that source-specific area in Draw mode.

Mask Opacity remains presentation-only and applies to the active mask source.

### File mode

File mode keeps the current behavior:

- import GDSII / OASIS;
- browse hierarchy and global layers;
- select layer/datatype combinations;
- alignment X / Y / scale / rotation;
- imported geometry remains immutable.

Switching to Draw does not unload or modify the imported layout.

### Draw mode — v1

Start with a deliberately small set of primitives:

- Rectangle;
- Circle;
- Polygon;
- Ring;
- Ring Sector;
- Select / Move;
- Delete;
- Clear Draw Mask.

Rectangle, Circle, Ring and Ring Sector use drag-to-create. Polygon uses click-to-place vertices and double-click to finish and close automatically; Enter also finishes, and Escape cancels the in-progress polygon.

Existing drawn shapes are directly editable while no creation tool is active:

- drag body to move;
- drag handles to resize Rect/Circle/Ring/Ring Sector;
- drag Polygon vertices and Ring Sector angle handles;
- exact parameter editor for Rect/Circle/Ring/Ring Sector;
- KLayout-style multiline `x, y` coordinate editor for Polygon vertices.

Use the same interaction doctrine as Main ROI/Slice: creation mode is temporary; existing geometry is editable by default.

## Data model

Do not append temporary geometry into `layout.elements`. Keep imported file data and drawn project geometry separate.

Proposed project state:

```js
maskSourceMode: 'file' | 'draw',

drawMask: {
  nextShapeId: 1,
  shapes: [
    {
      id: 'shape-1',
      type: 'rect',
      a: [x0, y0],
      b: [x1, y1],
    },
    {
      id: 'shape-2',
      type: 'circle',
      c: [x, y],
      r: radius,
    },
    {
      id: 'shape-3',
      type: 'polygon',
      points: [[x0, y0], [x1, y1], ...],
    },
  ],
}
```

Draw coordinates are canonical wafer/world coordinates in µm. They do **not** inherit the imported file's alignment transform.

The state should be:

- stored in the WaferCAD project;
- included in snapshots;
- restored by browser workspace autosave;
- excluded from imported GDS/OAS source data;
- excluded from GDS/OAS export until a future explicit "export drawn mask" feature exists.

"Temporary" therefore means project-local rather than transient-in-memory.

## Geometry abstraction

Replace the current File-specific process dependency with one source-neutral entry point:

```js
activeMaskGeometry();
```

Conceptually:

```js
function activeMaskGeometry() {
  return maskSourceMode === 'draw'
    ? drawnMaskGeometry(drawMask)
    : selectedFileMaskGeometry(layout, selectedLayerKeys, maskTransform);
}
```

Process should use this function for:

- Selected mask;
- Invert mask;
- exposed-layer target filtering when the process area is mask-based.

This avoids branching throughout Deposit / Extend / Etch / Implant.

### Draw composition

For v1, all visible Draw shapes compose by **union**.

Do not add per-shape boolean modes initially. Existing Process `Invert mask` already supplies the most important negative-tone operation.

A future v2 could add shape roles:

- Add;
- Subtract;
- Intersect.

That should wait until there is a concrete use case.

## Rendering

Mask render order in Draw mode:

1. neutral dashed current-structure topography reference;
2. drawn mask geometry at current Mask Opacity;
3. selected shape outline / handles;
4. axes and cursor readout.

File mode remains:

1. neutral dashed structure reference;
2. imported mask at current Mask Opacity;
3. axes and cursor readout.

Do not show ROI in Mask. ROI remains Main-owned and only affects 3D clipping.

## Selection and editing controller

Create a dedicated module rather than putting Draw logic into `app.js`:

`site/controllers/draw-mask-controller.js`

Responsibilities:

- creation tool state;
- hit testing;
- selected shape ID;
- move/resize/vertex editing;
- keyboard cancellation/deletion;
- exact numeric editor sync;
- render invalidation.

Pure geometry helpers should live separately, for example:

`site/draw-mask-geometry.js`

Responsibilities:

- normalization;
- shape → polygon conversion;
- union geometry;
- handle positions;
- resize / translation;
- hit testing helpers that do not depend on DOM.

This keeps the existing imported-layout controller independent.

## UI state vs project state

Persist:

- `maskSourceMode`;
- drawn shapes.

Do not persist ephemeral editor state:

- active drawing tool;
- selected handle;
- pointer drag;
- unfinished polygon;
- hover state.

The selected shape ID may be treated as UI-only unless a clear restore use case appears.

## File / Draw switching rules

Switching **File → Draw**:

- preserve imported layout, layer selections, alignment transform;
- render existing Draw shapes if any;
- cancel any File-only hover state.

Switching **Draw → File**:

- preserve all drawn shapes;
- cancel an unfinished shape;
- restore the imported File view immediately.

No confirmation is needed for switching modes because neither mode destroys data.

Require confirmation for **Clear Draw Mask** when shapes exist.

## Export semantics

- **Mask SVG** should export the currently active Mask source.
- Project Save stores both File and Draw state.
- GLB remains physical structure only.
- No automatic GDS/OAS export of Draw geometry in v1.

If Draw-to-GDS is added later, make it an explicit command with layer/datatype assignment rather than silently merging temporary shapes into the imported layout.

## Tests

Add pure tests for:

- Rect/Circle/Polygon normalization;
- Draw-shape translation and resize;
- union of multiple shapes;
- active source switching;
- project/snapshot round-trip;
- File state preserved across Draw mode;
- Draw state preserved across File mode;
- Process Selected/Invert area uses the active source.

Browser smoke:

- default source is File;
- switch to Draw;
- create Rect;
- move / resize it after creation with tool inactive;
- Process applies through Draw mask;
- switch back to File and verify imported mask still exists;
- switch to Draw and verify temporary shape still exists;
- double-click Mask still Fits in both modes.

## Suggested implementation order

1. Introduce `maskSourceMode` and empty `drawMask` project state with schema/migration defaults.
2. Extract `selectedFileMaskGeometry()` and add `activeMaskGeometry()`.
3. Add File / Draw header switch without drawing tools yet.
4. Add pure Draw geometry module and tests.
5. Add Rect and Circle creation/editing.
6. Add Polygon.
7. Wire Process Selected/Invert to active source.
8. Add project/snapshot persistence and active-source SVG export.
9. Run browser/product regression and visual review.

This order keeps process semantics stable while the Draw editor is developed.
