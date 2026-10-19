# Verified PR release evidence

The Pages workflow supports a trusted, fail-closed fast publication path for
ordinary reviewed PR merge commits. Both paths still build, stamp, smoke,
and deploy the **actual main SHA**.

## Release evidence

A push to main enters the fast path only when:
- An ordinary two-parent merge is associated with exactly one merged PR.
- The reviewed PR head is the merge's second parent.
- Deterministic merge tree equals the main commit's actual tree.
- All discovered GitHub Actions PR checks are complete and successful or
  expected optional skips; cancelled, stale, or missing results fail closed.
- The **full final Quality** job actually ran, not Draft-only lint checks.
- Every mandatory science/Renderer/UI check succeeded, and each required
  workflow run has the same PR number, head SHA and pull_request trigger.

Two allowlisted fast cases:
1. **CI-only:** Changes are restricted to Pages routing, the focused verifier,
   its independent five-minute contract workflow, tests and this document.
   The PR must pass final Quality and Release evidence contract. No shipped
   application, model, Kernel, Renderer, project data, or examples are touched.
2. **Production:** No CI or release routing files have changed. The full
   baseline PR check set must pass: Quality, Chromium, Workstation, Renderer,
   625-site array and exact-wall checks, Process/IO/Array science, Stage C/M4,
   Main and Mask.

Everything else follows the existing complete main Quality, Browser, UI v2
and scientific gates. A GitHub API error, unknown merge, incomplete CI,
squash/rebase merge, forced push, direct-to-main commit or manual dispatch
also triggers full checks, never a publish bypass.

The actual main SHA is always rebuilt, smoke-tested, stamped and deployed.
The existing final Pages deployment verdict still blocks failed or skipped
staging and deployment.

## Acceptance

Focused contract: node --test site/tests/release-evidence.test.mjs
Normal PR Quality: npm run check (includes focused contract automatically).
The dedicated contract workflow never invokes 625-site pressure suites for
this CI-only PR.

Measure actual speed on the first owner-approved merge. No scientific
tolerance, Renderer contract, History/Recovery check or evidence baseline is
changed. Do not merge this PR without owner approval.
