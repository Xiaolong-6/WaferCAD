# Documentation Lifecycle Audit — 2026-10-12

> Historical inventory as of 2026-10-12. The [2026-10-13 handoff/documentation closeout](HANDOFF_STATUS_2026-10-13.md) moved seven further Markdown records and 24 handoff artifacts into the archive. The classifications below describe their original 2026-10-12 disposition, not their current directory ownership.

## Scope and decision criteria

Inspected the complete tracked text-document inventory (Markdown, Markdown-adjacent, RST and TXT), across root, `docs/`, UI v2, Wiki, examples, tests and vendored attribution. The pre-migration inventory contained **141 text documents**, including the original `docs/archive/README.md`. Documentation content and purpose were compared to the merged v2 default-entry release (PR #177), current Wiki/Recipe ownership, generated artifacts, scientific source provenance and still-relevant development references.

Disposition: **68 complete revision-specific records relocated** (41 root docs and 27 early UI v2 reports), deleting the old paths and updating internal links to the new archive destinations; **72 original-position documents retained** (other than the archive index). Original historical language and reported test outcomes were not translated or represented as new passes. A report is not obsolete just because it is dated: reconstruction provenance, reproducibility evidence and active Kernel/UI contracts must remain discoverable.

The [archive index](archive/README.md) lists **every relocated full document** as its canonical location. That index, not old pre-release plans, is the canonical historical evidence map.

## Current documentation owners

- [Documentation map](README.md): authoritative navigation, product and developer entry points.
- [Documentation architecture](DOCUMENTATION.md): ownership rules, generated Wiki assets, revision-specific evidence and English-first maintenance.
- [Released UI v2 handoff](archive/ui-v2/M5_LITE_HANDOFF_2026-10-12.md): v2 default entry, Legacy fallback and remaining user-experience work.
- [M4 acceptance](archive/ui-v2/M4_ACCEPTANCE_2026-10-11.md): owned test matrix; dated evidence must not be generalized to later revisions.
- [Wiki source and image audit](WIKI_CONTENT_VISUAL_AUDIT_2026-10-12.md): relevant first-party images and clear schematic/real-output captions.

The following retained documents remain in their existing locations. **Classification is an ownership/retention decision, not a newly executed acceptance or scientific correctness certificate.** Source-derived inventories should be regenerated when the source evolves; scientific reconstruction reports have validity at their specific revision, paper and assumptions.

### Current engineering references (23)

- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — Current owner or supporting fixture
- [`docs/CI.md`](CI.md) — Current owner or supporting fixture
- [`docs/COLLABORATION.md`](COLLABORATION.md) — Current owner or supporting fixture
- [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) — Current owner or supporting fixture
- [`docs/DOCUMENTATION.md`](DOCUMENTATION.md) — Current owner or supporting fixture
- [`docs/IMPLANT.md`](IMPLANT.md) — Scientific/technical reference or supporting fixture
- [`docs/KLAYOUT_LAYOUT_COMPATIBILITY.md`](KLAYOUT_LAYOUT_COMPATIBILITY.md) — Scientific/technical reference or supporting fixture
- [`docs/LIFTOFF_V1_2026-10-09.md`](LIFTOFF_V1_2026-10-09.md) — Scientific/technical reference or supporting fixture
- [`docs/MASK_DRAW.md`](MASK_DRAW.md) — Scientific/technical reference or supporting fixture
- [`docs/PHOTODETECTOR_RECONSTRUCTION_V2_2026-10-08.md`](PHOTODETECTOR_RECONSTRUCTION_V2_2026-10-08.md) — Scientific/technical reference or supporting fixture
- [`docs/PRE_MAIN_DESKTOP_AUDIT_2026-10-08.md`](archive/PRE_MAIN_DESKTOP_AUDIT_2026-10-08.md) — Scientific/technical reference or supporting fixture
- [`docs/PROCESS_BENCHMARKS.md`](PROCESS_BENCHMARKS.md) — Scientific/technical reference or supporting fixture
- [`docs/PROCESS_BOTH_FACE_2026-10-11.md`](PROCESS_BOTH_FACE_2026-10-11.md) — Scientific/technical reference or supporting fixture
- [`docs/PROCESS_GEOMETRY_KERNEL_V2.md`](PROCESS_GEOMETRY_KERNEL_V2.md) — Scientific/technical reference or supporting fixture
- [`docs/PROCESS_GEOMETRY_ROADMAP_2026-10-09.md`](PROCESS_GEOMETRY_ROADMAP_2026-10-09.md) — Scientific/technical reference or supporting fixture
- [`docs/RENDERER_TRANSPARENCY_ROADMAP.md`](RENDERER_TRANSPARENCY_ROADMAP.md) — Scientific/technical reference or supporting fixture
- [`docs/ROUGHNESS_MORPHOLOGY.md`](ROUGHNESS_MORPHOLOGY.md) — Scientific/technical reference or supporting fixture
- [`docs/TIO2_METALENS_PERFORMANCE_2026-10-10.md`](TIO2_METALENS_PERFORMANCE_2026-10-10.md) — Scientific/technical reference or supporting fixture
- [`docs/TIO2_METALENS_RECONSTRUCTION_2026-10-09.md`](TIO2_METALENS_RECONSTRUCTION_2026-10-09.md) — Scientific/technical reference or supporting fixture
- [`docs/USAGE.md`](USAGE.md) — Current owner or supporting fixture
- [`docs/WIKI_CONTENT_VISUAL_AUDIT_2026-10-12.md`](WIKI_CONTENT_VISUAL_AUDIT_2026-10-12.md) — Scientific/technical reference or supporting fixture
- [`docs/WIKI_SYNC.md`](WIKI_SYNC.md) — Scientific/technical reference or supporting fixture
- [`docs/testing.md`](testing.md) — Current owner or supporting fixture

### UI v2 source-derived references and released gate ownership (10)

- [`docs/ui-v2/CONTRACT.md`](ui-v2/CONTRACT.md) — UI reference / review against released UI
- [`docs/ui-v2/FEATURE_INVENTORY.md`](archive/ui-v2/FEATURE_INVENTORY.md) — UI reference / review against released UI
- [`docs/ui-v2/IMPLICIT_DEPS.md`](archive/ui-v2/IMPLICIT_DEPS.md) — UI reference / review against released UI
- [`docs/ui-v2/ISSUES.md`](archive/ui-v2/ISSUES.md) — UI reference / review against released UI
- [`docs/ui-v2/M4_ACCEPTANCE_2026-10-11.md`](archive/ui-v2/M4_ACCEPTANCE_2026-10-11.md) — UI reference / review against released UI
- [`docs/archive/ui-v2/M5_LITE_HANDOFF_2026-10-12.md`](archive/ui-v2/M5_LITE_HANDOFF_2026-10-12.md) — UI reference / review against released UI
- [`docs/ui-v2/MAIN_ARCHITECTURE_HEALTH_2026-10-11.md`](ui-v2/MAIN_ARCHITECTURE_HEALTH_2026-10-11.md) — UI reference / review against released UI
- [`docs/ui-v2/PLACEMENT_MAP.md`](archive/ui-v2/PLACEMENT_MAP.md) — UI reference / review against released UI
- [`docs/ui-v2/SYNC_TABLE_2026-10-11.md`](archive/ui-v2/SYNC_TABLE_2026-10-11.md) — UI reference / review against released UI
- [`docs/ui-v2/handoff/mask-browser-failure.txt`](archive/ui-v2/handoff/mask-browser-failure.txt) — UI reference / review against released UI

### User-facing Wiki pages (15)

- [`docs/wiki/AI-Assisted-Workflows.md`](wiki/AI-Assisted-Workflows.md) — Active manual/legacy compatibility
- [`docs/wiki/Examples-and-Modeling-Limits.md`](wiki/Examples-and-Modeling-Limits.md) — Active manual/legacy compatibility
- [`docs/wiki/First-10-Minutes.md`](wiki/First-10-Minutes.md) — Active manual/legacy compatibility
- [`docs/wiki/Getting-Started.md`](wiki/Getting-Started.md) — Active manual/legacy compatibility
- [`docs/wiki/History-Variants-and-Recovery.md`](wiki/History-Variants-and-Recovery.md) — Active manual/legacy compatibility
- [`docs/wiki/Home.md`](wiki/Home.md) — Active manual/legacy compatibility
- [`docs/wiki/Import-and-Export.md`](wiki/Import-and-Export.md) — Active manual/legacy compatibility
- [`docs/wiki/Masks-and-ROI.md`](wiki/Masks-and-ROI.md) — Active manual/legacy compatibility
- [`docs/wiki/Process-Operations.md`](wiki/Process-Operations.md) — Active manual/legacy compatibility
- [`docs/wiki/Process-and-Recipes.md`](wiki/Process-and-Recipes.md) — Active manual/legacy compatibility
- [`docs/wiki/Recipe-Code-Tutorial-zh-CN.md`](wiki/Recipe-Code-Tutorial-zh-CN.md) — Active manual/legacy compatibility
- [`docs/wiki/Recipe-Code-Tutorial.md`](wiki/Recipe-Code-Tutorial.md) — Active manual/legacy compatibility
- [`docs/wiki/Troubleshooting.md`](wiki/Troubleshooting.md) — Active manual/legacy compatibility
- [`docs/wiki/Workspace-and-Views.md`](wiki/Workspace-and-Views.md) — Active manual/legacy compatibility
- [`docs/wiki/_Sidebar.md`](wiki/_Sidebar.md) — Active manual/legacy compatibility

### Root, example, test-fixture and vendored notices (23)

- [`AGENTS.md`](../AGENTS.md) — Current owner or supporting fixture
- [`README.md`](../README.md) — Current owner or supporting fixture
- [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) — Current owner or supporting fixture
- [`examples/projects/README.md`](../examples/projects/README.md) — Current owner or supporting fixture
- [`examples/projects/m3d-selfpowered-2026-candidate/AGENT_RECONSTRUCTION_SPEC.md`](../examples/projects/m3d-selfpowered-2026-candidate/AGENT_RECONSTRUCTION_SPEC.md) — Scientific/technical reference or supporting fixture
- [`examples/projects/m3d-selfpowered-2026-candidate/README.md`](../examples/projects/m3d-selfpowered-2026-candidate/README.md) — Current owner or supporting fixture
- [`examples/projects/m3d-selfpowered-2026-replay/AUDIT.md`](../examples/projects/m3d-selfpowered-2026-replay/AUDIT.md) — Scientific/technical reference or supporting fixture
- [`examples/projects/magic-1000-2026-candidate/README.md`](../examples/projects/magic-1000-2026-candidate/README.md) — Current owner or supporting fixture
- [`examples/projects/microdisk-release-candidate/PACKAGE_README.md`](../examples/projects/microdisk-release-candidate/PACKAGE_README.md) — Current owner or supporting fixture
- [`examples/projects/microdisk-release-candidate/README.md`](../examples/projects/microdisk-release-candidate/README.md) — Current owner or supporting fixture
- [`examples/projects/microdisk-release-candidate/provided_process_flow.md`](../examples/projects/microdisk-release-candidate/provided_process_flow.md) — Scientific/technical reference or supporting fixture
- [`examples/projects/perc-blakers-1989-candidate/README.md`](../examples/projects/perc-blakers-1989-candidate/README.md) — Current owner or supporting fixture
- [`site/samples/klayout/LICENSE-KLAYOUT.txt`](../site/samples/klayout/LICENSE-KLAYOUT.txt) — Current owner or supporting fixture
- [`site/samples/klayout/README.md`](../site/samples/klayout/README.md) — Current owner or supporting fixture
- [`site/ui-v2/fonts/LICENSE.txt`](../site/ui-v2/fonts/LICENSE.txt) — Current owner or supporting fixture
- [`site/ui-v2/fonts/README.md`](../site/ui-v2/fonts/README.md) — Current owner or supporting fixture
- [`site/ui-v2/prototypes/README.md`](../site/ui-v2/prototypes/README.md) — Current owner or supporting fixture
- [`site/ui-v2/prototypes/a-full/fonts/LICENSE.txt`](../site/ui-v2/prototypes/a-full/fonts/LICENSE.txt) — Current owner or supporting fixture
- [`site/ui-v2/prototypes/a-full/fonts/README.md`](../site/ui-v2/prototypes/a-full/fonts/README.md) — Current owner or supporting fixture
- [`site/vendor/README.md`](../site/vendor/README.md) — Current owner or supporting fixture
- [`tests/fixtures/native-fig3/README.md`](../tests/fixtures/native-fig3/README.md) — Current owner or supporting fixture
- [`tests/fixtures/project-io/README.md`](../tests/fixtures/project-io/README.md) — Current owner or supporting fixture
- [`tests/visual-baselines/windows-chromium/README.md`](../tests/visual-baselines/windows-chromium/README.md) — Current owner or supporting fixture

## Relocation protocol

1. Preserve the historical document under `docs/archive/<original relative docs path>`, including the `ui-v2/` subdirectory where applicable. Change only relative Markdown destinations necessary to keep links usable at the new location.
2. Delete the original after archiving and update all tracked references. Links outside the repository cannot be rewritten by this migration.
3. Index the archived copy in [Archive](archive/README.md); keep the current [documentation map](README.md) focused on maintained owners.
4. For feature/API changes, update the owner file and Wiki, never the archived test results. Keep `docs/wiki/Process-Operations.md` and process SVGs generator-owned.

## Verification boundaries and follow-up

- The migration was performed through GitHub commits using the original files as source, with Markdown relative-path adjustment and removal of original paths. An archive path alone does not establish whether the old claim remains technically true.
- **Not executed in this environment:** `npm ci`, `npm run docs:check`, `npm run format:check`, `node --test site/tests/documentation.test.mjs site/tests/wiki-manual.test.mjs`, or browser-based validation. The absence of a runnable checkout prevents a verified green test claim. These gates remain prerequisites to integration.
- Static checks must verify the archived targets and rewritten internal links; a full Markdown link/heading run is required before merge. Particular care is needed for older Markdown files with illustrative screenshot references or source-file-relative links.
- Retained dated science/renderer records should continue to be cited with exact commit/environment qualifications. The UI source-derived inventories (`CONTRACT.md`, `FEATURE_INVENTORY.md`, `PLACEMENT_MAP.md`, `IMPLICIT_DEPS.md`) are reference material, not a claim that the current default UI matches every historical selector.

**No scientific code, examples, generated Wiki SVGs, screenshots, visual baselines or legacy recovery data were changed by this document lifecycle reorganization.** No PR, main merge or Wiki publication was initiated.
