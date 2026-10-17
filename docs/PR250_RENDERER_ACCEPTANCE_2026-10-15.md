# PR 250 renderer acceptance evidence — 2026-10-15

This is a local engineering acceptance record, not merge authorization. Human
visual acceptance, required remote CI results, and explicit user Merge approval
remain separate gates.

## 2026-10-17 targeted ROI rough-cut follow-up

**Exact tested production HEAD:** `422ba1e760e1cd9d9dfd7426c7754c19715a8479`.
This addendum supersedes earlier *status* estimates below, while preserving
their dated, source-specific evidence. [Exact-HEAD Browser regression](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38947599596),
[Quality](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38947599452),
Renderer Isolation, M3D, documentation and Visual-first checks **passed**.
The Draft PR remains unmerged. Draft-skipped runs are not counted as passes.

**Actual problem:** Photodetector Black-Si / 50 nm Al₂O₃ ROI cut at
`y=-150 µm`. Before correction, independent material-cap Float32 boundary
interpolation yielded apparent local thickness **1.50–97.93 nm** along the
observed front cut (258 common XY samples), producing blue-gray Si triangles
between the gold ALD cap and pink Implant cut in an opaque close-up.
The real Implant cut had already matched the exposed ALD cap, so changing its
depth bias or preferring a nominal buried Si layer did not fix the image.

**Product correction:** the ROI-only material sidewall now uses a single
actual rendered conformal cap boundary, translated by the *existing physical*
Z separation where a continuous layer stack, same seeded roughness, equal
surface normal and overlapping cut segment all agree. The exact Photodetector
fixture reports **one matched pair**. The corrected cut-sidewall spacing
deviates by at most **3.0517578e-6 µm (0.0031 nm)** across 130 common samples,
within the unchanged **2e-5 µm** scientific acceptance limit. This proves
the *display-sidewall* result in this fixture, not complete manifold equality
of every independently triangulated buried-cap interior.

**Real Chromium visual evidence:** the fixed-camera 85-unit close-up changes
8,306 pixels by over 12 RGB levels; the previously identified blue-gray wedge
fill drops from 2,459 detected pixels to zero, while legitimate border strokes
remain. Matched opaque and transparent, Border ON/OFF and 260-unit captures
show no new broad misregistration. The 12 × 12 µm micro-ROI, camera distance
14 units, was additionally checked in opaque/Border ON and transparent mode;
its visibly jagged front cut tracks the rough top edge. A straighter right
silhouette may be an actual **sample exterior**, because this micro-ROI spans
`x=2489–2501 µm`, crossing the fixture's approximately `x=2500 µm`
outer material boundary. That classification is not yet a separate
full-perimeter topology proof.
[Exact-HEAD 29-scene browser artifact](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38947599596/artifacts/12065973937):
**29 captures, 0 page errors, 10 deterministic .wafercad roundtrips**.
Production materials/Recipe and exported project data were not altered.

**Executed contracts:** the same browser run includes 18 rough-boundary and
outline Node tests, the two Photodetector conformal 50 nm geometry tests,
and the targeted no-Worker rough fallback probe, all successful. The latter
does **not** supersede the older failed full 40-case no-Worker matrix.
SwiftShader's unselected GPU-height oracle remains outside its `2e-5 µm`
limit, so production software displacement remains CPU parity rather than a
claim of software GLSL correctness. Full hardware evidence for **RTX 3060**,
cold-refinement latency acceptance, independently triangulated cap interiors
and the complete release Quality gate remain separate work.

**Integration:** Main has advanced since this PR branch was created; the
overlapping files are `docs/README.md` and
`site/tests/documentation.test.mjs`. When syncing, preserve Main's #310
documentation/archive relocation and compatibility-forwarding semantics.
Never replace the newer 82-item inventory with this branch's historical
79-item assertion. No merge into Main without the owner's express approval.

## Reproduction and environment

- Repository: `Xiaolong-6/WaferCAD`; branch:
  `fix/3d-rough-seams-transparent-outlines-20261015`.
- Before source: exact `f76c8e02a2e9944dcea72ea1db3410727bb9a67d`, frozen
  using `git archive` before implementation edits.
- Final source snapshot: `20b387a7` (runtime implementation through `09f83eda`);
  final hardware fixed-revision captures passed. Per-module SHA-256 values
  in each report establish source identity independently of later documentation
  commits.
- Windows, Node `26.7.0`, pinned Playwright `1.55.1`, Chromium
  `140.0.7339.186`, Three `0.179.1`; viewport `1100 × 800`, DPR `1`.
