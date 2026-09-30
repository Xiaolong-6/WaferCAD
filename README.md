# WaferCAD

WaferCAD is a browser-only vector 2.5D editor for building and inspecting mask-driven layered structures.

The application is deployed as a static GitHub Pages site. It has four synchronized views:

- **Mask** — GDSII/OASIS hierarchy, global layer/datatype selection, alignment, and a render-only 3D ROI.
- **3D** — vector extrusion of the current structure with global opacity and optional interface borders.
- **Main** — front/back surface view with XY axes and an A–B coordinate editor.
- **Section A–B** — cross-section generated from the same vector geometry model.

## Geometry model

XY geometry stays vector. WaferCAD stores non-overlapping polygon regions and a Z stack for each region. Add, Grow, Etch, Selected/Invert/Whole-face area selection, 3D rendering, and section generation all use the same geometry state.

- **X, Y and Z** are stored internally in micrometres. Imported GDSII database units are converted from the file's `UNITS` record; OASIS database units are converted from the `START` record. The global display/input unit can be switched between nm, µm, and mm without changing geometry.
- Section and 3D may stretch Z for visibility; that display scaling never changes the saved physical Z coordinates.
- Layers use stable internal IDs. Their names are editable; colors come from curated structure palettes or a generated harmonious palette.

## Mask model

Cells and Layers are separate concepts:

WaferCAD accepts `.gds`, `.gdsii`, `.oas`, and `.oasis` mask files. OASIS import supports the common cell/placement, rectangle, polygon, path, circle, modal-coordinate, repetition, and CBLOCK records used by the browser editor; unsupported extension geometry is rejected explicitly instead of being silently misread.

- **Cells** follows the imported GDSII/OASIS hierarchy.
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
- `legacy/` — selected archived implementation/reference material; not used by the current application
- `.github/workflows/pages.yml` — GitHub Pages deployment

## Local preview

```bash
python -m http.server 8000 --directory site
```

Then open `http://localhost:8000`.

For development checks:

```bash
npm ci
npm run check
```

`npm run check` runs ESLint, the current Prettier gate, and the geometry/project-format self-tests. Use `npm run format` to format the active application and current documentation.

## Project-file safety

Project JSON is versioned and migrated before it can replace the current editor state. Validation covers the vector model, non-overlapping region geometry, Z stacks, layer references, mask layout, hierarchy, transforms, ROI/section/view state, display settings, and conservative size limits. Save and Open share the same 64 MB project limit, and invalid or damaged files fail at the file boundary rather than later during rendering.

See `THIRD_PARTY_NOTICES.md` and `site/vendor/README.md` for active third-party dependencies.

### Product verification

[Interaction and visual regression](docs/PRODUCT_REVIEW.md) covers wide, intermediate and phone layouts, actual A/B/ROI editing and generated browser review artifacts. [Process benchmarks](docs/PROCESS_BENCHMARKS.md) specify and test the current 2.5D Direct/Conformal/Etch semantics and their limits.
