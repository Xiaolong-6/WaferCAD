# Literature reconstructions and provenance

## Current published catalog

`site/bundled-examples.js` and the
[figure evidence matrix](../evidence/LITERATURE_FIGURE_MATRIX_2026-10-16.json)
are the versioned source of truth for the currently promoted Welcome
projects and their publication citations. The
[research figure evidence register](../evidence/SCIENCE_FIGURE_EVIDENCE_2026-10-16.md)
records source panels, model assumptions and explicit
**open-paper-match** states; no family is certified as an
original-paper micrograph match.

[User-facing examples and modeling limits](../wiki/Examples-and-Modeling-Limits.md)
describe the current shipped project geometry. In particular,
the full Microdisk is Continuous-release M08, not the
historical eight- or 72-band experimental state. The
36 µm reach is an assumption, and the cited SEM is from
a similar disk. The T-CMOS and suspended TFLN projects retain explicit engineering Mask/geometry assumptions; the published HBAR and Transmon projects preserve source-GDS provenance but do not establish physical process calibration or paper-figure acceptance.

- [TFLN ring reconstruction source](../../examples/projects/tfln-10x8-recovery/README.md) — 80-site reconstructed Mask and project; original author GDS unavailable.
- [HBAR original-GDS reconstruction](../../examples/projects/hbar-blesin-2024-candidate/README.md) — officially published project with 11 saved operations; layer roles and release geometry are provisional.
- [Transmon Q2 original-GDS geometry](../../examples/projects/transmon-nature-communications-2025-candidate/README.md) — officially published research geometry with one saved checkpoint; the physical bilayer resist/development and Josephson junction flow are not replayable in the standard editor (tracked in [#382](https://github.com/Xiaolong-6/WaferCAD/issues/382)).

These current examples differ in replay status. **Published** means the project is
accessible from Welcome, not that its full fabrication process, paper-figure
correspondence, electrical behavior or fresh end-to-end Recipe replay is certified.
See the project-specific evidence and the [figure evidence register](../evidence/SCIENCE_FIGURE_EVIDENCE_2026-10-16.md).

## Research reconstruction work and open experiments

- [Photodetector reconstruction](PHOTODETECTOR_RECONSTRUCTION_V2_2026-10-08.md) — device process and paper inputs.
- [TiO₂ metalens reconstruction](TIO2_METALENS_RECONSTRUCTION_2026-10-09.md) — mask assumptions, 4,725-site final array.
- [TiO₂ metalens performance](TIO2_METALENS_PERFORMANCE_2026-10-10.md) — dated hardware/fixture evidence.
- [Both-face example consolidation](EXAMPLE_BOTH_FACE_CONSOLIDATION_2026-10-13.md) — revision-scoped process migration.
- [Current Continuous release contract](../science/CONTINUOUS_RELEASE_CONTRACT.md) — source-derived material semantics.
- [Candidate/authoring projects](../../examples/projects/README.md) — nonpromoted experimental fixtures and source inputs.

## Historical accepted/bounded evidence

- [Eight-family literature audit, 2026-10-14](../archive/examples/EXAMPLE_LITERATURE_FIDELITY_2026-10-14.md) — preserved original eight-project source inspection and limitations, **not** current-catalog acceptance.

Historical screenshot and regression records identify their own
project SHA, browser environment and authoring assumptions. They
cannot be reused to certify a different saved asset or promote an
inferred GDS layout to original manufacturer evidence.
