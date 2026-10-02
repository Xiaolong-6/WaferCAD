# WaferCAD

WaferCAD is a browser-based **Visual Process CAD** and geometric process emulator for mask-driven micro- and nanofabrication. It is positioned between layout viewers/static 2.5D layer extruders and physics-based process TCAD: the goal is rapid, interactive construction and inspection of process topology without implying predictive fabrication physics.

Its core question is practical: **given this mask and this sequence of process steps, what layered structure should I expect geometrically?** The intended uses are process-flow sketching, device-structure review, teaching, communication, and geometry handoff. WaferCAD is not a replacement for a full layout editor or a calibrated TCAD process simulator.

The application is deployed as a static GitHub Pages site. It has four synchronized views:

- **Mask** — switch between imported **File** masks (GDSII/OASIS hierarchy, global layer/datatype selection and alignment) and project-local **Draw** masks (Rectangle/Circle/Polygon/Ring/Ring Sector), with adjustable opacity above the current active-face topography outline and filtered **SVG/GDSII/OASIS** export; an active Mask ROI crops every export format.
- **3D** — vector extrusion of the current structure with global opacity, transparency-aware interface borders, geometry-displaced rough/pyramid surfaces, conformal display shells that preserve inherited rough interfaces, surviving internal Implant overlays whose alpha follows the global 3D opacity, physical GLB export, and 3× PNG capture.
- **Main** — front/back surface view with XY axes, an A–B coordinate editor, SVG export, and in-page maximize.
- **Section A–B** — cross-section generated from the same vector geometry model, with Auto/1:1 scaling, SVG export, and in-page maximize.

## Geometry model

XY geometry stays vector. WaferCAD stores non-overlapping polygon regions and a Z stack for each region. Process Geometry Kernel v2 derives one runtime surface topology from that canonical model: exposed faces, buried material interfaces, true voids, genuine vertical walls, Section slices, and 3D slab/cap boundaries share the same geometry facts. Deposit, Extend, Etch, Selected/Invert/Whole-face area selection, 3D rendering, and section generation therefore remain tied to one canonical material geometry. Rough/Pyramid surface morphology is stored as deterministic appearance metadata, while Implant is stored separately as a structural annotation volume. These display layers deliberately enrich inspection without redefining the canonical ideal 2.5D process solid.

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

- Deposit new layer
- Extend existing layer
- Etch / subtract
- Implant **(experimental)**

Deposit and Extend support Directional and Conformal coverage. Conformal Extend reuses the same coating kernel as Conformal Deposit but keeps the selected existing layer id, while Directional Extend only thickens already exposed target material. Etch is vertical subtraction and has no coverage mode; its Surface setting can remain Smooth or attach Stochastic Rough / Pyramid morphology with Normal or Inverted orientation. Surface morphology changes rendering, not the canonical material stack.

The experimental Implant action is intentionally structural rather than physical: it marks the outermost mask-selected surface and creates a user-named implant zone with an empirical depth and signed X tilt. Color is assigned after Apply from the active 20-color structure palette and can be changed from the Layers legend. Main uses a light overlay, Section shows the gradient volume, and 3D shows the surviving internal volume. Later Etch operations geometrically clip that existing implant, including rough-profile display, without modeling dopant species, dose, energy, range straggle, channeling, activation, diffusion, or electrical behavior. See `docs/IMPLANT_EXPERIMENTAL.md`.

## Safety

Rebuilding the base is treated as a reversible operation. If a processed structure already exists, WaferCAD asks for confirmation. The previous structure can be restored with Revert or Undo.

## Repository layout

- `site/` — deployed browser application
- `docs/` — current architecture, usage, and development documentation
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

Project JSON is versioned and migrated before it can replace the current editor state. The current format is **v13**. The **Project** tab opens first; **Save** creates a local browser Recovery checkpoint, while **Export** downloads the `.wafercad` file. Validation covers the vector model, non-overlapping region geometry, Z stacks, layer references, surface morphology, Implant records, mask layout, hierarchy, transforms, ROI/section/view state, display settings, and conservative size limits. Earlier formats, including the v6 File/Draw-mask introduction and v12 stochastic-surface format, migrate forward deterministically; v13 adds Pyramid morphology. Repeated snapshot layout/model assets are shared and persisted physical coordinates are normalized to 0.1 nm. Save and Open share the same 256 MB project limit, and invalid or damaged files fail at the file boundary rather than later during rendering.

See `THIRD_PARTY_NOTICES.md` and `site/vendor/README.md` for active third-party dependencies.

## License

WaferCAD is released under the MIT License. See `LICENSE`.

### Product verification

[Interaction and visual regression](docs/PRODUCT_REVIEW.md) covers wide, intermediate and phone layouts, actual A/B/ROI editing and generated browser review artifacts. [Process benchmarks](docs/PROCESS_BENCHMARKS.md) specify and test the current 2.5D Directional/Conformal/Etch semantics and their limits. [Process Geometry Kernel v2](docs/PROCESS_GEOMETRY_KERNEL_V2.md) defines the shared topology contract used by Process, Section, and 3D.
