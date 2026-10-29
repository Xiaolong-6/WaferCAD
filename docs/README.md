# WaferCAD documentation map

Use this page to find the **current owner** of a question. Product instructions
describe the shipped Workstation; scientific documentation distinguishes
geometric assumptions from measured fabrication; dated records are
revision-specific evidence rather than current acceptance. See
[documentation ownership and lifecycle](DOCUMENTATION.md).

## Product users

- **[Launch WaferCAD](https://xiaolong-6.github.io/WaferCAD/)** — Welcome and the [Workstation](https://xiaolong-6.github.io/WaferCAD/app.html).
- [First 10 Minutes](wiki/First-10-Minutes.md) — create a wafer, draw a Mask, apply a Process and inspect/export the result.
- [Complete product manual](wiki/Home.md) and its [navigation](wiki/_Sidebar.md) — current controls, Masks/ROI, History, export and Recovery.
- [Recipe Code tutorial](wiki/Recipe-Code-Tutorial.md) — commands, units and replay limitations.
- [Using WaferCAD with AI](wiki/AI-Assisted-Workflows.md) — prompts and artifacts for user workflows; [developing WaferCAD with AI](wiki/Develop-WaferCAD-with-AI.md) is a separate contributor guide.
- [Welcome examples and modeling limits](wiki/Examples-and-Modeling-Limits.md) — product catalog, actual project content and scientific cautions.
- [Illustrated Process operations](wiki/Process-Operations.md) — **generated** from the in-app guide, not edited independently.
- [Compact usage reference](USAGE.md) — shorter in-repository operating instructions.

WaferCAD is a **mask-driven structural geometry editor**, not a predictive
TCAD, electrical/optical performance or fabrication-kinetics solver.
A published editable example is not the same as a fully replayed fabrication
flow or a validated paper-figure reproduction.

## Developers and reviewers

| Responsibility | Current owner |
| --- | --- |
| Overall product, install/no-install entry and scope | [Repository README](../README.md) |
| Canonical physical model, Worker/History boundaries and modules | [Architecture](ARCHITECTURE.md) |
| Local development/bootstrap and current design contracts | [Development](DEVELOPMENT.md) |
| Collaborative work, exact revisions and handoffs | [Collaboration](COLLABORATION.md) |
| Test ownership and scientific/browser acceptance | [Testing](testing.md) |
| Scheduled/PR/release CI behavior | [CI](CI.md) |
| Authored versus generated docs, Wiki and archive policy | [Documentation architecture](DOCUMENTATION.md) |
| Wiki publication and external link ownership | [Wiki sync](WIKI_SYNC.md) |

For changes under the Workstation, Renderer or Process engine, read the
respective **current owner** below before relying on old PR handoffs.

## Current product and scientific contracts

- [Workstation](ui-v2/README.md) — shell, mobile interaction, tooltips and Z Break; canonical [Workstation contract](ui-v2/WORKSTATION_CONTRACT.md).
- [Renderer and Section](renderer/README.md) — exact geometry versus preview/LOD, cache, export and resource lifetime; canonical [Renderer contract](renderer/RENDERER_CONTRACT.md).
- [Process geometry and science](science/README.md) — 2.5D material ownership, Both-face operations, rough/pyramid *appearance*, Lift-off, numerical precision and History.
- [Continuous release contract](science/CONTINUOUS_RELEASE_CONTRACT.md) — selectable **experimental** geometric release, with unsupported follow-on operations explicitly documented.
- [Import/export and reports](io/README.md) — GDS/OAS masks, project schema, read-only report and historical keyframes.
- [Published example provenance](examples/README.md) and [figure evidence](evidence/README.md) — distinguish Welcome publication, source GDS, inferred geometry, saved History, fresh replay and paper matching.
- [Example source/authoring packages](../examples/projects/README.md) — scripts, assumptions and nonproduction fixtures; publication status comes from the runtime catalog.

## Open work (not a promise of shipped behavior)

- [Material/target semantics proposal](science/MATERIAL_TARGET_SEMANTICS_2026-10-13.md) — not enabled in the production UI.
- [Process geometry roadmap](science/PROCESS_GEOMETRY_ROADMAP_2026-10-09.md) — explicitly proposed operations and model extensions.
- [Physical Facet research prototype](science/PHYSICAL_FACET_MODELING_2026-10-16.md) — opt-in, separate from normal Rough/Pyramid.
- [Renderer transparency roadmap](renderer/RENDERER_TRANSPARENCY_ROADMAP.md) — remaining LOD/performance debt.
- [Mobile CSS ownership cleanup](ui-v2/MOBILE_CSS_OWNERSHIP_AUDIT_2026-10-16.md) — audit completed, follow-up work still deferred.

## Specialist operations and recorded evidence

- [Offline diagnostic tools](tools/README.md) — supported source-backed tools and their visualization limits.
- [Repository operations](operations/README.md) — Legacy sunset, branch protection and release evidence.
- [Welcome performance measurement method](performance/WELCOME_LOADING_BASELINE.md) — interpret timing observations at the recorded environment, not as an unqualified user-facing SLA.
- [Historical evidence archive](archive/README.md) — completed implementation notes, superseded design discussions, historical screenshot/CI evidence and dated benchmark records. Archived documents are **not** current instructions; do not apply old Draft or merge requirements to today's branch.

When a document contradicts the implementation, correct the relevant
product/scientific owner and the task-oriented manual. Preserve the old
measurement or decision at its original revision; do not replace it with an
unverified current-pass claim.
