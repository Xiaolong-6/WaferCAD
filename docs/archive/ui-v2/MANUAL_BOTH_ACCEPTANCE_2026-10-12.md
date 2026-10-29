# UI v2 Manual Both — integration handoff (2026-10-12)

> **Historical evidence only.** This records PR #179 at its tested revision,
> not the current Workstation implementation, test inventory or merge gate.
> See the [current Workstation contract](../../ui-v2/WORKSTATION_CONTRACT.md).

Repository: `Xiaolong-6/WaferCAD`.

Branch: `feat/ui-v2-manual-both-20261012`; PR #179.
Source: `57fd8e17`; incorporated main: `7795777` (PR #178).
This merge commit retains both sets of Stage C/M4 workflow changes.

## Behavior

The Manual Process selector supports Front, Back and Both.
Both executes Front then Back atomically; a dual Deposit creates
two independent, mutually linked layer IDs. Extend and selective Etch
offer canonical Front targets only if the linked Back material is exposed.
Lift-off and absolute-Z Planarize are disabled for Both.
Recipe restoration preserves Both in v2, without altering the Legacy UI.

## Code and tests

- `site/ui-v2/workstation-workflow.js`: Manual face selector.
- `site/controllers/process-panel-controller.js`: valid paired targets and guards.
- `site/controllers/process-recipe-controller.js`: v2 Recipe face restoration.
- `site/tests/function-panel-feedback.test.mjs`: historical test path (removed from current main); current ownership is in `site/tests/process-both-face.test.mjs` and Process panel controller tests.
- `scripts/v2/check-manual-both.mjs`: real Chromium end-to-end test.
- `.github/workflows/ui-v2-stage-c-m4.yml`: main push coverage and the Both test.

PR #179 original pre-integration [Stage C/M4 run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38231633929)
succeeded with zero failures. Its browser log reported
`V2_MANUAL_BOTH_OK`, covering paired layer identities, Extend,
selective Etch, unsupported operations, autosave and History recovery.
Node Quality, Chromium targeted regression, D1, 3D gestures and scientific
checks also passed. Main/Mask remained in progress when this was recorded.

Environment: GitHub Actions Ubuntu, Node 24, Playwright 1.55.1,
software Chromium. Executed `npm ci --ignore-scripts --no-audit --no-fund`,
`npm run lint`, `npm run format:check`, and
`node scripts/v2/check-manual-both.mjs` in the Stage C/M4 runner on port 4182.
No direct local browser or physical GPU acceptance was performed.

## Remaining acceptance

Reverify the post-merge-parent HEAD against main: Quality, Main/Mask,
Stage C/M4, cross-UI recovery, D1 and scientific gates.
Investigate failures without altering approved visual baselines.
Hardware RTX GPU, full Recipe Run All and physical touch are independent gates.
Keep #179 Draft until integration checks pass; do not count skipped runs as passes.
