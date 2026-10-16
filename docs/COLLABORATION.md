# ChatGPT and Codex development handoff

Both development environments work against the same Git repository. The shared source of truth is the exact repository revision, durable committed contracts and the current PR description. PR comments retain chronological evidence; chat history, browser IndexedDB, local recovery points and ignored test artifacts do not automatically transfer between environments.

## Starting work

1. Confirm repository, branch, HEAD and working-tree status. Fetch the current remote refs when network access is available, and inspect upstream changes before integration.
2. Read `AGENTS.md`, [Development](DEVELOPMENT.md), [Testing](testing.md), and any handoff or audit covering the affected subsystem. ChatGPT sessions without a local checkout should obtain these files from the exact GitHub revision being edited.
3. State the intended behavior and scope. Preserve unrelated edits; use a separate branch or checkout when concurrent work would otherwise overlap. A stale chat summary must not replace newer repository code or contracts.

## Implementing and checking

The application has no build step. Install pinned tooling with `npm ci`; install Chromium with `npx playwright install chromium` (add `--with-deps` on Linux). Serve `site/` on port 4173 for browser tests and route Three through the local package as described in [Testing](testing.md).

During development, run only the owning unit/scientific checks and basic startup needed for the changed behavior. For UI, Renderer and Example changes, inspect real-browser renders/screenshots and the relevant intermediate process structures before expanding tests. Before final acceptance run the required Quality, targeted CI and scientific/browser regression gates; use `npm run check` for local full Node/lint/format validation and `npm run test:ui:all` only when broad integration is justified. Do not weaken assertions to obtain a pass. Avoid repeated pushes or polling incomplete CI; distinguish failures caused by this PR from independent failures.

A test that was not executed remains unverified. Record OS, Node, Playwright/Chromium, Three, commands, exit results and any limitations. Windows baseline acceptance does not establish Linux pixel stability. The five approved Windows references are in `tests/visual-baselines/windows-chromium/`; the visual gate remains opt-in and outside CI.

## Leaving work for the next environment

Keep these facts in the **PR description** as the single current handoff/status entry (updating it as work changes); add evidence-rich PR comments only for discrete reviews, failures or acceptance events:

- repository, branch and exact product commit;
- behavior changed and affected modules/contracts;
- tests actually run, environment and artifact locations;
- outstanding failures, decisions and acceptance criteria;
- whether work is local, pushed, reviewed or deployed.

Do not create a dated Markdown audit/handoff for each PR. Update the owning long-lived document when architecture, scientific assumptions, data format, recovery behavior, testing or release policy changes. Preserve portable reproduction recipes, validated baselines and important scientific provenance in the repository; keep transient run logs and screenshots as linked PR/CI artifacts. Use relative repository paths in shared documents. Ignored artifacts can disappear on another computer: commit approved reference fixtures/baselines and the validation summary, or attach the relevant external artifact explicitly. Export a `.wafercad` project when sharing a browser scenario; do not assume that local autosave/Recovery or chat attachments reproduce it elsewhere.

Before final acceptance, review unresolved PR evidence and consolidate durable decisions into the owning docs; a green CI run alone is not visual/scientific acceptance. Before publishing, refresh `origin/main`, inspect the integration diff and use a normal fast-forward or reviewed merge. Never force push over another session's work. Push, merge, Pages deployment and manual CI runs follow the user's authorization. A push to `main` that changes `site/` triggers the existing Pages workflow automatically; it is separate from a manually dispatched full browser/visual gate.

## Current handoff

Start with the [documentation map](README.md) and the current contract documents it links. The 2026-10-05 validation/stabilization files remain historical evidence for those revisions; the accepted Windows Chromium visual set now includes the updated Photodetector reference. The 2026-10-07 project-IO/array and pre-main audit files are also historical checkpoints after their work entered `main`.

For current development, inspect `origin/main`, open PRs and the active integration branch before relying on any dated branch/status statement. Audit and optimization reports may live in `main` after merge; their original branch wording is intentionally preserved as historical evidence and should be accompanied by a superseded banner when necessary.
