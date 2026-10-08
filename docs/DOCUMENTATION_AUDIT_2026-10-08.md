# Documentation and architecture audit — 2026-10-08

## Scope and revision

Audited product: main `82c35a845946835451fd7da9fcbe92be47593e7f`. Work branch: `codex/documentation-audit-20261008`. The clean desktop audit checkout was reused; the user's original feature working tree and uncommitted changes remain untouched. This audit changes documentation and its checks, not canonical geometry or runtime Process/rendering behavior.

Initial inventory: 73 tracked Markdown files; 61 root/docs/vendor pages received the first relative-link and heading scan. Its 150 checked relative destinations had no broken links. Sixteen documents had no ordinary incoming documentation link; the Wiki sidebar is additionally managed by publication. The final guard expands coverage to all non-ignored tracked/new Markdown, current-repository public links, source module references and navigation reachability.

## Findings and remediation

| Finding                                                                                                                                                                                         | Repair                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentation map omitted KLayout, collaboration and many reconstruction/audit records; flat files blurred current contracts and evidence.                                                      | Audience-based map, explicit documentation architecture and complete archive index. Original evidence paths remain unchanged.                         |
| Architecture described obsolete Main/Mask/Function + 3D/Section layout and omitted Recipe composition.                                                                                          | Current five primary view choices, Section dock and rail; explicit Recipe/preflight ownership and transaction diagram.                                |
| Root/Architecture prose treated file storage as universally 0.1 nm quantized and did not distinguish Manual editing from Recipe precision.                                                      | Separate canonical lengths, Manual grid, strict compact codec, automatic lossless Export, autosave and Recovery; synchronized English/Chinese manual. |
| Kernel non-goals excluded overhangs, contradicting release/interval benchmarks.                                                                                                                 | Distinguish supported Z-gap/undercut/suspended topology from arbitrary free-form 3D solids.                                                           |
| CI docs described unconditional ten-suite PR runs and nightly coverage, omitted Draft deferral and dedicated replay triggers.                                                                   | Align with impact-selected jobs, weekly events, Draft conditions, PR/manual-only full replays and distinct Wiki/Pages triggers.                       |
| Live tutorials referenced feature branches; examples chapter still called M3D Run All unverified after desktop acceptance.                                                                      | Describe shipped parser and cite exact prior geometric replay evidence without expanding claims to fabrication physics or all platforms.              |
| Old branch-stage reports could be read as today's approval/status.                                                                                                                              | Revision-specific banners and grouped evidence catalog preserve the original counts, assertions and measurements.                                     |
| Generation checks did not detect dead destinations, wrong filename case, orphan pages or nonexistent source/atlas/example targets; documentation-only Wiki publication did not parse tutorials. | Permanent `docs:check` link/navigation gate plus negative-fixture tests; Wiki CI includes guide, catalog/tutorial and documentation tests.            |

## Validation

Environment: Windows 10.0.19045, PowerShell, Node 24.19.0; locked dependencies retained from `npm ci`. No new dependency was added.

Validation completed with exit code 0:

- `npm run format`: applied the repository formatter.
- `npm run lint`: full configured ESLint scope passed.
- `npm run docs:check`: generated reference matched; 18 operation descriptions and 12 authored/navigation pages checked; 76 Markdown files, 296 internal links, 60 reachable docs and 43 Architecture module references passed.
- `node --test site/tests/documentation.test.mjs site/tests/wiki-manual.test.mjs site/tests/process-guide.test.mjs site/tests/ci-test-plan.test.mjs`: 36 passed, 0 failed, 0 skipped. Includes negative link/navigation fixtures, actual English/Chinese Recipe parsing, guide/catalog contracts and CI planner behavior.
- `npm run format:check`: final full configured formatting gate passed.

No unresolved P0/P1 finding remains in the audited documentation scope. The previous scientific/browser release checks are recorded in [the desktop release audit](PRE_MAIN_DESKTOP_AUDIT_2026-10-08.md); they are not repeated or relabeled as a new scientific run for prose changes.

The committed source and tests are reproducible via `npm run docs:check`, `npm run lint`, `npm run format:check` and `node --test site/tests/documentation.test.mjs site/tests/wiki-manual.test.mjs site/tests/process-guide.test.mjs`. New manual editing follows [Documentation architecture](DOCUMENTATION.md).

## Limits and delivery

The audit checks repository contracts against code/workflows and verifies internal destinations. It does not perform a fresh external DOI/vendor HTTP sweep, re-certify all pinned third-party layout corpus data, accept Linux pixels, or certify live Wiki/Pages deployment. Research snapshots and recorded performance numbers keep their original dates and environments. No costly manual CI was dispatched.

Documentation repairs and their automated guard were committed as `52d83c2b2b6925cb1fe758dd87dd322f4818d7a3`. The subsequent user-authorized UI merge and its exact tested revisions are recorded in [the toolbar integration handoff](UNIFIED_TOOLBAR_INTEGRATION_2026-10-08.md). The combined integration checks and remote refresh passed; both audits accompany the user-authorized normal main publication. Current product contracts remain in the documentation map; this report is revision-specific evidence.