- Default headless Chromium uses SwiftShader. Full headless Chromium with
  `--use-angle=d3d11 --ignore-gpu-blocklist --force_high_performance_gpu` uses
  **Intel Iris Xe, Direct3D 11**, as reported by
  `WEBGL_debug_renderer_info`. No RTX 3060 result is claimed.
- Browser execution required a local sandbox exception: restricted Chromium
  navigation returned `ERR_NETWORK_ACCESS_DENIED` for localhost. These
  environmental attempts are not renderer product failures.

## Reproducible fixtures and checks

`scripts/pr250-audit-fixtures.mjs` creates deterministic current-schema projects
with feature size `0.7 µm`, mean height `0.35 µm`, etch depth `0.9 µm`, feature
CV `0.25`, height CV `0.3`, seed `20261015`, and ideal stored geometry. Base
dimensions are `20 × 14 × 4 µm`; coat thickness is `0.6 µm`. The rectangular
inspection cut is `15 × 8 µm`, centered at `(0, -2)`. Section A–B is
`(-9, 0)` to `(9, 0)`. Every report includes exact physical clip polygons and
camera position/target/FOV; projects are exported beside screenshots as
`.wafercad` files.

Default coverage is eight exposed/buried-ROI fixtures across rectangular/ring
footprints and stochastic/pyramid morphology, with five fixed states per
fixture: opaque Border off, opaque Border on, opacity `0.5`, opacity `0.15`
from the opposite azimuth, and Quality with `0.7×` camera distance.

Extended coverage adds smooth, polygon and sector footprints, plus Back/Both
Process faces. The Back/Both fixtures additionally capture an underside view.
The full extended matrix contains 28 fixtures and 144 captures.

The runner asserts unchanged canonical material-model JSON after each view;
real Worker or explicitly selected main-thread fallback; completed detailed
rough geometry; production project export/readback with identical morphology
samples; and ten opacity/Border toggles per fixture without changing scene
generation, surface-plan builds, retained geometry or material counts.

## Numerical and depth-buffer evidence already verified

The GPU height oracle executes production GLSL obtained through
`decorateGpuRoughMaterial`, reads a floating-point framebuffer, and compares
against CPU `roughProfileOffsetAtPoint` at the same coordinates. It covers
1,024 points for each morphology/polarity combination with nonzero sample
origin; the explicit tolerance is `2e-5 µm`.

| Morphology | Polarity | Maximum absolute error, µm | RMS error, µm |
| ---------- | -------- | -------------------------: | ------------: |
| Stochastic | Normal   |               9.2711624e-6 |  4.3726941e-7 |
| Stochastic | Inverted |               9.2473205e-6 |  4.3370394e-7 |
| Pyramid    | Normal   |               1.2207551e-6 |  1.1189478e-7 |
| Pyramid    | Inverted |               1.2296958e-6 |  1.1171973e-7 |

These are actual Intel D3D11 shader measurements, not a JavaScript shader port.
They establish agreement for the recorded parameters and sample domain;
they do not prove bitwise CPU/GPU equality for every coordinate or feature size.

The actual WebGL hidden-line oracle renders two contours on opposite sides of
a transparent structural surface with a real hole. The visible line has 288
solid-green pixels and zero hidden-red pixels. The occluded line has 120 red
dashed pixels and 96 green pixels, including 60 pixels exposed through the
hole. Reversing the camera swaps those classifications exactly. Production
`renderDepthAwareOutlines` supplies the depth pass; no mocked depth buffer is
used. Both directions passed.

All 28 extended project exports/readbacks validate. After identifying a test
fixture's obsolete version-4 migration convention, fixtures were correctly
marked as current schema version 14; all sampled morphology heights now
round-trip with exactly zero difference.

## Captures, performance and remaining acceptance

Artifacts are local and ignored under `output/playwright/pr250-audit/`. The
frozen before set `baseline-final/` has 40 completed hardware captures,
steady-state samples and resource-toggle checks. An interim integrated run
captured 140 states without browser/shader errors, but its source-integrity
guard correctly rejected a concurrent `rough-mesh-geometry.js` edit. It must
not be described as a final fixed-revision pass.

Visual inspection confirmed that the temporary dotted internal seams in opaque
Border-off rendering disappeared after separating cap lighting participation
from pinned boundary displacement. ROI material cut boundaries are visibly
clearer, and hidden-line classification is now based on structural depth.
Transparent stochastic surfaces still show broad triangular light/dark facets;
these require review against the underlying tessellation and do not justify
claiming every visual defect has been eliminated.

The harness records five repeated steady frames per view: renderer submission
time, two-animation-frame wall time, draw calls and submitted triangles, plus
retained resources and heap diagnostics. Submission time is CPU submission
cost, not a GPU timer query. Shader compilation/first-frame assembly and
concurrent suites can distort `readyMs`; performance acceptance must use the
steady samples and the separate large-array benchmark.

