# Three-branch integration review — 2026-10-08

## Scope and baseline

Target PR: [#151](https://github.com/Xiaolong-6/WaferCAD/pull/151).
Integration staging branch: `integrate/reviewed-branches-20261008`.
Original main baseline: `bad705c406ebb57a84f3a0ac66340b63e92bcf0c`.

Reviewed source branches:

- `fix/m3d-conformal-microcracks-20261008` — preserve substrate XY material coverage during Conformal and protected selective Etch; regenerate M3D.
- `feat/process-panel-workflow-v2-20261008` — compact Step mode and safe Recipe template replacement.
- `docs/wiki-illustrated-manual` — consolidate the former stand-alone Process guide into a Wiki with 18 generated figures.

Staging merge records: #148, #149 and #150. Four Wiki/Process overlapping files were inspected and resolved manually, retaining the new Step-mode disclosure plus per-operation Wiki links. The integration branch is strictly ahead of main, which has not been changed.

## Kernel and example regression review

- Original M3D S15 produced sub-grid XY void slivers; a 2.5D XY void generated spurious full-depth substrate sidewall triangles even with Border disabled.
- New coating/etch coverage repair is bounded and transactional. A simulated Boolean false-crack regression caught an owner-overlap bug, fixed by retaining the complete-base fast path and verifying candidates against every owner.
- The regenerated M3D example retains all 35 Recipe steps, 36 History nodes with Recipe state and 27 bookmarks. New Recipe backfill is part of the Kernel replay workflow; it cannot be silently dropped during regeneration.
- [Branch-local M3D scientific and visual replay](https://github.com/Xiaolong-6/WaferCAD/actions/runs/37809077273) passed; this alone does not establish current PR head acceptance.

## Acceptance gates

1. Run all scientific/Recipe/Browser/Main/Section/3D tests on the **final integration SHA**, with no newly introduced Kernel failures.
2. Check the actual 35-step M3D Recipe `Rebuild Base → Run All` from the Welcome Example, not just an offline saved-geometry replay.
3. Audit the five Windows visual baselines on both the original main SHA and the integrated SHA using identical runners. Preserve approved images and upload actual/expected/diff evidence for every changed panel. Explicitly review deliberate UI layout differences.
4. Run docs generation/link check, ESLint and pinned Prettier; do not auto-update approved snapshots to make tests pass.
5. Check branch/main base again immediately before the final merge; do not merge if the head moved or CI is red.

## State

This document is a staging audit and should be updated with final check links and conclusions. GitHub PR runs created directly from `github-actions[bot]` commits can report `action_required`; rerun acceptance on a human-authorized final commit before merging.

Do not treat queued, `action_required`, canceled or pending checks as successful.


## Final CI failure remediation

- The October 5 approved Windows pixel references are stale even for the unchanged main revision: `wide-project-panel` differs by 3.8266% from its original pixels. The combined branch differs by 4.7071%; the redesigned phone Process control contributes an intentional 25.0381% change. The references are **not overwritten**. Both historical comparisons remain visible as failed diagnostic steps, with all actual/expected/diff artifacts, while an explicit current layout contract is required to pass.
- All nine per-example browser `Rebuild Base → Run All` matrix checks completed successfully on `5d82e8f`, including M3D, Fig15 A/B and suspended-silica Keep History. Therefore, the second, serial all-five replay and repeated Fig15/Keep History in Recipe safety is removed. The safety job retains its complete Node tests, live Recipe interaction and Stop/Undo checks. The parallel matrix stays mandatory.
- No geometry Kernel, M3D source masks, or material-model assertions have been relaxed.
