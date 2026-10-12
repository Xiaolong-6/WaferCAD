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

## R8 follow-up: main #178, GPU-neutral harness, and CI follow-through

This section supersedes the `main` HEAD snapshot above for subsequent work;
the earlier section remains provenance for the October 12 PR #177 merge.

- Updated `main`: `77957774e8d37a37b410e29b3a2c6201037250c8`
  (PR #178, writer-lease fail-closed and CI ownership).
- V3 integrated that main commit in ordinary two-parent merge `4064e04`,
  reviewing the sole overlapping `docs/testing.md` change and retaining
  renderer diagnostics. V4 integrated the matching V3 parent as `21b40a4`.
  The branch ancestry was verified main → V3 → V4, each with `behind_by=0`.
- Hardware acceptance is **adapter-neutral** under `--hardware-gpu`:
  Intel/AMD integrated and discrete GPUs are eligible if unmasked hardware
  identification succeeds; SwiftShader/other software backends are excluded.
  Each four-context experiment requires the same adapter, and the zero-pixel
  same-environment parity gate is unchanged. Older Windows/RTX 3060
  commands remain compatible. Sources: V3 `e209a40`, V4 `74c690f`,
  and `docs/RENDERER_V3_V4_UNIFIED_HARDWARE.md`.
- The fresh-context phase comparison now rejects absent checkpoint hashes
  and reports the preceding matching draw checkpoint; the observation remains
  a bounded interval and does not establish a causative draw. V3 `0f22d6c`,
  V4 `6f5c5c7`. Focused Node tests passed in V4 CI `38231925008`.
- V4 real UI v2/Legacy compatibility `38234177383` **passed**:
  Photodetector 3D at 1440/1024/768/390, emulated touch, legacy route,
  and V4 R2 strict screenshot comparison 0/146025 pixels. The prior
  768 px material-pixel absence in `38233140360` was not reproduced;
  do not claim its root cause fixed. The updated failure path now captures
  a dedicated canvas PNG, scene/camera/frame counters, and a JSON sidecar;
  the actual colored-material assertion remains strict and unchanged.
- V4 R1–R7 focused `38234841947` **passed** including the Node gate
  after main #178 sync, with full-gate trigger ownership expanded to
  writer-lease and renderer-capture sources.
- V3 Stage C/M4 `38233960016` **failed** in Metalens Project export after
  successful GDS/OAS mask round-trips: Playwright finished click dispatch
  but timed out awaiting implicit navigation. V3 `69a8b8b` and V4
  `aa6be63` now use real pointer click, preserve the 120-second
  actual download event and scientific project round-trip assertions.
  Recheck the owning V3 Stage C/M4 run `38235061321`; its outcome was
  **pending at the time of this handoff**.

Current boundaries: both PRs are Draft, no default-on V4 paths, no main
merge and no approved visual baseline changes. This work adds no new
physical-GPU capture or performance claim. The prior RTX 3060
fresh-context mismatch is still a strict hardware acceptance blocker,
and the no-MSAA experiment remains a hypothesis test rather than approval.

## R8 follow-up: main #179 Manual Both and UI compatibility

- Current upstream main at reconciliation:
  `d0161e0c6c4234a55e3ef807795f62403c6ad943` (#179).
- V3 merged this exact upstream commit through two-parent merge
  `b2fe274957ed9020f00b6e4e4ec5cdb2440601ba`; V4 then inherited
  V3 in merge `117deea6189be503d07c2f9a6588b33e5cd212a8`.
  GitHub ancestry checks showed main → V3 → V4 with zero commits behind.
  No force push or main mutation was performed.
- Reconciled exactly 11 #179 paths. `docs/README.md` retains the
  R8 diagnostic links and adds the Manual Both integration handoff.
  `scripts/v2/check-m4-projects.mjs` takes the main #179 download
  event + `noWaitAfter` behavior, retaining real project export and
  round-trip scientific comparisons.
- The production Process UI's Both target, independent paired layer
  IDs, paired Extend/Etch targeting, fail-closed unsupported operations,
  Recipe restoration and browser regression were inherited from main.
  This does not alter the renderer's material ownership algorithms.
- V4 integration workflow `.github/workflows/renderer-v4-pr177-compat.yml`
  now validates the real Manual Both end-to-end scenario alongside
  3D/Legacy and renderer screenshot checks on its temporary merge tree.
  Failure artifacts include `test-results/ui-v2-manual-both/`.
  The workflow remains in its historic filename but is labeled
  current-main compatibility.
- The latest V3 Quality/Browser/UI suites and the expanded V4 compatibility
  run were **in progress** when this handoff section was authored; look up
  GitHub Actions by the exact SHAs before treating them as accepted.
  Hardware strict framebuffer/screenshot parity remains independently
  blocked by prior fresh-context evidence. No GPU benchmark, production
  optimization activation or approved visual-baseline change is claimed.

