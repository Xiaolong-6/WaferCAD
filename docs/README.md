# Documentation map

This page is the navigation layer for the current `main` product contract. Dated audit, validation, optimization, and handoff files are evidence from a specific revision; branch/status statements inside them must not be treated as current unless this page or the current contract documents say so.

## Current product contracts

- [README](../README.md) — product scope and entry points.
- [Usage](USAGE.md) — current user workflow and controls.
- [Architecture](ARCHITECTURE.md) — canonical model, renderer, Process, persistence, and array architecture.
- [Development](DEVELOPMENT.md) — implementation contracts and developer workflow.
- [Mask Draw](MASK_DRAW.md) — current File/Draw mask and Mask ROI behavior.

## Product user manual

- [Product manual publishing](WIKI_SYNC.md) — reviewed Wiki source, full product manual, generation checks and every-main-push synchronization.
- [Canonical Wiki pages](wiki/Home.md) — beginner guide, workspace, masks, Process, Recipe, History, persistence, I/O, examples and troubleshooting.
- [Interactive Process diagrams](https://xiaolong-6.github.io/WaferCAD/guide/) — public Before → After operation atlas with deep links from the application.

## Scientific and geometry contracts

- [Process geometry benchmarks](PROCESS_BENCHMARKS.md)
- [Process Geometry Kernel v2](PROCESS_GEOMETRY_KERNEL_V2.md)
- [Roughness and morphology](ROUGHNESS_MORPHOLOGY.md)
- [Implant](IMPLANT.md)

## Testing and CI

- [Automated test architecture](testing.md)
- [CI routing](CI.md)

## Historical evidence

Files named with dates, audit/checkpoint/handoff wording, or explicit feature-branch status preserve the evidence available at that revision. Keep their original measurements and conclusions, but add a clear historical/superseded banner when later `main` behavior has moved on. Use the current contract documents above for present-tense product behavior.
