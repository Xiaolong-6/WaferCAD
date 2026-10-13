# Documentation map

Use this page to find the document that owns a question. Current contracts describe the product; dated audits describe evidence at an exact revision. The [documentation architecture](DOCUMENTATION.md) explains authority, generated content and publishing.

## Product users

- **[Launch WaferCAD](https://xiaolong-6.github.io/WaferCAD/)** — open Welcome or go directly to the [default v2 Workstation](https://xiaolong-6.github.io/WaferCAD/app.html).
- [First 10 Minutes](wiki/First-10-Minutes.md) — build a Base, draw a mask, deposit/etch, inspect Section and export a project.
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

The [CI architecture audit](CI_ARCHITECTURE_AUDIT_2026-10-12.md) tracks release guarantees and remaining administration controls.

## Scientific and interchange contracts

- [Process benchmarks](PROCESS_BENCHMARKS.md) — analytic geometry acceptance and approximation limits.
- [Both-face Process Kernel](PROCESS_BOTH_FACE_2026-10-11.md) — Front → Back execution, two independent Front/Back Layer IDs, atomic failure and current v2 Manual Surface selector.
- [Both-face bundled-example consolidation](EXAMPLE_BOTH_FACE_CONSOLIDATION_2026-10-13.md) — Photodetector, PERC and Tandem process changes, modeling assumptions and regeneration evidence.
- [Photodetector reconstruction (2026-10-08)](PHOTODETECTOR_RECONSTRUCTION_V2_2026-10-08.md) — historical paper-derived process evidence; later Both-face consolidation supersedes applicable front/back steps.
- [Lift-off v1 handoff](LIFTOFF_V1_2026-10-09.md) — geometric support semantics, current CI status and acceptance.
- [TiO2 metalens reconstruction](TIO2_METALENS_RECONSTRUCTION_2026-10-09.md) — paper-derived process, four-cell Recipe and the 4,725-site full-array Welcome project with matching Mask and compiled History.
- [Geometry/process roadmap](PROCESS_GEOMETRY_ROADMAP_2026-10-09.md) — seven proposed capabilities, priorities and scientific acceptance boundaries.
- [Process Geometry Kernel v2](PROCESS_GEOMETRY_KERNEL_V2.md) — derived topology and material ownership.
- [Morphology](ROUGHNESS_MORPHOLOGY.md) — deterministic visual relief and physical/export boundaries.
- [Implant](IMPLANT.md) — structural annotation, clipping and shared gradient semantics.
- [Mask File/Draw](MASK_DRAW.md) — independent sources, Process selection and export scope.
- [KLayout compatibility](KLAYOUT_LAYOUT_COMPATIBILITY.md) — pinned parser/import oracle; recorded corpus results are revision-specific evidence.

## Current work and verification

- [Process Report Export](REPORT_EXPORT.md) — portable offline HTML/Markdown ZIP, complete History ledger, export limits and accepted capture boundaries.
- [Report historical keyframes](REPORT_KEYFRAMES.md) — saved-state Section SVG provenance, keyframe budgets, failure reporting and planned extensions.
- [UI v2 DOM contract](ui-v2/CONTRACT.md) — revision-specific generated inventory; do not mistake legacy selector evidence for current UI.
- [UI v2 cross-view synchronization table](ui-v2/SYNC_TABLE_2026-10-11.md) — dated state ownership and dispatch audit, not browser pixel acceptance.

- [Process History transaction integrity — 2026-10-13](PROCESS_HISTORY_TRANSACTION_INTEGRITY_2026-10-13.md) — fault injection and atomicity boundaries for Recipe, edit and insertion.
- [Material/target scientific semantics — design proposal](MATERIAL_TARGET_SEMANTICS_2026-10-13.md) — review-only parameter matrix and open choices; no UI activation.
- [Main protection runbook — 2026-10-13](MAIN_PROTECTION_RUNBOOK_2026-10-13.md) — GitHub Admin-only repository rules and fail-closed verification.
- [Physical unit edit integrity — 2026-10-13](PHYSICAL_UNIT_EDIT_INTEGRITY_2026-10-13.md) — canonical-µm invariants, active editor conversions, and browser acceptance.
- [Site publication cleanup (2026-10-13)](SITE_PUBLICATION_CLEANUP_2026-10-13.md) — Pages staging exclusions, canonical Workstation entry migration, and verification boundaries.
- [Scientific unused-symbol review (2026-10-13)](SITE_SCIENTIFIC_SYMBOL_REVIEW_2026-10-13.md) — private Kernel and Renderer helper reachability, bounded deletion and acceptance requirements.
- [Export API ownership review (2026-10-13)](SITE_EXPORT_API_REVIEW_2026-10-13.md) — eight static import candidates, internal-use evidence and API retention contract.
- [Site symbol audit (2026-10-13)](SITE_SYMBOL_AUDIT_2026-10-13.md) — local bindings and named export reachability, initial cleanup and review boundaries.
- [Handoff closeout and outstanding work — 2026-10-13](HANDOFF_STATUS_2026-10-13.md) — current disposition of older UI v2 handoffs, privacy cleanup, and evidence still required.

- [Mobile Workstation layout contract — 2026-10-13](ui-v2/MOBILE_WORKSTATION_LAYOUT_2026-10-13.md) — compact Edit/View pane, single-scroll ownership, retained scientific hosts, and mobile CI acceptance boundaries.
- [M5-Lite release handoff](ui-v2/M5_LITE_HANDOFF_2026-10-12.md) — v2 default route, Legacy fallback, deployed revision, and remaining post-release tasks. This is a dated release snapshot.
- [UI v2 Manual Both acceptance — 2026-10-12](ui-v2/MANUAL_BOTH_ACCEPTANCE_2026-10-12.md) — Front/Back/Both Manual selector, paired Layer IDs, Recipe restore, atomicity and CI evidence at its tested revision.
- [UI v2 contextual tooltip architecture](ui-v2/TOOLTIP_ARCHITECTURE_2026-10-13.md) — delegated plain-text hover, focus and lifecycle contract for the production UI.
- [UI v2 Z Break editor integration — 2026-10-13](ui-v2/Z_BREAK_EDITOR_2026-10-13.md) — precision-first editor, physical-Z ownership, keyboard controls and contextual-tooltip migration.
- [UI v2 architecture health](ui-v2/MAIN_ARCHITECTURE_HEALTH_2026-10-11.md) — implementation risk and ownership evidence; review against current main before applying recommendations.
- [Renderer transparency roadmap](RENDERER_TRANSPARENCY_ROADMAP.md) — shipped phases, deferred work, and separate hardware validation.
- [Renderer PNG capture and resource retirement](RENDERER_LIFECYCLE_CORRECTNESS_2026-10-12.md) — transaction-safe export, nested owned-resource cleanup and test boundaries.
- [Renderer foreground-first P0](FOREGROUND_RENDERING_P0_2026-10-12.md) — scene continuity during variant rebuilds, validation gaps and progressive-rendering plan.
- [TiO₂ full-array performance evidence](TIO2_METALENS_PERFORMANCE_2026-10-10.md) — dated benchmark results and limitations.
- [Wiki content and visual audit](WIKI_CONTENT_VISUAL_AUDIT_2026-10-12.md) — figure provenance, text corrections, and manual gates.
- [Documentation lifecycle audit](DOCUMENT_LIFECYCLE_AUDIT_2026-10-12.md) — full Markdown inventory classification, retained work and archival decisions.

## Historical documents

Use the [archive index](archive/README.md) for original plans, previous UI milestones, one-off audits and historical release evidence. The 2026-10-12 pass relocated **68** completed/superseded documents; the [2026-10-13 closeout](HANDOFF_STATUS_2026-10-13.md) archives additional pre-release records and handoff attachments to `docs/archive/`; obsolete paths were deleted and internal links were updated. Other dated sources still referenced for scientific provenance or unresolved work are explicitly labeled in the [lifecycle inventory](DOCUMENT_LIFECYCLE_AUDIT_2026-10-12.md). Do not use an old acceptance result as evidence that current `main` passed a gate.
