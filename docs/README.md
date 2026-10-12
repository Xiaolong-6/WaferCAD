# Documentation map

Use this page to find the document that owns a question. Current contracts describe the product; dated audits describe evidence at an exact revision. The [documentation architecture](DOCUMENTATION.md) explains authority, generated content and publishing.

## Product users

- [Product manual](wiki/Home.md) — complete English task-oriented user manual, Recipe tutorial and AI-assisted workflows.
- [Using WaferCAD with AI](wiki/AI-Assisted-Workflows.md) — copy-ready prompts, attachment checklists, GDS/Recipe workflows and validation.
- [Usage](USAGE.md) — compact repository reference for daily operations.
- [Wiki navigation](wiki/_Sidebar.md) — the navigation published with the manual.
- [Wiki visual audit (2026-10-12)](WIKI_CONTENT_VISUAL_AUDIT_2026-10-12.md) — case-specific image provenance and verification scope.
- [Illustrated Process Operations](wiki/Process-Operations.md) — the same Before → After schematics as the in-app Process panel.

## Developers and reviewers

| Question                                                         | Owner                                          |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| Product scope and entry points                                   | [Repository README](../README.md)              |
| Canonical model, module ownership, workers and state flow        | [Architecture](ARCHITECTURE.md)                |
| Implementation contracts and local checks                        | [Development](DEVELOPMENT.md)                  |
| Shared ChatGPT/Codex workflow and reproducible handoff           | [Collaboration](COLLABORATION.md)              |
| Test ownership, scientific/runtime coverage and visual baselines | [Testing](testing.md)                          |
| PR/main/scheduled/manual triggers and Draft cost controls        | [CI routing](CI.md)                            |
| Documentation ownership, navigation and drift checks             | [Documentation architecture](DOCUMENTATION.md) |
| Generated manual and GitHub Wiki delivery                        | [Wiki publishing](WIKI_SYNC.md)                |

## Scientific and interchange contracts

- [Process benchmarks](PROCESS_BENCHMARKS.md) — analytic geometry acceptance and approximation limits.
- [Both-face Process Kernel](PROCESS_BOTH_FACE_2026-10-11.md) — Front → Back execution, two independent Front/Back Layer IDs, atomic failure and future UI contract.
- [Lift-off v1 handoff](LIFTOFF_V1_2026-10-09.md) — geometric support semantics, current CI status and acceptance.
- [TiO2 metalens reconstruction](TIO2_METALENS_RECONSTRUCTION_2026-10-09.md) — paper-derived process, four-cell Recipe and the 4,725-site full-array Welcome project with matching Mask and compiled History.
- [Geometry/process roadmap](PROCESS_GEOMETRY_ROADMAP_2026-10-09.md) — seven proposed capabilities, priorities and scientific acceptance boundaries.
- [Process Geometry Kernel v2](PROCESS_GEOMETRY_KERNEL_V2.md) — derived topology and material ownership.
- [Morphology](ROUGHNESS_MORPHOLOGY.md) — deterministic visual relief and physical/export boundaries.
- [Implant](IMPLANT.md) — structural annotation, clipping and shared gradient semantics.
- [Mask File/Draw](MASK_DRAW.md) — independent sources, Process selection and export scope.
- [KLayout compatibility](KLAYOUT_LAYOUT_COMPATIBILITY.md) — pinned parser/import oracle; recorded corpus results are revision-specific evidence.

## Current work and verification

- [M5-Lite release handoff](ui-v2/M5_LITE_HANDOFF_2026-10-12.md) — v2 default route, Legacy fallback, deployed revision, and remaining post-release tasks. This is a dated release snapshot.
- [UI v2 Stage C / M4 acceptance](ui-v2/M4_ACCEPTANCE_2026-10-11.md) — testing ownership and remaining workflow/visual checks; interpret results at the stated revision.
- [UI v2 architecture health](ui-v2/MAIN_ARCHITECTURE_HEALTH_2026-10-11.md) — implementation risk and ownership evidence; review against current main before applying recommendations.
- [Renderer transparency roadmap](RENDERER_TRANSPARENCY_ROADMAP.md) — shipped phases, deferred work, and separate hardware validation.
- [TiO₂ full-array performance evidence](TIO2_METALENS_PERFORMANCE_2026-10-10.md) — dated benchmark results and limitations.
- [Wiki content and visual audit](WIKI_CONTENT_VISUAL_AUDIT_2026-10-12.md) — figure provenance, text corrections, and manual gates.
- [Documentation lifecycle audit](DOCUMENT_LIFECYCLE_AUDIT_2026-10-12.md) — full Markdown inventory classification, retained work and archival decisions.

## Historical documents

Use the [archive index](archive/README.md) for original plans, previous UI milestones, one-off audits and historical release evidence. **68 completed/superseded documents have been relocated** to `docs/archive/`; obsolete paths were deleted and internal links were updated. Other dated sources still referenced for scientific provenance or unresolved work are explicitly labeled in the [lifecycle inventory](DOCUMENT_LIFECYCLE_AUDIT_2026-10-12.md). Do not use an old acceptance result as evidence that current `main` passed a gate.
