# P1 numerical integrity, release routing and Recovery fault handoff — 2026-10-14

> **Status verified 2026-10-16:** [PR #222](https://github.com/Xiaolong-6/WaferCAD/pull/222), which delivered this P1 science/release/Recovery work, merged into Main on 2026-10-14 (`223ba33`). Branch, baseline, and remaining-work statements below are historical checkpoint evidence; consult the active [Testing](testing.md) and [CI](CI.md) contracts for present gates.

## Baseline and working boundary

- Repository: `Xiaolong-6/WaferCAD`.
- Branch: `fix/p1-science-release-recovery-20261014`.
- Base: `main@fb3f410b17a58179588b2ac13eed8d8d759d34ef`.
- Working HEAD: use the PR head SHA, not the base above.
- Existing PR #188 owns progressive startup; this change avoids startup lifecycle code.
- Work was authored through the connected GitHub API. This environment does
  **not** have a local npm/Chromium checkout, so local CI commands were not
  executed. Passing evidence must come from the PR workflows.

## P1-1: numerical/physical contract

- Removed the old `0.01 nm` silent process thickness clamp in
  `site/model.js`. Material stack resolution now fails explicitly at its
  existing `normalizeStack` filter threshold, shared with Recipe normalization.
- Implant/Electrical depth annotations and absolute-Z Planarize remain distinct
  from material film thickness.
- Recipe serialization no longer rounds canonical lengths to eight significant
  digits when that changes their replayed value.
- Added Kernel and Recipe regression cases; see
  [physical interpretation and limitations](PROCESS_NUMERICAL_CONTRACT_2026-10-14.md).

## P1-2: same-SHA publication gates

- Extended `scripts/ci-test-plan.mjs` to select `main_mask`, `klayout` and
  `recipe` acceptance routes.
- The existing focused workflows now allow `workflow_call` and retain their
  PR/manual ownership.
- `pages.yml` invokes selected release owners and requires an always-present
  scientific aggregate. A selected gate failing, missing, skipped or cancelled
  blocks Pages; an unselected gate must be skipped. Unresolvable main history
  or manual dispatch uses the conservative full plan.
- Repository `main` ruleset/branch protection remains an administrator
  action. The REST ruleset listing and branch metadata at the starting commit
  did not establish protection; YAML alone cannot prevent a bypass merge.

## P1-3: fault paths

- Extended controller fault-matrix tests to distinguish successful rollback
  from failed/declined rollback, preserving honest Recovery guidance.
- Added worker Abort and late-message tests using the existing
  `process-task-controller`. The real browser transaction script now also
  exercises Abort after dispatch, rejected worker candidates, and exact model,
  History and Variant state comparisons.
- Recipe safety CI invokes that real browser transaction owner.
- Existing `scripts/persistence-regression.mjs`, cross-interface Recovery,
  History and project IO tests remain the owners for reload/IndexedDB and
  complete project round trips. A standalone, all-scenarios browser
  fault campaign has **not** been claimed as passed.

## Before merge

1. Run the PR `Quality` check (`npm run check`), targeted Browser
   Process/History/Persistence, Recipe safety, Main/Mask and KLayout
   when path-matched.
2. Inspect formatting, workflow structural tests and real worker fault artifacts.
3. If a failure is reproducible, fix the specific owner and recheck this branch.
4. Confirm `main` HEAD did not advance into conflicting science/CI paths,
   rebase or merge non-destructively, and obtain a green tested PR head.
5. Do not assert actual Pages publication before a same-SHA release run;
   preview/Ruleset administration and physical GPU evidence are separate.
