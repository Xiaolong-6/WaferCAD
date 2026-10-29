# Scientific contracts

WaferCAD's geometry calculations use idealized material ownership and
physical micrometre coordinates; none of these files implies calibrated
process kinetics or predictive TCAD.

## Current implementation and numerical contracts

- [Process Geometry Kernel v2](PROCESS_GEOMETRY_KERNEL_V2.md) — exposed surfaces, physical sidewalls and owned material; includes the [shipped but bounded read-only Geometry Diagnostics contract](PROCESS_GEOMETRY_KERNEL_V2.md#read-only-geometry-diagnostics).
- [Process benchmarks](PROCESS_BENCHMARKS.md) — independent analytic geometry invariants.
- [Continuous release](CONTINUOUS_RELEASE_CONTRACT.md) — **experimental but selectable** single-release analytic material owner and its unsupported follow-on operations.
- [Numerical and physical interpretation](PROCESS_NUMERICAL_CONTRACT_2026-10-14.md) — physical precision, compact versus lossless semantics.
- [Both-face Process](PROCESS_BOTH_FACE_2026-10-11.md) — atomic Front/Back and paired Layer identities.
- [Implant annotation](IMPLANT.md) — annotation limits and visual contract.
- [Rough/Pyramid morphology](ROUGHNESS_MORPHOLOGY.md) — display displacement versus physical geometry.
- [Mask File and Draw](MASK_DRAW.md) — process-area and independent Mask source ownership.
- [Physical unit editing](PHYSICAL_UNIT_EDIT_INTEGRITY_2026-10-13.md) — 0.1 nm display grid versus canonical µm.
- [Process/History transaction integrity](PROCESS_HISTORY_TRANSACTION_INTEGRITY_2026-10-13.md) — atomic candidate validation and rollback.

## Open proposals and experimental work

- [Material/Target semantics proposal](MATERIAL_TARGET_SEMANTICS_2026-10-13.md) — non-activated review matrix.
- [Geometry/Process roadmap](PROCESS_GEOMETRY_ROADMAP_2026-10-09.md) — distinguishes delivered bounded Diagnostics from the remaining six unshipped proposals.
- [Physical Facet modeling](PHYSICAL_FACET_MODELING_2026-10-16.md) — opt-in research, **not** normal Process parity; see [experimental ownership](../../site/experimental/README.md).

## Dated research and implementation evidence

- [Isotropic release oracle and historical 8-/72-band work](../archive/science/ISOTROPIC_RELEASE_ORACLE_2026-10-16.md) — original proofs, experiments, revision-scoped M07 screenshots; the currently bundled Continuous M08 is described separately above.
- [Lift-off v1 implementation and acceptance](../archive/science/LIFTOFF_V1_2026-10-09.md) — historical PR #167 evidence; current ideal support semantics belong to [Kernel v2](PROCESS_GEOMETRY_KERNEL_V2.md).

See [Documentation map](../README.md) for interchange,
[Renderer and Section](../renderer/RENDERER_CONTRACT.md) for
presentation boundaries and
[figure provenance](../evidence/README.md) for example-paper
evidence.
