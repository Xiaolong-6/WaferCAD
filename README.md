# WaferCAD

WaferCAD is a browser-based **Visual Process CAD** and geometric process emulator for mask-driven micro- and nanofabrication. It is positioned between layout viewers/static 2.5D layer extruders and physics-based process TCAD: the goal is rapid, interactive construction and inspection of process topology without implying predictive fabrication physics.

Its core question is practical: **given this mask and this sequence of process steps, what layered structure should I expect geometrically?** The intended uses are process-flow sketching, device-structure review, teaching, communication, and geometry handoff. WaferCAD is not a replacement for a full layout editor or a calibrated TCAD process simulator.

The application is deployed as a static GitHub Pages site. It has four synchronized views:

- **Mask** — switch between imported **File** masks (GDSII/OASIS hierarchy, global layer/datatype selection and alignment) and project-local **Draw** masks (Rectangle/Circle/Polygon/Ring/Ring Sector), with adjustable opacity above the current active-face topography outline and filtered **SVG/GDSII/OASIS** export; an active Mask ROI crops every export format.
- **3D** — vector extrusion of the current structure with global opacity, transparency-aware interface borders, geometry-displaced rough/pyramid surfaces, conformal display shells that preserve inherited rough interfaces, depth-gradient Implant overlays, opaque ROI cut-face visibility for buried implants, **Fast / Quality** render-mesh modes with temporary Interactive LOD during camera motion, morphology-aware physical GLB export with a bounded tessellation budget, and 3× PNG capture.
- **Main** — front/back surface view with XY axes, an A–B coordinate editor, SVG export, and in-page maximize.
- **Section A–B** — cross-section generated from the same vector geometry model, with Auto/1:1 scaling, SVG export, and in-page maximize.

## Geometry model

XY geometry stays vector. WaferCAD stores non-overlapping polygon regions and a Z stack for each region. Process Geometry Kernel v2 derives one runtime surface topology from that canonical model: exposed faces, buried material interfaces, true voids, genuine vertical walls, Section slices, and 3D slab/cap boundaries share the same geometry facts. Deposit, Extend, Etch, Selected/Invert/Whole-face area selection, 3D rendering, and section generation therefore remain tied to one canonical material geometry. Rough/Pyramid surface morphology is stored as deterministic appearance metadata, while Implant is stored separately as a structural annotation volume. These display layers deliberately enrich inspection without redefining the canonical ideal 2.5D process solid.

Repeated full-wafer structures may remain compact as **canonical translation arrays**: shared physical model templates plus translated instances and exclusive tile domains. Array-aware Process, Main, Section and 3D paths preserve the same physical region-stack contract without eagerly duplicating every site. Copy-on-write creates a new template only when a physical context actually diverges.

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

## Product manual

