# Renderer V3/V4 alignment to main after UI v2 PR #177

Date: 2026-10-12. Repository: `Xiaolong-6/WaferCAD`.

## Source and ancestry

- Latest verified `main` at integration: `240f23ab50cf2361386f98b22803695b7b7af0cd`.
- PR #166 (`perf/transparent-renderer-v3-20261009`) merge commit:
  `37901a3d9031739986ed3d645fb2d5fb24a33374`. Parents:
  V3 `031fb872b8c1ddca4ad4fdb59c0329ec96fd8fc6` and
  `main` `240f23ab50cf2361386f98b22803695b7b7af0cd`.
- PR #174 (`perf/renderer-v4-adaptive-tiles-20261010`) merge commit:
  `d737d30f055430e9262fc23a6fceb641f6f15f25`. Parents:
  V4 `5436f9994f63991acd5837e055d23aa53807cd91`
  and aligned V3 `37901a3d9031739986ed3d645fb2d5fb24a33374`.

Both updates are ordinary two-parent merges with GitHub compare reporting
`behind_by=0`: `main → V3 → V4`. No rebase, force push,
main branch modification or PR merge was performed.

## Resolution of concurrent changes

Three-way Git-tree integration used the merge base
`d73a201158e1d7f5c8efae4ea89a8cf2e2411c46` for V3:
299 main-exclusive changed paths and 37 V3-exclusive paths were
retained; 7 overlapping files were reviewed individually.

- `site/app.js`: preserve PR #177 native v2 view bridge and Section
  viewport state; integrate V3 asynchronous render-error / ROI-budget
  recovery instead of prematurely clearing `renderError`.
- `site/three-view.js`: preserve V3 implementation, which already
  incorporates the PR #177 `setGestureMode` / wheel policy and
  retains V3 geometry/render fixes.
- Three scientific array/renderer benchmark scripts: preserve the
  experimental V3 flags and its verified Legacy URL resolver, while
  using `newLegacyUiContext as newUiContext` from updated main.
- `docs/README.md` and `docs/testing.md`: retain main UI v2
  documentation and additive renderer diagnostics.

V4 integration retained 303 updated V3/main-only paths and
51 V4-exclusive paths. Two overlaps were explicitly resolved:
`docs/README.md` retains both UI v2 and V4 hardware/lifetime links;
`site/tests/issue-11-3d-controls.test.mjs` uses the Legacy
DOM and tests the PNG transaction's restore behavior.

## Checked contracts and validation

- GitHub ancestry: main → V3 `ahead / behind 0`; V3 → V4
  `ahead / behind 0`.
- `site/app.js`: v2 bridge and V3 ROI error handler both present.
- Visual baseline files: **zero differences** between the aligned
  V4 branch and `main` in the GitHub commit comparison.
- V3 aligned commit: Quality, Browser regression and UI v2 Phase B
  3D browser acceptance **success** (GitHub Actions
  `38229321673`, `38229321763`, `38229321688`).
- PR #174 earlier temporary-main integration acceptance **success**
  at V4 `5436f99` (GitHub Actions `38221723619`).
- V4 merged product commit `d737d30`: Windows Chromium preflight
  **success**; remaining focused CI results must be taken from
  GitHub Actions `38229620216` (not assumed passed).
- The V3 D1, Stage C/M4 and Main/Mask browser gates at the aligned
  commit were still running at the time of this documentation.

**Acceptance policy:** PRs #166 and #174 remain Draft; V3/V4 pixel
parity hardware findings and default-off V4 experiments are unchanged.
A passing software/browser gate is not approval of hardware strict
parity or a replacement screenshot baseline. Do not update the
approved visual reference to mask an experimental failure.
