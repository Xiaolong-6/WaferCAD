# ChatGPT and Codex development handoff

Both development environments work against the same Git repository. The shared source of truth is the exact repository revision and committed documentation; chat history, browser IndexedDB, local recovery points and ignored test artifacts do not automatically transfer between them.

## Starting work

1. Confirm repository, branch, HEAD and working-tree status. Fetch the current remote refs when network access is available, and inspect upstream changes before integration.
2. Read `AGENTS.md`, [Development](DEVELOPMENT.md), [Testing](testing.md), and any handoff or audit covering the affected subsystem. ChatGPT sessions without a local checkout should obtain these files from the exact GitHub revision being edited.
3. State the intended behavior and scope. Preserve unrelated edits; use a separate branch or checkout when concurrent work would otherwise overlap. A stale chat summary must not replace newer repository code or contracts.

## Implementing and checking

The application has no build step. Install pinned tooling with `npm ci`; install Chromium with `npx playwright install chromium` (add `--with-deps` on Linux). Serve `site/` on port 4173 for browser tests and route Three through the local package as described in [Testing](testing.md).

Use `npm run check` for the Node/lint/format gate. Select the focused browser group for the changed behavior; run `npm run test:ui:all` for broad integration. Geometry and rendering checks must establish physical structure and ownership, not just successful clicks. Keep changes and their scientific contracts together; do not weaken an assertion merely to obtain a pass.

A test that was not executed remains unverified. Record OS, Node, Playwright/Chromium, Three, commands, exit results and any limitations. Windows baseline acceptance does not establish Linux pixel stability. The five approved Windows references are in `tests/visual-baselines/windows-chromium/`; the visual gate remains opt-in and outside CI.

## Leaving work for the next environment

Include these facts in a committed handoff or task-specific audit:

- repository, branch and exact product commit;
- behavior changed and affected modules/contracts;
- tests actually run, environment and artifact locations;
- outstanding failures, decisions and acceptance criteria;
- whether work is local, pushed, reviewed or deployed.

Use relative repository paths in shared documents. Ignored artifacts can disappear on another computer: commit approved reference fixtures/baselines and the validation summary, or attach the relevant external artifact explicitly. Export a `.wafercad` project when sharing a browser scenario; do not assume that local autosave/Recovery or chat attachments reproduce it elsewhere.

Before publishing, refresh `origin/main`, inspect the integration diff and use a normal fast-forward or reviewed merge. Never force push over another session's work. Push, merge, Pages deployment and manual CI runs follow the user's authorization. A push to `main` that changes `site/` triggers the existing Pages workflow automatically; it is separate from a manually dispatched full browser/visual gate.

## Current handoff

Start with the [documentation map](README.md) and the current contract documents it links. The 2026-10-05 validation/stabilization files remain historical evidence for those revisions; the accepted Windows Chromium visual set now includes the updated Photodetector reference. The 2026-10-07 project-IO/array and pre-main audit files are also historical checkpoints after their work entered `main`.

For current development, inspect `origin/main`, open PRs and the active integration branch before relying on any dated branch/status statement. Audit and optimization reports may live in `main` after merge; their original branch wording is intentionally preserved as historical evidence and should be accompanied by a superseded banner when necessary.
