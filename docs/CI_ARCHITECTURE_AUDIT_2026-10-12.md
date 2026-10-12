# CI architecture audit — 2026-10-12

## Revision and objective

- Baseline: `ui/human-review-2026-10-12` at `b6b3188bc8068b2ef50253c3d381904c76503ebf`.
- Working branch: `ci/architecture-governance-20261012`.
- Scope: workflow orchestration, release ordering, check ownership, branch-restricted write jobs and documented outstanding administration tasks.
- No approved UI pixel baseline, scientific geometry, renderer policy, or application behavior was modified.

## Workflow inventory (21 existing workflows)

| Workflow                              | Role and current authority                                         |
| ------------------------------------- | ------------------------------------------------------------------ |
| `quality.yml`                         | All PRs into main and manual; lint, format, docs and Node suite    |
| `browser-regression.yml`              | Targeted PR, release reusable, scheduled full and manual full      |
| `ui-v2-stage-c-m4.yml`                | Shared UI v2 on PR, active WIP branch, release reusable and manual |
| `pages.yml`                           | Production-release coordinator and GitHub Pages deployment         |
| `product-manual-wiki.yml`             | Every main push, managed Wiki synchronization                      |
| `pre-main-integration-validation.yml` | Explicit manual full integration inventory                         |
| `ui-v2-d1.yml`                        | Path-selected legacy D1/real Section diagnostic acceptance         |
| `ui-v2-main-mask.yml`                 | Path-selected Main/Mask/Section browser acceptance                 |
| `ui-v2-three.yml`                     | Path-selected 3D gestures/export cancellation                      |
| `ui-v2-preview.yml`                   | Isolated v2 preview publication; separate publication path         |
| `example-opening-acceptance.yml`      | Example cold/prefetch timing and diagnostics                       |
| `example-recipe-reconstruction.yml`   | Final-review fixture and full Recipe Run All                       |
| `process-recipe-safety.yml`           | Recipe safety and focused interaction                              |
| `klayout-compat.yml`                  | KLayout interchange corpus; path-selected/manual                   |
| `m3d-conformal-baseline.yml`          | Historical M3D comparative geometry/Windows evidence               |
| `m3d-example-integration.yml`         | M3D welcome/catalog branch-specific integration                    |
| `m3d-full-replay.yml`                 | Branch-restricted write-back reconstruction                        |
| `magic1000-candidate.yml`             | Branch-restricted write-back example generator                     |
| `photodetector-reconstruction-v2.yml` | Branch-restricted write-back example generator                     |
| `native-fig3-full-replay.yml`         | Final-review native Fig3 reconstruction                            |
| `tio2-metalens-reconstruction.yml`    | Metalens geometry, full-grid and browser replay                    |

## Verified configuration defects at baseline

1. `main` was reported unprotected with no required check ruleset. This is a GitHub repository-setting risk; commits cannot enable protection.
2. The existing Pages workflow started on a `main` push alongside Browser and UI v2 checks, and waited only for `npm test`. Pages could therefore publish a revision before those other checks finished.
3. Quality omitted Prettier and skipped documentation-only PRs, despite local `npm run check` including formatting.
4. Main push, PR, manual and branch-specific events had inconsistent owners, causing potentially redundant setup or missed assumptions about skipped checks.
5. The M3D, MAGIC-1000 and Photodetector generators contained repository-write steps; manual dispatch from a different branch could run inappropriate mutation commands.

## Implemented changes and boundaries

- Enforced a **single post-merge production DAG**: Release Quality + targeted Browser + real UI v2 checks must all succeed before Pages publishes the same `main` SHA. Retained the original specialized browser owners via `workflow_call`; removed their duplicate main-push triggers.
- Made Quality unconditional for all PRs to `main`, including docs-only, and switched it to `npm run check` (lint, format, generated-doc consistency and Node tests).
- Avoided duplicating Node tests between the release Quality and reused Browser job; scheduled/manual Browser still runs its own Node suite.
- Restricted write-back generators to their named branches, including manually dispatched runs.
- Made the preview publisher resolve the last successful production Pages run before selecting the root site checkout. A preview push cannot publish an unverified newer `main` tree as the production root.
- Added Node tests that lock workflow triggers, release dependencies and generator write guards.

## Explicitly outstanding (not represented as solved)

- **Admin action**: protect `main` using a GitHub ruleset or branch protection. Require at least `Quality / quality`; do not mark path-filtered or Draft-deferred checks required without a reliable always-present aggregator. Record the selected check names from actual check runs.
- **Preview publication**: `ui-v2-preview.yml` still has Pages write permission and publishes an unapproved preview under `/preview`. It now preserves the last successfully released production tree, but preview quality and cross-workflow deployment/concurrency policy remain independently reviewable.
- **Release efficiency**: the release UI v2 suite is intentionally conservative and runs for every product publication. After collecting measured CI times, add tested impact-routing if needed; do not weaken protection by making jobs silently optional.
- **Scientific and visual evidence**: software WebGL does not establish hardware GPU parity, human M2/UX review, or physical process validity. Preserve independent release acceptance.
- **Workflow consolidation**: branch-era workflows should be archived only after verifying their unique scenario ownership and replacing any active consumers.
- **External configuration**: an environment-level Pages deployment gate and administration settings cannot be enabled by these source edits.

## Validation handoff

The new release path requires an actual GitHub Actions execution to verify that reusable workflows, repository Pages permission, artifact uploads and branch-context expressions behave as intended. Node contract tests prove only the static repository policy; they are not evidence of successful deployment. Do not merge directly to `main` to test publication. Review CI results on the feature branch / PR first.
