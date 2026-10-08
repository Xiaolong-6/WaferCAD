# Recipe local patch integration — 2026-10-08

> **Revision-specific evidence.** This record describes its original date, branch and validation scope. It does not establish current main status. Use the [documentation map](README.md) and [archive index](archive/README.md) for current contracts and later evidence.

## Provenance

The user supplied `recipe-fixes-from-feat-process-recipe-v1.zip` containing `recipe-fixes.patch`, `README.txt` and `VALIDATION.md`.
Its stated base is `feat/process-recipe-v1` at `64797ea27341aba4e9c51044ab7837a768fd85ed` (exactly matched the integration branch at inspection). The archive cites local commit `27642f45b929c9dc2110ede558fe27cdf6137b4d` and expected Git tree `1a1c965dcbe0611b6c63ad93a2faa15eab508a98`, but that local commit was not remotely published when inspected.

This integration **selectively ports substantive fixes**, not the archive's full formatting-only patch. Therefore the final Git tree is intentionally different from the archive's expected tree.

## Ported behavior

1. **Stable Step validation drafts:** invalid input metadata records the Step ID and original label/error separately. Deleting a Step or changing its operation prunes obsolete errors; Undo/Redo clears unapplied field errors and restores the valid committed Recipe.
2. **Prefix-aware execution:** Run to Step only reports field errors belonging to Steps within the requested prefix. The error display number is resolved against current Step order, avoiding stale numbers after reordering.
3. **Derived Process material-exposure cache:** grow/etch material target menus reuse the exposed-layer result when model reference and revisions, process revision, active face, selected area, active Cell/Layer keys, mask transform/ROI/draw state and layout elements reference are identical. Canonical worker-side process geometry and validation remain unchanged.
4. **Regression:** added a unit case for cache invalidation and a browser case that inserts an invalid later Step, successfully replays an earlier prefix, deletes/undoes the invalid Step, and changes its type.

Not copied: Prettier-only diffs to unrelated scripts and the archive's standalone validation report as if it described this integration. The user-supplied validation report records Windows Node v24.19.0: 477/477 unit tests, Recipe safety browser, Process Geometry (nonextended), eslint and modified-file formatting checks passing **on its local patch**. These results are useful prior evidence, but final acceptance must be checked on the actual integrated SHA via GitHub CI.

## Limitations and test boundary

The exposure cache is a menu/UI optimization, not a solution for the previously reported privately supplied OAS stall. No private mask/OAS was included. Revalidate if a layout mutates elements in place without replacing the collection or incrementing the model/layout revision; imported file hierarchy and effective layer selection should continue to invalidate derived exposure on edit.

Integration branch: `feat/process-recipe-v1`. `main` unchanged. PR #135 remains Draft until the combined Quality, Process Recipe safety, Browser geometry/product, and Native Fig3 gates pass.
