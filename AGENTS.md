# WaferCAD development

**English-only convention for current and future work:** Write new and actively maintained documentation, UI copy, prompts, examples, commit messages, source comments, and handoff reports in English. Preserve historical audits, completed plans and old handoffs in their original language; do not translate them just for consistency. Retain compatibility links when retiring localized Wiki pages.

Read `docs/COLLABORATION.md` for the shared ChatGPT/Codex handoff workflow, `docs/DEVELOPMENT.md` for product contracts, and `docs/testing.md` for test ownership.

- The active static application is under `site/`. Keep canonical geometry in physical micrometres; display scaling, ROI inspection and morphology must not silently change stored material geometry.
- Use stable internal entity IDs and preserve project migration, transactional workers, History restore and browser recovery contracts.
- Add regressions to the suite that owns the behavior. Avoid file splitting solely to reduce line counts.
- Use locked dependencies via `npm ci`. During iteration run focused checks and (for UI/Renderer/Example changes) inspect real-browser output before broad CI. Before final acceptance run the required Quality, targeted CI and scientific/regression gates; do not weaken tolerances or skip data-integrity checks. Report exact commands, results, commit and environment.
- Keep approved platform-specific visual baselines separate. Do not replace an approved baseline merely to hide a failed comparison.
- Preserve other developers' uncommitted work. Inspect branch, HEAD and working tree before changing Git state; integrate concurrent upstream changes without force pushing.
- Update durable engineering/scientific contracts in the repository. For PR-specific progress, failures and handoff, maintain the PR description as the current status and comments as chronological evidence; do not create dated audit/handoff Markdown by default. Keep essential scientific provenance, fixtures and safety-critical evidence in version control. Chats and ignored artifacts are not authoritative.
- Follow the user's authorization for pushes, deployment and CI; do not infer permission to trigger costly manual jobs from a read-only review.
