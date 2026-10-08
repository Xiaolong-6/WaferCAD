# Main P0/P1 data-safety hardening — 2026-10-08

## Provenance and priority

Repository: `Xiaolong-6/WaferCAD`. Branch: `fix/main-p0-p1-stability-20261008`, branched from `main` `be2f6af190f20546ab15f9d4174ac496cc67b7f5` (PR #151 already merged). `main` has not been modified by this patch.

No new **confirmed P0** was identified in this source-level pass. Two **P1 data-loss risks** were identified by tracing destructive controller operations against the actual Recovery contract:

1. **Recipe template replacement** persisted a fresh Recipe immediately after the second confirmation. Only the in-memory Recipe Undo stack held the old version; refreshing after autosave removed that undo path. A Recovery checkpoint was not created for this destructive change.
2. **History destructive actions** could continue after the Recovery writer explicitly returned `false`. A read-only tab, not-yet-ready persistence controller, or busy/failed checkpoint writer can return `false` without throwing. Truncate, remove last Step and delete Variant ignored this outcome. Entering historical edit/insert also ignored a failed pre-edit checkpoint. **New Project** had the same unchecked-return hazard.

This is a source-confirmed *failure-path* risk, not a claim that current users have already lost data or that a specific private project reproduces it.

## Changes

- `site/controllers/process-recipe-controller.js`: a confirmed replacement of existing Recipe work now creates a durable Recovery checkpoint **before** changing Recipe/Code UI state. Explicit failure leaves existing work untouched. Protect against double submission and concurrent Recipe changes while checkpointing; re-enable template controls afterward. Newly loading into a truly empty Recipe needs no checkpoint. Existing in-session Undo remains.
- `site/app.js`: bind the Recipe guard to the real workspace checkpoint writer rather than a test-only default.
- `site/controllers/project-controller.js`: refuse History tail truncation, last-Step deletion, Variant deletion, loss of edited historical continuation, and New Project clearing when a checkpoint explicitly fails. A normal read-only History navigation still creates no unnecessary Recovery record.
- `site/controllers/history-mutation-controller.js`: refuse historical edit/insert setup when its pre-mutation checkpoint is refused or throws; do not restore historical input state on that failure path.
- `site/tests/history-mutation-controller.test.mjs`: unit regression proving failed checkpoint cannot enter History insertion or restore the historical input.
- `site/tests/project-controller-recovery.test.mjs`: unit regression proving a failed checkpoint cannot clear a New Project.
- `scripts/process-recipe-safety-regression.mjs`: browser test checks that confirmed Recipe replacement creates the `pre-recipe-template-replace` Recovery entry before replacing visible Steps.

Recovery is browser-local (IndexedDB, bounded retention). It is **not** a durable external revision-control or collaboration history. Unapplied Code editor drafts are not in the saved project payload and therefore remain unprotected by the checkpoint; the replacement warning now states that explicitly.

## Validation status and handoff

This round used the connected GitHub repository API because DevSpace workspace opening failed and the execution container could not resolve GitHub. **No Node, Chromium, or local Git test was run here.** The committed test changes are intended regressions, not claimed passing evidence.

Suggested minimum acceptance on the exact PR HEAD:

```bash
npm ci
npm run check
python3 -m http.server 4173 --bind 127.0.0.1 --directory site
# from another terminal:
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/process-recipe-safety-regression.mjs
WAFERCAD_THREE_DIR="$PWD/node_modules/three" npm run test:ui:history
WAFERCAD_THREE_DIR="$PWD/node_modules/three" npm run test:ui:persistence
```

Also exercise two-tab ownership denial: attempt New Project / History deletion / Recipe replacement in a tab without autosave ownership and confirm no state is lost; take over and retry with Recovery available. Verify the old Recipe by restoring its Recovery entry **after** a reload, and that canceled/failed checkpoint creation leaves the editor usable. Approved visual baselines and examples were not changed.

Scope boundary: opening a project and initial Welcome imports have separate startup/recovery sequencing, intentionally not gated by this patch; they must be audited with their startup pre-checkpoint contract rather than blindly using the editor's ready-state guard. The reported large private OAS Stop issue and the 625-site transparent-frame performance target remain independent follow-ups. No Kernel, geometry, example data or baseline images were modified.