Final frozen-source hardware execution completed with exit code 0: **144
captures, 28 successful project round trips, 280 stable presentation toggles,
720 steady-frame samples, zero browser/shader errors**, both pixel/numerical
oracles passed, and start/end source hashes matched. Artifacts are in
`output/playwright/pr250-audit/final-hardware/`.

The comparator successfully matched 40 before/after material models, cameras
and graphics backends. The gallery is
`output/playwright/pr250-audit/comparison/index.html`; measurements are in
the adjacent `comparison.json`.

| Quality view            | Median submission before/after, ms | Median two-RAF wall before/after, ms | Submitted triangles before/after |
| ----------------------- | ---------------------------------: | -----------------------------------: | -------------------------------: |
| Rect stochastic exposed |                          1.5 / 0.7 |                          33.0 / 33.4 |                 67,166 / 101,688 |
| Rect stochastic ROI     |                          1.5 / 1.4 |                          33.2 / 33.3 |                  84,126 / 95,312 |
| Ring stochastic ROI     |                          0.6 / 2.1 |                          33.3 / 33.3 |                226,865 / 275,982 |
| Ring pyramid ROI        |                          0.6 / 1.8 |                          33.1 / 33.1 |                226,865 / 274,992 |

The extra structural depth pass increases draw submissions. Steady frame
cadence stayed comparable in these small fixtures, but cold Quality refinement
is a remaining latency risk: ring pyramid ROI measured `1,749 → 4,837 ms`.
These local measurements alone do not approve large-array performance.

**Software numerical acceptance failed.** SwiftShader executes the same
production GLSL with maximum stochastic error `6.7076351e-4 µm` (RMS
`1.1348247e-4 µm`) and maximum pyramid error `6.4686143e-5 µm`. These exceed
the explicit `2e-5 µm` oracle tolerance. The depth pixel oracle still passed.
The failure and all four measured morphology/polarity results are preserved in
`output/playwright/pr250-audit/final-software/report.json`. The threshold was
not relaxed. Universal CPU/GPU numerical agreement and a green software CI
oracle must not be claimed.

A separate software visual matrix, without the already-failed numerical
oracle, completed with exit code 0: 40 captures, eight project round trips,
80 stable presentation toggles and zero browser/shader errors. Its source
hashes matched; artifacts are in
`output/playwright/pr250-audit/final-software-captures/`. This visual pass does
not override the software numerical failure.

The main-thread fallback matrix with `WAFERCAD_AUDIT_NO_WORKER=1` failed:
the first fixture timed out after 120 seconds. A bounded 15-second diagnostic
reproduced the state and saved `fallback-diagnostic/report.json` and
`fallback-diagnostic/failed-ready.png` under the audit artifact directory.
The canvas already reports `roughMeshMode=detailed`, `roughMeshWorker=false`
and 8,204 rough triangles, while the host remains `renderState=refining`,
`renderPhase=rough-preview`, with stats `rebuilding 3D…`. There were zero
browser errors. This demonstrates a readiness-state failure after synchronous
geometry completed; fallback acceptance remains failed. No test processes
from this workline remain running.

Human visual approval, the remaining transparent facets, software numerical
agreement, fallback completion, cold-refinement latency review and RTX 3060
hardware acceptance remain open. The evidence supports reviewing the revised
captures; it does not support merge authorization.

## Commands

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $env:LOCALAPPDATA 'ms-playwright'
$env:WAFERCAD_CHROMIUM = Join-Path $env:PLAYWRIGHT_BROWSERS_PATH 'chromium-1193/chrome-win/chrome.exe'
$env:WAFERCAD_AUDIT_ANGLE = 'd3d11'
$env:WAFERCAD_AUDIT_EXTENDED = '1'
$env:WAFERCAD_AUDIT_ORACLE = '1'
$env:WAFERCAD_AUDIT_OUTPUT = 'output/playwright/pr250-audit/final-hardware'
node scripts/pr250-renderer-audit.mjs
```

Set `WAFERCAD_AUDIT_SITE` to an archived `site/` for exact-revision evidence.
Unset the executable/ANGLE variables for pinned default software Chromium.
Set `WAFERCAD_AUDIT_NO_WORKER=1` to exercise main-thread topology fallback.

```powershell
node scripts/pr250-audit-compare.mjs output/playwright/pr250-audit/baseline-final output/playwright/pr250-audit/final-hardware output/playwright/pr250-audit/comparison
```

The comparator asserts identical material-model JSON, graphics backend and
camera, then generates a side-by-side HTML gallery and machine-readable
performance report. It does not approve or overwrite visual baselines.
