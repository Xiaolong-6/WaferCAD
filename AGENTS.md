# WaferCAD development

Read `docs/COLLABORATION.md` for the shared ChatGPT/Codex handoff workflow, `docs/DEVELOPMENT.md` for product contracts, and `docs/testing.md` for test ownership.

- The active static application is under `site/`. Keep canonical geometry in physical micrometres; display scaling, ROI inspection and morphology must not silently change stored material geometry.
- Use stable internal entity IDs and preserve project migration, transactional workers, History restore and browser recovery contracts.
- Add regressions to the suite that owns the behavior. Avoid file splitting solely to reduce line counts.
- Use locked dependencies via `npm ci`. Run checks appropriate to the change; report exact commands, results, commit and environment. Scientific/rendering changes require runtime coverage.
- Keep approved platform-specific visual baselines separate. Do not replace an approved baseline merely to hide a failed comparison.
- Preserve other developers' uncommitted work. Inspect branch, HEAD and working tree before changing Git state; integrate concurrent upstream changes without force pushing.
- Update the relevant documentation and leave a reproducible handoff in the repository. Chats and ignored local artifacts are supporting context, not the shared source of truth.
- Follow the user's authorization for pushes, deployment and CI; do not infer permission to trigger costly manual jobs from a read-only review.
