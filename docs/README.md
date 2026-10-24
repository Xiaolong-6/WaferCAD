# Documentation map

Use this page to find the document that owns a question. Current contracts describe the product; dated audits describe evidence at an exact revision. The [documentation architecture](DOCUMENTATION.md) explains authority, generated content and publishing.

## Product users

- **[Launch WaferCAD](https://xiaolong-6.github.io/WaferCAD/)** — open Welcome or go directly to the [default v2 Workstation](https://xiaolong-6.github.io/WaferCAD/app.html).
- [First 10 Minutes](wiki/First-10-Minutes.md) — build a Base, draw a mask, deposit/etch, inspect Section and export a project.
- [Product manual](wiki/Home.md) — complete English task-oriented user manual, Recipe tutorial and AI-assisted workflows.
- [Using WaferCAD with AI](wiki/AI-Assisted-Workflows.md) — copy-ready prompts, attachment checklists, GDS/Recipe workflows and validation.
- [Usage](USAGE.md) — compact repository reference for daily operations.
- [Wiki navigation](wiki/_Sidebar.md) — the navigation published with the manual.
- [Wiki visual audit (2026-10-12)](archive/WIKI_CONTENT_VISUAL_AUDIT_2026-10-12.md) — case-specific image provenance and verification scope.
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

The [CI architecture audit](archive/CI_ARCHITECTURE_AUDIT_2026-10-12.md) tracks release guarantees and remaining administration controls.

## Documentation by responsibility

- [Scientific contracts](science/README.md) — kernel, precision, geometry, morphology and annotation.
- [Literature reconstruction](examples/README.md) — paper assumptions and named-example evidence.
- [UI Workstation](ui-v2/README.md) — production interface ownership and dated UI contracts.
- [Historical evidence](archive/README.md) — superseded checks and completed investigations.
- [Renderer engineering](renderer/README.md) — 3D renderer contracts, proposals and dated diagnostic evidence.
- [Interchange and reports](io/README.md) — GDS/OAS compatibility, Process report, historical keyframes.
- [Offline diagnostics](tools/README.md) — source-backed tools and their scientific/visual limitations.
- [Repository operations](operations/README.md) — Legacy retirement and branch protection runbooks.
- [Research evidence](evidence/README.md) — source-figure register and reproducibility metadata.
- [Legacy source retirement](operations/LEGACY_SOURCE_SUNSET.md) — frozen source tag, v2 redirect/reader guarantees and archived nightly contracts.

## Current specialist contracts

- [Production Workstation shell and state](ui-v2/WORKSTATION_CONTRACT.md) — stable view slots, desktop/mobile, History and Recovery ownership.
- [Renderer and Section physical/presentation boundary](renderer/RENDERER_CONTRACT.md) — exact-versus-preview, progressive Worker, scene cache, ROI, PNG and GLB.
- [Continuous selective release](science/CONTINUOUS_RELEASE_CONTRACT.md) — bounded experimental material model and 3D/Section/History restrictions.

## Scientific and interchange contracts

- [Process benchmarks](science/PROCESS_BENCHMARKS.md) — analytic geometry acceptance and approximation limits.
- [Welcome Example loading baseline](performance/WELCOME_LOADING_BASELINE.md) — per-phase timing methods and limits.
- [Isotropic release oracle and historical adaptive model (2026-10-16)](science/ISOTROPIC_RELEASE_ORACLE_2026-10-16.md) — numerical bounds for earlier banded models, current Continuous-release publication boundary and remaining paper-fidelity limits.
- [Paper-figure provenance matrix (2026-10-16)](evidence/SCIENCE_FIGURE_EVIDENCE_2026-10-16.md) — current nine-family provenance with historical eight-family evidence bounded to its original sources; no paper match yet accepted.
- [Process numerical and physical interpretation contract](science/PROCESS_NUMERICAL_CONTRACT_2026-10-14.md) — numerical Z resolution, sub-0.01 nm preservation and continuum-film limitations.
- [Both-face Process Kernel](science/PROCESS_BOTH_FACE_2026-10-11.md) — Front → Back execution, two independent Front/Back Layer IDs, atomic failure and current v2 Manual Surface selector.
- [Both-face bundled-example consolidation](examples/EXAMPLE_BOTH_FACE_CONSOLIDATION_2026-10-13.md) — Photodetector, PERC and Tandem process changes, modeling assumptions and regeneration evidence.
- [Bundled-example literature fidelity audit (2026-10-14)](examples/EXAMPLE_LITERATURE_FIDELITY_2026-10-14.md) — eight literature families, source-to-Recipe/Mask material probes, microdisk process correction and remaining figure-alignment gates.
- [Photodetector reconstruction (2026-10-08)](examples/PHOTODETECTOR_RECONSTRUCTION_V2_2026-10-08.md) — historical paper-derived process evidence; later Both-face consolidation supersedes applicable front/back steps.
- [Lift-off v1 implementation record](science/LIFTOFF_V1_2026-10-09.md) — ideal geometry, original 2026-10-09 checks and remaining model limits; PR #167 has merged.
- [TiO2 metalens reconstruction](examples/TIO2_METALENS_RECONSTRUCTION_2026-10-09.md) — paper-derived process, four-cell Recipe and the 4,725-site full-array Welcome project with matching Mask and compiled History.
- [Geometry/process roadmap](science/PROCESS_GEOMETRY_ROADMAP_2026-10-09.md) — seven planning scopes with current production-versus-experimental boundaries.
- [Process Geometry Kernel v2](science/PROCESS_GEOMETRY_KERNEL_V2.md) — derived topology and material ownership.
- [Morphology](science/ROUGHNESS_MORPHOLOGY.md) — deterministic visual relief and physical/export boundaries.
- [Implant](science/IMPLANT.md) — structural annotation, clipping and shared gradient semantics.
- [Mask File/Draw](science/MASK_DRAW.md) — independent sources, Process selection and export scope.
- [KLayout compatibility](io/KLAYOUT_LAYOUT_COMPATIBILITY.md) — pinned parser/import oracle; recorded corpus results are revision-specific evidence.

## Design contracts, ongoing work and dated verification

Dated implementation plans and handoffs preserve the status of their original revision. For merged PRs (notably #188 and #267), their old Draft/approval language is historical; always check the linked PR and latest Main implementation before interpreting a dated acceptance claim.

- [Process Report Export](io/REPORT_EXPORT.md) — portable offline HTML/Markdown ZIP, complete History ledger, export limits and accepted capture boundaries.
- [Report historical keyframes](io/REPORT_KEYFRAMES.md) — saved-state Section SVG provenance, keyframe budgets, failure reporting and planned extensions.
- [UI v2 DOM contract](ui-v2/CONTRACT.md) — revision-specific generated inventory; do not mistake legacy selector evidence for current UI.
- [Progressive Workstation startup (P1)](ui-v2/PROGRESSIVE_STARTUP_2026-10-13.md) — UI/view first-frame lifecycle, transient 3D preview, cooperative scheduling and hardware acceptance limits.
- [Production Workstation edge-to-edge viewport — 2026-10-15](ui-v2/EDGE_TO_EDGE_WORKSTATION_2026-10-15.md) — full-viewport shell, mobile scroll preservation and browser regression handoff.
- [Desktop View Docking reconstruction — 2026-10-15](ui-v2/DESKTOP_DOCKING_PLAN_2026-10-15.md) — desktop-only view state, Snap templates, stable scientific panels and required acceptance gates.

- [P1 science, release and Recovery handoff — 2026-10-14](archive/P1_SCIENCE_RELEASE_RECOVERY_HANDOFF_2026-10-14.md) — branch baseline, fault ownership, planned CI evidence and unresolved administration tasks.
- [Process History transaction integrity — 2026-10-13](science/PROCESS_HISTORY_TRANSACTION_INTEGRITY_2026-10-13.md) — fault injection and atomicity boundaries for Recipe, edit and insertion.
- [Material/target scientific semantics — design proposal](science/MATERIAL_TARGET_SEMANTICS_2026-10-13.md) — review-only parameter matrix and open choices; no UI activation.
- [Main protection runbook — 2026-10-13](operations/MAIN_PROTECTION_RUNBOOK_2026-10-13.md) — GitHub Admin-only repository rules and fail-closed verification.
- [Physical unit edit integrity — 2026-10-13](science/PHYSICAL_UNIT_EDIT_INTEGRITY_2026-10-13.md) — canonical-µm invariants, active editor conversions, and browser acceptance.
- [Scientific unused-symbol review (2026-10-13)](archive/SITE_SCIENTIFIC_SYMBOL_REVIEW_2026-10-13.md) — private Kernel and Renderer helper reachability, bounded deletion and acceptance requirements.
- [Export API ownership review (2026-10-13)](archive/SITE_EXPORT_API_REVIEW_2026-10-13.md) — eight static import candidates, internal-use evidence and API retention contract.
- [Handoff closeout and outstanding work — 2026-10-13](archive/HANDOFF_STATUS_2026-10-13.md) — current disposition of older UI v2 handoffs, privacy cleanup, and evidence still required.

- [Mobile Workstation layout contract — 2026-10-13](ui-v2/MOBILE_WORKSTATION_LAYOUT_2026-10-13.md) — compact Edit/View pane, single-scroll ownership, retained scientific hosts, and mobile CI acceptance boundaries.
- [Mobile CSS ownership audit — 2026-10-16](ui-v2/MOBILE_CSS_OWNERSHIP_AUDIT_2026-10-16.md) — Production compact CSS boundaries, P2/P3 contracts and deferred cleanup gates.
- [UI v2 Manual Both acceptance — 2026-10-12](ui-v2/MANUAL_BOTH_ACCEPTANCE_2026-10-12.md) — Front/Back/Both Manual selector, paired Layer IDs, Recipe restore, atomicity and CI evidence at its tested revision.
- [UI v2 contextual tooltip architecture](ui-v2/TOOLTIP_ARCHITECTURE_2026-10-13.md) — delegated plain-text hover, focus and lifecycle contract for the production UI.
- [UI v2 Z Break editor integration — 2026-10-13](ui-v2/Z_BREAK_EDITOR_2026-10-13.md) — precision-first editor, physical-Z ownership, keyboard controls and contextual-tooltip migration.
- [UI v2 architecture health](ui-v2/MAIN_ARCHITECTURE_HEALTH_2026-10-11.md) — implementation risk and ownership evidence; review against current main before applying recommendations.
- [PR 250 renderer audit (2026-10-15)](renderer/PR250_RENDERER_AUDIT_2026-10-15.md) — merged implementation, dated visual evidence and independent GPU/Worker acceptance limits.
- [Renderer transparency roadmap](renderer/RENDERER_TRANSPARENCY_ROADMAP.md) — shipped phases, deferred work, and separate hardware validation.
- [Renderer PNG capture and resource retirement](renderer/RENDERER_LIFECYCLE_CORRECTNESS_2026-10-12.md) — transaction-safe export, nested owned-resource cleanup and test boundaries.
- [Renderer foreground-first P0](renderer/FOREGROUND_RENDERING_P0_2026-10-12.md) — scene continuity during variant rebuilds, validation gaps and progressive-rendering plan.
- [TiO₂ full-array performance evidence](examples/TIO2_METALENS_PERFORMANCE_2026-10-10.md) — dated benchmark results and limitations.
- [Wiki content and visual audit](archive/WIKI_CONTENT_VISUAL_AUDIT_2026-10-12.md) — figure provenance, text corrections, and manual gates.
- [Documentation lifecycle audit](archive/DOCUMENT_LIFECYCLE_AUDIT_2026-10-12.md) — full Markdown inventory classification, retained work and archival decisions.

- [Historical UI review images](archive/review/README.md) — five dated screenshots preserved with their original product-review evidence.

## Historical documents

Use the [archive index](archive/README.md) for original plans, previous UI milestones, one-off audits and historical release evidence. The 2026-10-15 classification archived four more revision-specific records (site publication/symbol audits and UI v2 sync/release handoffs); their original claims are unchanged. The 2026-10-12 pass relocated **68** completed/superseded documents; the [2026-10-13 closeout](archive/HANDOFF_STATUS_2026-10-13.md) archives additional pre-release records and handoff attachments to `docs/archive/`; obsolete paths were deleted and internal links were updated. Other dated sources still referenced for scientific provenance or unresolved work are explicitly labeled in the [lifecycle inventory](archive/DOCUMENT_LIFECYCLE_AUDIT_2026-10-12.md). Do not use an old acceptance result as evidence that current `main` passed a gate.
