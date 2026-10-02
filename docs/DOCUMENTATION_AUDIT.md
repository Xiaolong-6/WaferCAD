# Documentation audit — 2026-10-02

This audit reconciles the current feature-branch documentation with the merged compact Function panel, surface-morphology work, and experimental Implant follow-up.

## Audited product contracts

- **Workspace layout:** desktop is Main / Mask / Function above 3D / Section; narrow layout remains Function/3D, Main/Mask, Section.
- **Project format:** current schema version is v13. v12 stochastic morphology/polarity and older supported project files migrate forward.
- **Etch surface modes:** Smooth, stochastic Rough, and deterministic Pyramid. Non-smooth modes use Normal/Inverted polarity and remain render-only appearance metadata over ideal 2.5D material geometry.
- **Renderer consistency:** Section A–B and 3D consume the same deterministic surface profile. 3D uses geometry displacement with a bounded tessellation budget rather than a separate grain/bump texture. Main and Mask only add subtle neutral darkening over non-smooth wafer regions.
- **Implant:** remains a non-material structural annotation. Process no longer asks for a pre-Apply color; Apply assigns from the active 20-color structure palette. Layers owns rename/color/visibility. Main uses a light overlay, Section shows the clipped gradient volume, and 3D shows the surviving internal volume plus its current exposed/cut surface. Later Etch clips existing Implant volume.
- **Palette contract:** curated and Random structure palettes contain 20 colors and include Implant annotations.
- **Export/persistence:** render-only morphology and Implant overlays do not redefine the canonical material solid used by physical process geometry. Project validation covers morphology and Implant metadata.
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
- `docs/IMPLANT_EXPERIMENTAL.md`
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
- v13 project schema;
- 20-color Implant-aware palettes;
- shared rough/Pyramid profile support in Section and 3D;
- clipped Implant solids in 3D and Section;
- subtle Main/Mask morphology overlays.

JavaScript syntax checks passed for the touched application, controller, renderer, smoke-test, and project-schema files.

A full browser/WebGL visual pass is still the required final check for relief quality, transparency ordering, and compact-layout appearance. The current environment could not clone the repository for a local Chromium run, so this audit does not claim a fresh full browser regression.
