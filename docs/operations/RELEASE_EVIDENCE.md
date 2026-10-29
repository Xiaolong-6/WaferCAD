# Verified PR release evidence

Pages has a fail-closed fast publication path for reviewed ordinary merge
commits. Every successful publication still builds, stamps, and smoke-tests
the **exact Main SHA** before uploading and deploying it.

## Admission

The fast path requires:

- A two-parent GitHub merge associated with exactly one merged PR.
- The reviewed PR head as the second parent and the final Main base as
  an ancestor of that PR head.
- The deterministic merge tree equal to the actual Main tree.
- A completed **full Ready-for-Review Quality** job for the exact reviewed
  PR SHA. Draft-only Quality does **not** authorize fast publication. The
  newer [incremental PR Quality route](../CI.md#incremental-quality-baseline--exact-diff)
  may establish a review-time changed-file Quality verdict, but it is **not**
  a substitute for the full Quality evidence required by the existing
  fast-Pages release verifier (`scripts/release/verified-pr-release.mjs`).
  The fast release route recognizes a valid full source-bound local receipt
  or a successful independently executed **full** Quality step on the exact
  PR integration tree. A tolerated, skipped or merely attempted proof probe
  is not release authorization. An eligible PR without full fast-path proof
  follows the existing complete Main verification fallback.
- Every discovered GitHub Actions check completed successfully or an allowed
  optional skip. Failed, cancelled, timed-out or in-progress checks never
  authorize deployment.
- Every **required** Browser/Renderer/scientific check selected by the same
  `scripts/ci-test-plan.mjs` ownership plan as PR CI. Required checks must
  succeed (not skip), be unique, and retain the reviewed PR head SHA, branch,
  repository, `pull_request` event and successful workflow run provenance.

Two supported fast scopes:

1. **CI-only:** Only the explicitly allowlisted release workflow, verifier,
   focused tests and this documentation have changed. Full Quality and the
   independent Release evidence contract must both pass.
2. **Audited presentation/UI/Renderer:** The impact plan requires the exact
   applicable Chromium and Stage C/M4, Main/Mask, native UI, Renderer,
   625-site and Process/IO/Array owners. Unselected owners are not invented
   as mandatory gates. Changes to project IO, History/Recovery, workspace
   persistence, Kernel/scientific processes, CI routing or unknown scopes
   **do not** use this fast path.

Changes outside those scopes take the complete Main validation path. The
production selection is deliberately more conservative than the test planner.
No geometry, numerical or data-integrity tolerance is relaxed.

## Merges while CI is running

A merge may happen while the exact PR's checks are still running. The Main
release-evidence job first checks the Main ref and then waits up to 55 minutes
for existing PR evidence, checking GitHub every 30 seconds. It does not
start expensive duplicate Main validation while those checks are still
in progress. Incomplete, missing, failed or stale evidence at the deadline
falls back to complete Main verification. Unrouted checks do not qualify.
The wait is bounded; it is not proof of successful CI on its own.

## Superseded Main and publication

Validation runs for distinct Main SHAs no longer share a global Pages lock.
Only the `Publish verified main` job uses the `pages-publication` lock,
with cancellation disabled. **Inside** that lock, GitHub checks the current
`refs/heads/main` SHA again. A superseded SHA skips deployment; a current
SHA deploys only the exactly staged and smoke-tested artifact.

The final verdict differentiates actual publishing from an attested
supersession. A missing stage or skipped deploy cannot masquerade as a
successful current-Main publication. A live deployment is never cancelled,
including if Main moves during its short publishing step. The next latest
Main publication then supersedes its output.

GitHub API failures, ambiguous merges, malformed history, missing test
evidence and publication verification errors fail closed. A superseded
version is allowed to exit without publishing, but is **not** counted as
a deployment of the latest version.

## Acceptance

- `node --test site/tests/release-evidence.test.mjs`
- `node --test site/tests/ci-workflow-architecture.test.mjs site/tests/ci-development-gates.test.mjs`
- Existing `site/tests/ci-test-plan.test.mjs` science and owner-route contracts.
- For the **fast release path**, supply valid full source-bound evidence for
  the exact reviewed revision, or an independently completed full Quality
  step. Otherwise use the complete Main verification fallback. The separate
  incremental Draft/Ready Quality optimization cannot be relabeled full.
  Neither route may skip or weaken required scientific/History/browser checks.
- Before approval, audit a normal UI change, a Renderer change and an
  integrity-sensitive Project IO/History change against the same planner.
  Missing/failed/stale checks, unreviewed Draft Quality and incorrect
  publication order must be refused.

Actual PR → Merge → Deploy latency must be measured on a future owner-approved
merge. These contracts do not themselves prove a five-minute deployment.
This is a durable release admission contract, not an instruction about an
old, still-open CI-policy PR. An individual merge requires its own current
approval and exact-revision evidence.
