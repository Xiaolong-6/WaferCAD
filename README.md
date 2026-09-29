# WaferCAD

WaferCAD is a browser-only vector 2.5D editor for building and inspecting mask-driven layered structures.

The application is deployed as a static GitHub Pages site. It has four synchronized views:

- **Mask** — GDSII hierarchy, global layer/datatype selection, alignment, and a render-only 3D focus region.
- **3D** — vector extrusion of the current structure with an editable layer legend.
- **Main** — front/back surface view with XY axes and an editable A–B section line.
- **Section A–B** — cross-section generated from the same vector geometry model.

## Geometry model

XY geometry stays vector. WaferCAD stores non-overlapping polygon regions and a Z stack for each region. Add, Grow, Etch, Selected/Invert/Whole-face area selection, 3D rendering, and section generation all use the same geometry state.

- **XY** is stored internally in micrometres. Imported GDSII database units are converted from the file's `UNITS` record. The global display unit can be switched between nm, µm, and mm without changing geometry.
- **Z** is intentionally relative. Thickness and Z values are not assigned a physical unit.
- Layers use stable internal IDs. Their names are editable; colors come from curated structure palettes or a generated harmonious palette.

## Mask model

Cells and Layers are separate concepts:

- **Cells** follows the GDS hierarchy.
- **Layers** is a global unique `layer/datatype` list.
- Selecting a cell defines the active hierarchy scope.
- Layers that do not exist in the active cell/subtree remain visible but are visually de-emphasized.
- Zero-width linework may be displayed but is not treated as an operable mask area.

## Operations

Operations can target the front or back face and use one of three areas:

- Selected mask
- Invert mask
- Whole face

Available actions:

- Add new layer
- Grow current layer
- Etch / subtract

Add and Grow support Direct and Conformal modes. Etch is vertical subtraction and has no growth mode.

## Safety

Rebuilding the base is treated as a reversible operation. If a processed structure already exists, WaferCAD asks for confirmation. The previous structure can be restored with Revert or Undo.

## Repository layout

- `site/` — deployed browser application
- `docs/` — current architecture, usage, and development documentation
- `legacy/` — archived pre-rewrite implementation and documentation; not used by the current application
- `.github/workflows/pages.yml` — GitHub Pages deployment

## Local preview

```bash
python -m http.server 8000 --directory site
```

Then open `http://localhost:8000`.

Run the dependency-free geometry smoke test with:

```bash
node site/selftest.mjs
```
