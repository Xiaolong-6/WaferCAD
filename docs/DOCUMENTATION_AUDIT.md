# Documentation audit — 2026-10-02

This audit reconciles the current feature-branch documentation with the merged compact Function panel, surface-morphology work, Implant structural-annotation follow-up, and the final 3D roughness/opacity fixes prepared for merge to `main`.

## Audited product contracts

- **Product positioning:** WaferCAD is Visual Process CAD / a geometric process emulator for rapid mask-to-topography reasoning. It sits between layout/static-extrusion tools and physics-based TCAD. It must not claim predictive process fidelity, calibrated implantation/deposition physics, or full mask-layout editing.
- **Workspace layout:** desktop is Main / Mask / Function above 3D / Section; narrow layout remains Function/3D, Main/Mask, Section.
- **Project format:** current schema version is v14. v12 stochastic morphology/polarity, v13 Pyramid morphology, and older supported project files migrate forward; v14 adds first-class Electrical Region annotations.
- **Etch surface modes:** Smooth, stochastic Rough, and deterministic Pyramid. Non-smooth modes use Normal/Inverted polarity and remain render-only appearance metadata over ideal 2.5D material geometry.
- **Renderer consistency:** Section A–B and 3D consume the same deterministic surface profile. 3D uses geometry displacement with bounded scope-aware tessellation and profile-derived normals rather than a separate grain/bump texture. Inherited buried rough interfaces share the same displacement direction, so conformal display shells retain the micro-profile on inner and outer boundaries. Rough regions suppress the duplicate ideal horizontal cap border. Main and Mask only add subtle neutral darkening over non-smooth wafer regions.
- **Electrical Region:** is a first-class non-material annotation for induced/doped/interface p/n regions, inversion, accumulation, depletion, and custom schematic electrical regions. It clips against surviving material after Etch and remains explicitly non-solver semantics.
- **Implant:** remains a separate non-material structural annotation. Process no longer asks for a pre-Apply color; Apply assigns from the active 20-color structure palette. Layers owns rename/color/visibility. Main uses a light overlay, Section shows the clipped gradient volume, and 3D shows the surviving internal volume plus its current exposed/cut surface. 3D body/cap alpha scales with the global Opacity control, and depth testing ensures opaque host material hides buried Implant volume while transparent inspection reveals it. Later Etch clips existing Implant volume.
- **Palette contract:** curated and Random structure palettes contain 20 colors and include Implant and Electrical Region annotations.
- **Export/persistence:** render-only morphology, Implant overlays, and Electrical Region overlays do not redefine the canonical material solid used by physical process geometry. Mask export supports SVG, GDSII, and OASIS; File/Draw source, Cell/Layer filters, alignment, and active Mask ROI are resolved before binary serialization. Project validation covers morphology, Implant metadata, and Electrical Region type/source/geometry metadata.
- **Conformal geometry hygiene:** sub-0.1 nm uncovered slivers are treated as numerical partition cracks and healed before true-void detection, preventing a mask/rough-step seam from becoming a full-depth conformal channel. Genuine trenches wider than the persistence precision remain physical voids and continue to receive sidewall coating.
- **Conformal Extend:** uses the same coating kernel as Conformal Deposit with the existing target layer id; Directional Extend retains the narrower exposed-target-only behavior.
- **Project Save/Export:** Project is the first/default tab. Save creates a local browser Recovery checkpoint; Export downloads the project file; Recovery can be restored or cleared independently of the current autosave.

## Documents updated

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/USAGE.md`
- `docs/DEVELOPMENT.md`
- `docs/PROCESS_BENCHMARKS.md`
- `docs/PRODUCT_REVIEW.md`
- `docs/MASK_DRAW_PLAN.md`
- `docs/COMPETITIVE_LANDSCAPE.md`
- `docs/IMPLANT.md`
- `docs/ROUGHNESS_MORPHOLOGY.md`

## Documents reviewed without contract changes

- `docs/KLAYOUT_LAYOUT_COMPATIBILITY.md` — parser/import scope is unaffected by the merged renderer/UI work.
- Third-party notices/vendor documentation — dependency provenance is unaffected.
- Review screenshots under `docs/review/` — historical artifacts are kept as evidence of their original run rather than rewritten as current screenshots.

## Verification status

Static consistency checks confirm that the current branch has:

- no Process-level `implantColor` control/reference;
- Pyramid in the Etch Surface selector;
- compact two-column Process parameter grids;
- v14 project schema with v13 migration coverage;
- 20-color Implant/Electrical-aware palettes;
- shared rough/Pyramid profile support in Section and 3D;
- scope-aware rough mesh budgets and profile-derived 3D normals;
- inherited rough interface pairing for conformal display shells;
- rough-border suppression of the ideal internal cap line;
- clipped Implant and Electrical Region solids in 3D/Section with global 3D opacity coupling;
- sub-grid seam healing before Conformal true-void detection;
- ROI-aware Mask GDSII/OASIS serialization with round-trip parser coverage;
- KLayout compatibility CI is triggered by changes to the Mask binary exporter as well as the import parsers;
- true through-trench sidewall semantics and the 0.1 nm numerical-crack threshold are aligned between implementation, tests, and process documentation;
- subtle Main/Mask morphology overlays.

JavaScript syntax checks passed for the touched 3D renderer, view-geometry helper, surface-rendering helper, self-test, and focused 3D-control regression after the final fixes.

A full browser/WebGL visual pass is still the required final check for relief quality and transparency ordering. The pull-request product regression now includes explicit opaque/transparent captures of a buried Implant, alongside the rough-surface captures; this audit does not treat static assertions alone as visual proof.
