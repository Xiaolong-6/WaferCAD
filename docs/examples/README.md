# Literature reconstructions and provenance

## Published Welcome projects: product status versus scientific evidence

The authoritative **published project list and titles** are defined in
[`site/bundled-examples.js`](../../site/bundled-examples.js). The
[user-facing catalog](../wiki/Examples-and-Modeling-Limits.md) explains
what each project shows, while the
[machine-readable figure matrix](../evidence/LITERATURE_FIGURE_MATRIX_2026-10-16.json)
and [figure evidence register](../evidence/SCIENCE_FIGURE_EVIDENCE_2026-10-16.md)
record paper sources and the acceptance boundary. The current register does not
record an accepted original-paper figure match.

**Do not conflate these independently scoped claims:**

| Claim | What it establishes | What it does not establish |
| --- | --- | --- |
| Published on Welcome | An editable `.wafercad` project can be opened from the current catalog | Process fidelity, full-Recipe replay or calibrated device performance |
| Original/author GDS | Geometric mask polygons came from a source package | Correct layer-purpose mapping, resist/undercut physics or fabricated cross-sections |
| Reconstructed mask | WaferCAD geometry follows stated or explicitly inferred design dimensions | Possession of the author's original GDS or paper-image equivalence |
| Saved History / Recipe | The project contains inspectable states or executable operation text | A fresh full-project replay on the current commit |
| Figure match | Independently measured registration/tolerances and reviewed reference figures | No match is accepted until the evidence register explicitly records acceptance |

## Source and modeling assumptions for published projects

- [Photodetector reconstruction](PHOTODETECTOR_RECONSTRUCTION_V2_2026-10-08.md) — Black-Si / Ge research sources, implanted versus electrical annotations and inferred process assumptions. Later Front/Back consolidation is [historical evidence](../archive/examples/EXAMPLE_BOTH_FACE_CONSOLIDATION_2026-10-13.md).
- [TiO₂ metalens reconstruction](TIO2_METALENS_RECONSTRUCTION_2026-10-09.md) — four-unit process, 4,725 active sites in the illustrative GRID array, and explicit separation from unavailable author-mask data and optical design.
- [TFLN ring source reconstruction](../../examples/projects/tfln-10x8-recovery/README.md) — source/assumption boundaries for the 10×8 reconstruction; author GDS is unavailable.
- [HBAR author-GDS reconstruction](../../examples/projects/hbar-blesin-2024-candidate/README.md) — officially published project with saved operations; layer roles and release geometry remain provisional.
- [Transmon Q2 author-GDS geometry](../../examples/projects/transmon-nature-communications-2025-candidate/README.md) — published research geometry with one final native material checkpoint; bilayer resist/development and Josephson junction flow are **not** replayable in the standard editor (see [#382](https://github.com/Xiaolong-6/WaferCAD/issues/382)).
- [Other source packages and authoring fixtures](../../examples/projects/README.md) — additional family-specific materials, scripts and assumptions. A `candidate` folder name does not imply that its derived Welcome project remains unpublished.

The published Microdisk uses the **Continuous** M08 geometric release,
not an earlier eight-/72-band experiment. Its 36 µm reach is assumed, and
the reference SEM shows a similar disk, not an accepted quantitative match.
See [current release contract](../science/CONTINUOUS_RELEASE_CONTRACT.md).

## Open research and dated evidence

- [Physical Facet opt-in research](../science/PHYSICAL_FACET_MODELING_2026-10-16.md) — not a requirement for normal Welcome projects.
- [Merged Both-face example migration](../archive/examples/EXAMPLE_BOTH_FACE_CONSOLIDATION_2026-10-13.md) — dated PR #194 decisions and regeneration commands; not a fresh replay certificate.
- [TiO₂ full-array loading measurement](../archive/examples/TIO2_METALENS_PERFORMANCE_2026-10-10.md) — controlled measurements at their original product SHA, not general performance.
- [Earlier eight-family literature inspection](../archive/examples/EXAMPLE_LITERATURE_FIDELITY_2026-10-14.md) — historical 2026-10-14 evidence, not current-catalog acceptance.

Historical screenshots, performance measurements and regression results
apply only to the named project, revision and environment. They cannot
certify changed assets or promote inferred geometry into original paper data.
