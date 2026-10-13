# Documentation and handoff closeout — 2026-10-13

## Scope and evidence

Audited public `main` at `1e34da5d23f8fd9db8db13b249a7e4816cdb7ced`, then opened branch `docs/main-privacy-lifecycle-handoff-20261013`. This is a documentation-only cleanup. Historical test results, branch names and unverified claims have not been recast as passes. The original pre-release records now reside in the [archive](archive/README.md).

## Confirmed closed or superseded

- **Mask wheel diagnostic:** The older [Mask handoff](archive/ui-v2/HANDOFF_2026-10-11.md) reports a first-width zoom assertion failure. Current `scripts/v2/check-mask-view.mjs` moves the pointer to the Mask canvas center before the wheel event. The later [Main/Mask acceptance](archive/ui-v2/MAIN_MASK_ACCEPTANCE_2026-10-11.md) supersedes the earlier paused checkpoint. No new browser execution is claimed here.
- **UI v2 entry migration:** PR [#177](https://github.com/Xiaolong-6/WaferCAD/pull/177) was merged and deployed as recorded in [M5-Lite](ui-v2/M5_LITE_HANDOFF_2026-10-12.md). Historical M0–M4 Draft-PR and unmerged-route statements are archived, not current deployment instructions.
- **Legacy footer action:** Removed in current v2; a linked commit is displayed instead. `site/app-legacy.html` is still present. Direct navigation must not be described as automatically saving a workspace.

## Open: explicit implementation or acceptance work

- **P1 — Recipe replay:** Complex Run All, failure/Abort recovery, atomicity and replay boundaries require dedicated acceptance. Owner: Process/Recipe; reference [M5-Lite](ui-v2/M5_LITE_HANDOFF_2026-10-12.md).
- **P1 — Advanced Variants:** Insert, edit, copy-on-write and complex branch replay remain follow-ups. Preserve stable entity IDs, History lineage and the project schema.
- **P1 — Material / target semantics:** The [Stage C checkpoint](archive/ui-v2/LOCAL_STAGE_C_WIP_HANDOFF_2026-10-11.md) requests a distinct material-to-layer semantics review. Preserve the current field until product and kernel semantics are explicitly resolved.
- **P1 — Unit-switch editing matrix:** Verify an open Polygon/Mask editor through unit switching, Apply, Recipe, export/reload and exact physical-geometry assertions. The checkpoint did not establish this complete matrix.
- **P1 — Current UI review regression:** The [2026-10-12 human review](archive/ui-v2/HUMAN_REVIEW_CODE_AUDIT_2026-10-12.md) records an updated selector without a final complete `check-sync` rerun. Confirm against the latest `main`, then document the exact gate result; do not infer a failure from an obsolete selector alone.
- **P2 — Hardware and interaction acceptance:** Four-width M2 visual signoff, genuine touch, RTX 3060 / alternate-GPU transparent pixels and foreground input latency remain separate from software WebGL tests. The [foreground renderer plan](FOREGROUND_RENDERING_P0_2026-10-12.md) is an active proposal, not an accepted benchmark.

## Needs verification before closing

- **Project Base hidden bridge controls:** Earlier Stage C observed possible hidden/CSS leakage. Confirm the actual current DOM and accessibility tree before marking fixed; the separately fixed Project storage-conflict banner does not prove all hidden controls safe.
- **Manual draft Undo/Redo and thickness stepper:** Confirm editor-draft versus model History semantics and the current browser interaction coverage.
- **Restored-project source/hash metadata:** Inspect the title/source displayed after project restore against loaded project identity. The checkpoint had not resolved the presentation discrepancy.
- **CI repository administration:** [CI architecture audit](CI_ARCHITECTURE_AUDIT_2026-10-12.md) records main ruleset protection and preview publication controls as outstanding. Workflow YAML alone does not prove repository-level enforcement.
- **Remaining branch-era workflows:** Consolidate only after proving scenario ownership and consumers, as specified in the CI audit.

## Privacy cleanup and archival policy

Six Markdown/JSON/TXT evidence records with real Windows workstation paths were sanitized at this branch's first commit. License attribution and third-party author contact information were left intact. This changes reachable HEAD files, **not** prior Git history, forks, external mirrors, CI artifacts or any image pixels. No credential compromise was detected in the inspected text patterns, but this does not certify an exhaustive secrets audit.

Seven superseded Markdown documents, one old diagnostic patch, and 24 pre-release handoff artifacts were relocated into `docs/archive/`. The raw pre-release patches, screenshots and logs are historical evidence and must not be confused with current tests. This handoff status is the maintained unresolved-work register; older reports should be cited for provenance only.

## Verification boundary

The cleanup was authored against exact GitHub blob/tree revisions. This environment cannot run the repository's npm/Playwright suite. Before merge, require `npm run docs:check`, `npm run format:check`, the documentation-focused Node tests and any relevant CI Quality check. Recheck the branch against `main` and require a verified green run. No product code, scientific algorithm, visual baseline, Wiki generated diagram or user workspace data was changed.
