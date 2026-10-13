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
- [UI v2 human-review code audit — 2026-10-12](ui-v2/HUMAN_REVIEW_CODE_AUDIT_2026-10-12.md) — dated manual review of workstation/Recipe/Mask/Section refinements, observed checks and explicit remaining validation limits.
- [UI v2 Manual Both acceptance — 2026-10-12](ui-v2/MANUAL_BOTH_ACCEPTANCE_2026-10-12.md) — Front/Back/Both Manual selector, paired Layer IDs, Recipe restore, atomicity and CI evidence at its tested revision.
- [UI v2 Stage C / M4 acceptance](ui-v2/M4_ACCEPTANCE_2026-10-11.md) — testing ownership and remaining workflow/visual checks; interpret results at the stated revision.
- [UI v2 architecture health](ui-v2/MAIN_ARCHITECTURE_HEALTH_2026-10-11.md) — implementation risk and ownership evidence; review against current main before applying recommendations.
- [Renderer transparency roadmap](RENDERER_TRANSPARENCY_ROADMAP.md) — shipped phases, deferred work, and separate hardware validation.
- [Renderer PNG capture and resource retirement](RENDERER_LIFECYCLE_CORRECTNESS_2026-10-12.md) — transaction-safe export, nested owned-resource cleanup and test boundaries.
- [Renderer foreground-first P0](FOREGROUND_RENDERING_P0_2026-10-12.md) — merged production scene-variant continuity, cancellation and recovery (#186).
- [Responsive 3D staging P0/P1](RENDERER_RESPONSIVENESS_P0_2026-10-12.md) — opt-in retained-scene loading, interaction previews, rollback and exact-output safeguards.
- [Renderer interaction scheduling](RENDERER_INTERACTIVE_SCHEDULING_2026-10-12.md) — frame budgets, cooperative assembly and measured tradeoffs.
- [PR #166 continued acceptance](PR166_ACCEPTANCE_2026-10-10.md) — historical 625-site pixel evidence, current CI, Electrical A/B census repairs and open hardware/runtime gates.
- [PR #166 ROI recovery follow-up](PR166_ROI_FAILURE_RECOVERY_2026-10-10.md) — bounded 625-site ROI error handling, clear/recovery browser acceptance and remaining constraints.
- [R8 targeted WebGL phase-window diagnostics](RENDERER_R8_PHASE_WINDOW_2026-10-12.md) — bounded draw-checkpoint localization of hardware raster drift, fail-closed evidence, and GPU-neutral command.
- [R9 Renderer consolidation decision](RENDERER_R9_CONSOLIDATION_2026-10-12.md) — single-engine architecture, V4 safe-fix upstream promotion, measured tradeoffs, and exact hardware merge blockers.
- [R9 physical GPU one-session acceptance runbook](RENDERER_R9_HARDWARE_RUNBOOK_2026-10-12.md) — one Windows command for V3 baseline, no-MSAA control and all three isolated V4 candidates; one evidence ZIP.
- [R9 4×MSAA framebuffer preservation diagnostic](RENDERER_R9_MSAA_PRESERVATION_2026-10-13.md) — default-framebuffer lifecycle hypothesis, true four-sample measurement and strict diagnostic-only boundaries.
- [R9 Intel Iris Xe hardware acceptance](RENDERER_R9_INTEL_IRIS_XE_HARDWARE_2026-10-12.md) — verified native Intel raster parity, isolated CPU memory savings and platform boundaries.
- [R9 RTX 3060 hardware diagnosis](RENDERER_R9_RTX3060_HARDWARE_2026-10-12.md) — MSAA-dependent fresh-context drift, strict parity blockers and candidate timing limits.
- [Renderer V4 adaptive tiles R1](RENDERER_V4_ADAPTIVE_TILES_2026-10-10.md) — stacked experimental branch, observability-only camera tile tiers, test plan and staged promotion gates.
- [Renderer V3/V4 main alignment (2026-10-12)](RENDERER_MAIN_ALIGNMENT_2026-10-12.md) — reviewed PR #177 merge conflict resolutions, base/stack ancestry, and acceptance limits.
- [Renderer V3/V4 unified RTX 3060 diagnostics](RENDERER_V3_V4_UNIFIED_HARDWARE.md) — one command for exact-SHA worktrees, bounded GPU evidence and the single combined upload.
- [V3/V4 RTX 3060 acceptance, October 12](RENDERER_V3_V4_RTX3060_ACCEPTANCE_2026-10-12.md) — completed four-mode hardware data, fresh-context GL drift intervals and blocked promotion decision.
- [RTX 3060 V3 DITHER isolation](RENDERER_V3_DITHER_DIAGNOSTIC_2026-10-12.md) — completed DITHER-off hardware run, persistent 33/134 same-policy drift and next MSAA hypothesis.
- [TiO₂ full-array performance evidence](TIO2_METALENS_PERFORMANCE_2026-10-10.md) — dated benchmark results and limitations.
- [Wiki content and visual audit](WIKI_CONTENT_VISUAL_AUDIT_2026-10-12.md) — figure provenance, text corrections, and manual gates.
- [Documentation lifecycle audit](DOCUMENT_LIFECYCLE_AUDIT_2026-10-12.md) — full Markdown inventory classification, retained work and archival decisions.

## Historical documents

Use the [archive index](archive/README.md) for original plans, previous UI milestones, one-off audits and historical release evidence. **68 completed/superseded documents have been relocated** to `docs/archive/`; obsolete paths were deleted and internal links were updated. Other dated sources still referenced for scientific provenance or unresolved work are explicitly labeled in the [lifecycle inventory](DOCUMENT_LIFECYCLE_AUDIT_2026-10-12.md). Do not use an old acceptance result as evidence that current `main` passed a gate.