The [GitHub Wiki](https://github.com/Xiaolong-6/WaferCAD/wiki) is the full product user manual, including startup, workspace navigation, mask/ROI, Process, Recipe, History/Variants, project recovery, import/export, examples and modeling limits. Its [illustrated Process Operations chapter](https://github.com/Xiaolong-6/WaferCAD/wiki/Process-Operations) embeds Before → After diagrams for all 18 operation variants. The compact dynamic version remains under Apply in the Process panel; its Guide link opens the same Wiki chapter.

Source pages in `docs/wiki/` are checked on every `main` push and synchronized to the Wiki only if their content changed. The detailed Process chapter is generated from the same catalog used by the UI. First-time Wiki initialization and any required write token are documented in [Wiki sync](docs/WIKI_SYNC.md).

## Operations

Operations can target the front or back face and use one of three areas:

- Selected mask
- Invert mask
- Whole face

Available actions:

- Deposit new layer — directional, conformal, or Transfer / Laminate
- Extend existing layer — directional or conformal
- Etch / subtract — directional, material-selective, isotropic release, Planarize / CMP, and Undercut release
- Implant
- Electrical Region (non-material induced/doped/interface annotation)
- Record process step (non-geometric fabrication metadata)

Deposit and Extend support Directional and Conformal coverage. Conformal Extend reuses the same coating kernel as Conformal Deposit but keeps the selected existing layer id, while Directional Extend only thickens already exposed target material. Transfer / Laminate defaults to **Follow surface**, which places the transferred film on each local exposed horizontal surface without coating sidewalls or inventing film inside true voids. **Flat bridge** retains the membrane behavior at one global exposed plane and can bridge openings without filling the void beneath. Legacy saved Transfer steps without a placement mode replay with the historical Flat-bridge semantics. Directional Etch is vertical subtraction and can either remove exposed materials in stack order or target one currently exposed material and stop when the next different material is reached. Planarize / CMP trims material to an absolute target Z plane without adding fill, while Undercut release laterally removes one exposed sacrificial material. Directional Etch Surface can remain Smooth or attach Stochastic Rough / Pyramid morphology with Normal or Inverted orientation. Surface morphology changes rendering, not the canonical material stack.

**Process Recipe** is a guided programming mode in the Process panel. Switch from Manual to Recipe to add and reorder typed operations, edit parameters in an inspector, or use the restricted, non-evaluating Code editor. Templates, validation, per-step execution, stop controls, and Recipe-only Undo/Redo share the existing process worker/Kernel. The Recipe is saved inside the `.wafercad` project. **Start** defaults to _Continue current model_: existing Process revisions require confirmation, because applying the same Recipe again changes geometry again. Choose _Rebuild Base first (new Main)_ for a fresh process lineage using the Base panel dimensions; this prompts to archive the previous Main History as a restorable Variant or clear it. Successful Manual operations can optionally be recorded into the Recipe.

**Record** adds fabrication metadata such as Anneal, Clean, Oxidation, Surface treatment, Activation, or a custom process directly to History without changing material geometry. This keeps literature/process-flow reconstructions chronological without pretending that WaferCAD simulates thermal chemistry or diffusion.

Electrical Region is a separate non-material annotation for schematic p/n regions, inversion, accumulation, depletion, and interface/induced/doped regions. It is anchored to the selected exposed process surface, uses a display depth, follows later Etch by clipping against surviving material, and can be renamed/recolored/hidden from Layers. It does not solve electrostatics, carrier concentration, junction fields, or transport.

The Implant action is intentionally structural rather than physical: it marks the outermost mask-selected surface and creates a user-named implant zone with an empirical depth and signed X tilt. Color is assigned after Apply from the active 20-color structure palette and can be changed from the Layers legend. Main uses a light overlay; Section and 3D share one normalized surface-to-depth gradient convention. In opaque 3D the buried volume stays hidden, while an active ROI that cuts the implant exposes only its gradient cut face; transparent inspection additionally reveals the internal volume. Later Etch operations geometrically clip that existing implant, including rough-profile display, without modeling dopant species, dose, energy, range straggle, channeling, activation, diffusion, or electrical behavior. See `docs/IMPLANT.md`.

## Safety

Rebuilding the base is treated as a reversible operation. If a processed structure already exists, WaferCAD asks for confirmation. The previous structure can be restored with Revert or Undo.

## Repository layout

- `site/` — deployed browser application, including the data-driven Welcome example-family catalog and bundled editable examples
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

`npm run check` runs ESLint, the current Prettier gate, documentation generation/link checks, and the focused Node geometry/project-format regression tests. Use `npm run format` to format the active application and current documentation. See the [documentation map](docs/README.md) for current contracts, [Testing](docs/testing.md) for browser groups and approved platform-specific baselines, and [Development handoff](docs/COLLABORATION.md) for shared ChatGPT/Codex workflow. Dated validation files such as [2026-10-05 validation](docs/VALIDATION_2026-10-05.md) are historical evidence for their recorded revision, not a claim about the latest `main`.

## Project-file safety

Project JSON is versioned and migrated before it can replace the current editor state. The current format is **v14**. The **Project** tab opens first; **Save** creates a local browser Recovery checkpoint, while **Export** downloads the `.wafercad` file. Validation covers the vector model, non-overlapping region geometry, Z stacks, layer references, surface morphology, Implant records, Electrical Region records, mask layout, hierarchy, transforms, ROI/section/view state, display settings, and conservative size limits. Earlier formats, including the v6 File/Draw-mask introduction and v12 stochastic-surface format, migrate forward deterministically; v13 adds Pyramid morphology and v14 adds first-class Electrical Region annotations. Repeated snapshot layout/model assets are shared. Compact export uses a 0.1 nm grid and validates the expanded result; export automatically selects lossless storage when that grid would change canonical Z/depth/profile lengths in the model or any restorable History state, or would invalidate geometry. Autosave and Recovery remain lossless. Repetitive canonical-array projects use `shared-assets-v4`, which stores shared model templates and array instance lists; older readers that do not support v4 must reject those files rather than silently dropping array geometry. Save and Open share the same 256 MB project limit, and invalid or damaged files fail at the file boundary rather than later during rendering.

See `THIRD_PARTY_NOTICES.md` and `site/vendor/README.md` for active third-party dependencies.

## License

WaferCAD is released under the MIT License. See `LICENSE`.

### Product verification

[Interaction and visual regression](docs/PRODUCT_REVIEW.md) covers wide, intermediate and phone layouts, actual A/B/ROI editing and generated browser review artifacts. [Process benchmarks](docs/PROCESS_BENCHMARKS.md) specify and test the current 2.5D Directional/Conformal/Etch semantics and their limits. [Process Geometry Kernel v2](docs/PROCESS_GEOMETRY_KERNEL_V2.md) defines the shared topology contract used by Process, Section, and 3D.
