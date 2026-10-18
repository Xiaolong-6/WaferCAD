# Documentation and handoff closeout — 2026-10-13

> **Historical status record:** This handoff captures successive 2026-10-13/14 integration checkpoints. References to running CI, Draft status and pending deployment are dated observations, not current Main status. For example, [PR #233](https://github.com/Xiaolong-6/WaferCAD/pull/233) subsequently merged on 2026-10-14. Follow the [current documentation map](README.md) for maintained contracts.

## 2026-10-14 P2 release and Legacy follow-up

Main `65ec07ea` merged [PR #220](https://github.com/Xiaolong-6/WaferCAD/pull/220):
retired the obsolete branch Preview publisher and added a staged-artifact
browser/Worker gate with a single verified artifact promoted to deployment.
The [first revised production Pages run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38521305117)
**succeeded**, including release Quality, targeted browser and Stage C/M4 checks.

[PR #221](https://github.com/Xiaolong-6/WaferCAD/pull/221) merged to
`main@6c0da347`; its SHA-256-verified historical `shared-assets-v1` fixture
successfully passed [real v2 Project import/autosave/reload/Recovery](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38521706241).
That is a Legacy data-compatibility gate, not removal of the old UI.

[PR #223](https://github.com/Xiaolong-6/WaferCAD/pull/223) moves the Welcome
interactive preview iframe to a **read-only v2** final-stage project and keeps
Main/Mask/3D/Section views. It adds writer-lease and autosave isolation checks.
It merged at `main@a54dd4b` after all relevant PR checks passed.
The retained Legacy DOM-based scientific tests and test adapters still need
migration before the old source implementation can be deleted. No scientific
kernel/schema or Recovery storage deletion is authorized by this P2 follow-up.

[PR #224](https://github.com/Xiaolong-6/WaferCAD/pull/224) merged as
`main@6a391a3` and its [production Pages workflow](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38530789607)
succeeded. Public `app-legacy.html` is now a bookmark-preserving redirect
to `app.html`; the old editor's `app.js` and `workstation.css` are excluded
from the production artifact, but Legacy scientific test sources remain in Git.

[PR #227](https://github.com/Xiaolong-6/WaferCAD/pull/227) merged as
`main@4f5b273` and [deployed](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38532663387).
Its v2 browser acceptance covers missing Three.js CDN, failed WebGL initialization
and continued Main/Mask/Section plus real Process Worker operation.

[PR #231](https://github.com/Xiaolong-6/WaferCAD/pull/231) merged as
`main@f8a6b8f`, after full Quality, M3D, Browser, 3D, D1, Main/Mask/Mobile and
Stage C/M4 PR checks passed. It migrates M3D Welcome, 36 History Steps,
27 bookmarks and Border toggle checks to v2, and fixes restored 3D toolbar
selected-state synchronization. The post-merge Pages publication is a separate
release check; the last observed run was still in progress.

[PR #233](https://github.com/Xiaolong-6/WaferCAD/pull/233) is a separate
draft migration of MAGIC-1000 visual evidence to the read-only v2 Section/3D
preview. Its browser acceptance passed before branch alignment; final
post-alignment checks and merge/deploy were not yet complete at this checkpoint.
The obsolete MAGIC feature-branch workflow loses source write/push permissions.
These changes transfer UI test ownership only; scientific model/Recipe
reconstruction tests remain intact. The rest of Legacy source and its
unmigrated scientific browser adapters must not be deleted yet.

The workflows constrain Pages write/OIDC permissions in source control;
repository/environment administrator settings remain a separate verification
boundary.

## Scope and evidence

Audited public `main` at `1e34da5d23f8fd9db8db13b249a7e4816cdb7ced`, then opened branch `docs/main-privacy-lifecycle-handoff-20261013`. This is a documentation-only cleanup. Historical test results, branch names and unverified claims have not been recast as passes. The original pre-release records now reside in the [archive](archive/README.md). This register was subsequently reconciled against `main@036117f9` on 2026-10-13; that follow-up is a status/documentation check, not a new end-to-end test.

## Confirmed closed or superseded

- **Mask wheel diagnostic:** The older [Mask handoff](archive/ui-v2/HANDOFF_2026-10-11.md) reports a first-width zoom assertion failure. Current `scripts/v2/check-mask-view.mjs` moves the pointer to the Mask canvas center before the wheel event. The later [Main/Mask acceptance](archive/ui-v2/MAIN_MASK_ACCEPTANCE_2026-10-11.md) supersedes the earlier paused checkpoint. No new browser execution is claimed here.
- **UI v2 entry migration:** PR [#177](https://github.com/Xiaolong-6/WaferCAD/pull/177) was merged and deployed as recorded in [M5-Lite](archive/ui-v2/M5_LITE_HANDOFF_2026-10-12.md). Historical M0–M4 Draft-PR and unmerged-route statements are archived, not current deployment instructions.
- **Legacy footer action:** Removed in current v2; a linked commit is displayed instead. `site/app-legacy.html` remains as source for historical tests, while the public Pages URL is a redirect. Direct navigation must not be described as automatically saving a workspace.

## Open: explicit implementation or acceptance work

- **P1 — Recipe replay:** PR [#199](https://github.com/Xiaolong-6/WaferCAD/pull/199) fixed thrown/rejected History Edit/Insert downstream replay rollback; PR [#204](https://github.com/Xiaolong-6/WaferCAD/pull/204) added deterministic Recovery writer/partial-replay fault tests. Both are merged. Recipe Run All still commits per successful Step, not as one all-or-nothing transaction. Real browser persistence interruption, Abort/reload and complex Recipe/Variant acceptance remain open; see [History transaction integrity](science/PROCESS_HISTORY_TRANSACTION_INTEGRITY_2026-10-13.md).
- **P1 — Advanced Variants:** Insert, edit, copy-on-write and complex branch replay remain follow-ups. Preserve stable entity IDs, History lineage and the project schema.
- **P1 — Material / target semantics:** The [Material/Target design proposal](MATERIAL_TARGET_SEMANTICS_2026-10-13.md) now defines the review questions, including distinct Layer IDs and thermal oxidation physics. It is not approved product behavior; the relevant UI remains disabled.
- **P1 — Unit-switch editing matrix:** Merged PR [#198](https://github.com/Xiaolong-6/WaferCAD/pull/198) fixed unchanged Mask Draw Apply precision and added Node shape tests plus a focused real v2 Rect editor path. The full Polygon/Ring/Sector/ROI, Recipe, Save/Export/Reload matrix remains open; see [physical-unit integrity](science/PHYSICAL_UNIT_EDIT_INTEGRITY_2026-10-13.md).
- **P1 — Mask interchange and process inputs:** Merged PR [#205](https://github.com/Xiaolong-6/WaferCAD/pull/205) added in-process GDS/OAS canonical roundtrip assertions; external KLayout and real UI edit/export/reimport remain separate. Merged PR [#206](https://github.com/Xiaolong-6/WaferCAD/pull/206) rejects nonpositive/nonfinite Kernel thickness; behavior for positive values below the existing 0.01 nm floor remains a scientific contract decision.
- **P1 — Current UI review regression:** The [2026-10-12 human review](archive/ui-v2/HUMAN_REVIEW_CODE_AUDIT_2026-10-12.md) records an updated selector without a final complete `check-sync` rerun. Confirm against the latest `main`, then document the exact gate result; do not infer a failure from an obsolete selector alone.
- **P2 — Hardware and interaction acceptance:** Four-width M2 visual signoff, genuine touch, RTX 3060 / alternate-GPU transparent pixels and foreground input latency remain separate from software WebGL tests. The [foreground renderer plan](FOREGROUND_RENDERING_P0_2026-10-12.md) is an active proposal, not an accepted benchmark.

## Needs verification before closing

- **Project Base hidden bridge controls:** Earlier Stage C observed possible hidden/CSS leakage. Confirm the actual current DOM and accessibility tree before marking fixed; the separately fixed Project storage-conflict banner does not prove all hidden controls safe.
- **Manual draft Undo/Redo and thickness stepper:** Confirm editor-draft versus model History semantics and the current browser interaction coverage.
- **Restored-project source/hash metadata:** Inspect the title/source displayed after project restore against loaded project identity. The checkpoint had not resolved the presentation discrepancy.
- **CI repository administration:** [CI architecture audit](archive/CI_ARCHITECTURE_AUDIT_2026-10-12.md) records main ruleset protection and preview publication controls as outstanding. Workflow YAML alone does not prove repository-level enforcement.
- **Remaining branch-era workflows:** Consolidate only after proving scenario ownership and consumers, as specified in the CI audit.

## Documentation freshness follow-up

- [PR #194](https://github.com/Xiaolong-6/WaferCAD/pull/194) merged the Both-face bundled-example consolidation. The dated [reconstruction record](examples/PHOTODETECTOR_RECONSTRUCTION_V2_2026-10-08.md) remains historical; the [consolidation record](examples/EXAMPLE_BOTH_FACE_CONSOLIDATION_2026-10-13.md) owns the later Front/Back changes.
- [PR #190](https://github.com/Xiaolong-6/WaferCAD/pull/190) and [PR #196](https://github.com/Xiaolong-6/WaferCAD/pull/196) merged Report Export and historical Section keyframes. Their [report contract](REPORT_EXPORT.md) and [keyframe contract](REPORT_KEYFRAMES.md) are indexed from the current documentation map. Report ZIP is read-only; only a separate `.wafercad` is a restorable engineering backup.
- The earlier [PR #191](https://github.com/Xiaolong-6/WaferCAD/pull/191) documentation Quality run passed with 144 Markdown files and 708 internal links at its tested head. This is **not** a claim that a fresh documentation gate on this follow-up commit has passed.

## Privacy cleanup and archival policy

Six Markdown/JSON/TXT evidence records with real Windows workstation paths were sanitized at this branch's first commit. License attribution and third-party author contact information were left intact. This changes reachable HEAD files, **not** prior Git history, forks, external mirrors, CI artifacts or any image pixels. No credential compromise was detected in the inspected text patterns, but this does not certify an exhaustive secrets audit.

Seven superseded Markdown documents, one old diagnostic patch, and 24 pre-release handoff artifacts were relocated into `docs/archive/`. The raw pre-release patches, screenshots and logs are historical evidence and must not be confused with current tests. This handoff status is the maintained unresolved-work register; older reports should be cited for provenance only.

## Verification boundary

The cleanup was authored against exact GitHub blob/tree revisions. This environment cannot run the repository's npm/Playwright suite. Before merge, require `npm run docs:check`, `npm run format:check`, the documentation-focused Node tests and any relevant CI Quality check. Recheck the branch against `main` and require a verified green run. No product code, scientific algorithm, visual baseline, Wiki generated diagram or user workspace data was changed.
