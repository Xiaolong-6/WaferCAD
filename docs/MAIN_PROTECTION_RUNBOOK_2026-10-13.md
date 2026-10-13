# Main branch protection — administrator runbook (2026-10-13)

## Current verification

Audited `main@c8aa303079d6a3ea3d67f0d34cc65275c74a0215`. GitHub public repository Rulesets API returned `[]`. The Branch Protection endpoint returned `403 Resource not accessible by integration`; therefore the agent **cannot confirm nor change** classic branch protection. Repository management requires an authorized Admin session. Workflow YAML cannot enforce server-side merge restrictions.

## Administrator action

In `Xiaolong-6/WaferCAD` → Settings → Rules → Rulesets, add a branch ruleset targeting exactly `refs/heads/main` and enable enforcement:

1. Require a pull request before merging (do not mandate a different human reviewer in a personal repo).
2. Require status checks to pass: select the actual check context **`Quality / quality`** from an existing completed PR run.
3. Block force pushes and branch deletion. Restrict bypass actors; any emergency bypass must be traceable.
4. Do **not** require path-selected or Draft-deferred tests as permanently required checks unless a reliable always-running aggregator is installed.
5. Verify direct push and a deliberately unpassed PR merge are blocked, and a successful PR merge remains possible. Never test with a production-destructive push.

## Release and preview checks

`.github/workflows/pages.yml` currently coordinates same-commit release Quality, Browser, real UI v2 and Pages deployment. Confirm in GitHub Actions on a non-publishing branch that the successful release artifact corresponds to the exact main SHA. Preview publishing has an independent Pages write path; review environment permissions/concurrency before treating preview as production-approved.

## Evidence to record

Ruleset identifier, effective branch targeting, required check context, authorized bypass actors, rejected direct-push/failed-PR checks, approved green-PR merge, and timestamp. Do not mark protection complete based only on this Markdown runbook or GitHub's API listing.

**State:** administrator configuration outstanding; no repository settings changed by this branch.
