# PR #166 continued acceptance — 2026-10-10

## Decision and revision

**Partial acceptance; hardware performance remains unverified. Keep Draft,
default-off and unmerged. No approved visual baseline was changed.**

Repository: Xiaolong-6/WaferCAD. Branch:
`perf/transparent-renderer-v3-20261009`. Reviewed starting HEAD:
`492d671e42f8d4833a40cc186659119036251e24`; base:
`d73a201158e1d7f5c8efae4ea89a8cf2e2411c46`.
This report and benchmark-only repairs are committed together on that branch.

Publication: automatic approval review initially rejected the remote push.
The user explicitly approved pushing on 2026-10-10, authorizing publication
of the repairs and this report on the existing PR branch. Remote CI for the
repairs must be assessed separately from the reviewed starting HEAD.

## Current CI, inspected directly

- [Quality at reviewed HEAD](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38036601459): success.
- [Browser at reviewed HEAD](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38036601473): success. Job steps confirm UI smoke, resilience and renderer product regression ran successfully.
- Current 625-site array, edge-on and Process jobs were **skipped**. Native Fig3 and Example Recipe Reconstruction workflows were also skipped. These are not new acceptance passes.
- [Historical full browser run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38028202813): 625-site resource/toggle and Electrical A/B job `114143477569`, and edge-on restoration job passed. Its tested PR product revision was `9d19acb`; artifacts are named for GitHub's synthetic merge revision `40287688cf0d85da82858ee773d4595b36d00f17`.
- `git diff 9d19acb HEAD -- site/three-view.js site/transparent-pass-policy.js` is empty at the reviewed HEAD. Historical renderer behavior is relevant, but does not establish a fresh runtime pass for the updated harness.

## Historical A/B evidence independently rechecked this session

Downloaded [Electrical A/B artifact 11660599788](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38028202813/artifacts/11660599788), inspected its report and screenshot, and decoded all four PNGs with the branch's pixel comparator. Fixture: `three-tier-silicon-jlfets-full-wafer.wafercad`, 625 sites, Quality, full wafer, opacity 0.5, exact presentation tier, viewport 1440×960, Chromium 140.0.7339.186. Fresh contexts; ordering single/double/double/single.

| Trial | Electrical planar policy | Submitted triangles | Draw Calls | Complete-image ms | JS render frame ms | Assembly ms |
| ----- | ------------------------ | ------------------: | ---------: | ----------------: | -----------------: | ----------: |
| 1     | ON / single              |          54,066,262 |      1,291 |        23,393.373 |              124.9 |       255.5 |
| 2     | OFF / double             |          57,040,012 |      1,408 |        24,590.456 |              100.0 |       265.3 |
| 3     | OFF / double             |          57,040,012 |      1,408 |        24,462.064 |              107.9 |       305.8 |
| 4     | ON / single              |          54,066,262 |      1,291 |        23,329.017 |               99.6 |       283.6 |

Median complete-image time: ON **23,361.195 ms**, OFF **24,526.260 ms**;
ratio 0.952497 (4.7503% exploratory reduction). Submissions decrease by
2,973,750 triangles (5.2134%) and 117 calls (8.3097%). Counts in this older
Electrical report come from Three renderer diagnostics; this mode did not
independently intercept the native GL calls. Do not describe them as hardware
invocation counters.

All screenshots are **531×275**, 146,025 pixels, 20,819 PNG bytes.
Comparisons 1→2, 1→3 and 1→4: byte equality true, changed pixels **0**, maximum
RGBA channel difference **0/255**. All four SHA256 values:
`f483a2eb0bf8a0b4687b10daa2b7794343f710a1e61989db42dbd85b653aaa4a`.
Screenshot inspection confirms the wafer and the open appearance menu; this
is the existing same-pose canvas test, not an unobstructed multiscale visual
review or a comparison against the approved Windows baselines.

The project records this runner as software WebGL. Crucially, the downloaded
Electrical report and its job logs contain **no unmasked adapter identity or
GPU timer result**. Independently verified physical GPU type for that A/B is
therefore **unverified**, and these timings must stay in the software/CI
evidence category. No hardware acceleration claim is supported. JS frame
time is not GPU completion time. Complete-image timing includes assembly,
driver/raster and compositor/screenshot costs; it is not pure GPU time.

## Local execution and environment

Linux 6.18.44, Node v24.19.0; `npm ci` installs Playwright 1.55.1 and Three
0.179.1. Chromium 140.0.7339.186 downloaded successfully after its first
mirror returned an invalid ZIP. No `/dev/dri` device directory is exposed.

Both commands were attempted with the downloaded browser and pinned local Three:

```bash
python -m http.server 4173 --directory site
WAFERCAD_CHROMIUM=/root/.cache/ms-playwright/chromium-1193/chrome-linux/chrome WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/webgl-frame-probe-smoke.mjs
WAFERCAD_CHROMIUM=/root/.cache/ms-playwright/chromium-1193/chrome-linux/chrome WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/renderer-quality-index-ab.mjs --electrical-planar-ab
```

Both browser commands exited 1 **before opening the application**:
`FATAL:chrome/browser/process_singleton_posix.cc:292 ... socket() failed: Operation not permitted (1)`.
Browser launch is blocked by the managed environment's socket restrictions.
No new local canvas, GL census, adapter string or 625-site timing was produced.
No hardware GPU was verified. Launching a headed hardware trial here would
not establish access to the user's Windows GPU. No manual heavy CI job was dispatched.

## Defects repaired on the current branch

1. Ordinary `--electrical-planar-ab` lacked GPU identity and native GL census.
   It now installs the same frame probe as hardware mode, verifies native calls,
   triangles, frame serial, owner attribution and GL errors, and records the
   unmasked adapter classification and explicit completion barrier. Software
   measurements remain allowed but cannot be labeled hardware-confirmed.
2. The ON gate accepted a broad 50–57 million triangle range and any count
   below 1,408 calls. It now requires the accepted exact **54,066,262 / 1,291**,
   so accidental volume removal or extra redundant passes fail acceptance.
3. The script had Prettier errors; its formatting is corrected.

The ordinary Electrical benchmark now uses `gl.finish()` in both arms.
This measurement protocol change perturbs scheduling, so do not directly
compare its future timing numbers with the historical uninstrumented A/B.
No product renderer, scientific model, worker, IO/schema, fixture, workflow or
approved visual reference was edited. Experimental switches remain default OFF.
Hardware mode still rejects missing, generic, unknown and known software
adapters. A recognized unmasked adapter is supporting identity evidence;
it does not prove measured GPU duration. Disjoint/unsupported timers retain
`gpuMs: null`.

## Checks actually completed

- `npm ci`: exit 0.
- `npm run check:ci`: exit 0; ESLint and documentation passed; **615/615 Node tests** passed, zero skipped/failed.
- `node --test site/tests/webgl-frame-probe.test.mjs site/tests/webgl-backend-classification.test.mjs site/tests/png-pixel-diff.test.mjs site/tests/transparent-pass-policy.test.mjs`: exit 0, **15/15** focused tests.
- `npm run lint` and `npm run docs:check` after harness repair: exit 0.
- `npx prettier --check scripts/renderer-quality-index-ab.mjs`: exit 0 after repair.
- `git diff --check`: exit 0.
- `node scripts/renderer-png-diff.mjs` for the three historical PNG pairs: all exit 0 with exact pixel and byte parity.
- Local probe smoke and 625-site Electrical A/B: blocked at browser launch, exit 1; **not passed**.

## Remaining acceptance and reproduction

Run the revised Electrical A/B in a browser-capable environment, then on the
actual Windows GPU with `node scripts/renderer-quality-index-ab.mjs --hardware-electrical-ab`.
Set `WAFERCAD_THREE_DIR` to the pinned local Three package. Retain all trial PNGs,
report/failure JSON, browser version, adapter string and valid/non-disjoint GPU
timer status. Repeat entire ABBA rounds before interpreting performance; keep
software and hardware results separate. Near/edge-on/ROI/opacity and resource
lifecycle gates remain necessary before any default rollout. Historical full
gates do not replace this new instrumentation's runtime validation.

Acceptance status: historical exact-pixel parity and submission reductions
confirmed; current code/static checks pass; revised runtime census pending due
to environment; real GPU identity/timing and repeatable performance **open**.

## Windows checkout review of published head — 2026-10-10

Pulled `perf/transparent-renderer-v3-20261009` with `git pull --ff-only`
at product/tooling commit `3b7e6af9d608ea8814217f385cf251be0f4ffb06`.
The previous checkout was clean. This local follow-up contains formatting-only
repairs in four files plus this handoff; it is uncommitted and unpushed.
No product defaults or approved baselines changed.

Current-head PR #166 is open, Draft and mergeable. Its
[Quality run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38041300303)
and [targeted Browser run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38041300298)
passed. The 625-site, edge-on, Process, Native Fig3 and Recipe jobs were skipped;
these are still not fresh full acceptance evidence.

Local environment: Windows x64, Node v24.16.0, npm 11.17.0,
Playwright 1.55.1, Chromium 140.0.7339.186, Three 0.179.1.
The unmasked adapter was `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device
(Subzero) (0x0000C0DE)), SwiftShader driver)`: **software rendering**, with
unsupported GPU timers and `gpuMs: null`. Browser execution used the installed
Chromium outside the sandbox's isolated browser-cache path.

Checks actually executed:

- `npm ci`: exit 0, 82 audited packages, zero vulnerabilities. The first
  sandbox attempt was interrupted while stalled; the network-enabled retry passed.
- `npm run check`: exit 1 at formatting after lint passed. Four existing
  failures were repaired with `npx prettier --write` on
  `site/tests/png-pixel-diff.test.mjs`,
  `site/tests/webgl-backend-classification.test.mjs`,
  `scripts/test-helpers/png-pixel-diff.mjs`, and
  `docs/TRANSPARENCY_RENDERER_V3_PLAN_2026-10-09.md`.
- `npm run check:ci`: exit 0; lint, documentation and **615/615 Node tests**
  passed, zero failed/skipped.
- `npm run format:check`: exit 0 after the repairs.
- With `$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'`,
  `node scripts/webgl-frame-probe-smoke.mjs`: exit 0; normal/discard/restored
  normal each submitted 2,500 triangles / 2 calls, zero GL errors and exact
  restored-image parity. The initial sandbox launch failed because its isolated
  cache had no browser; the installed-browser retry passed.
- Serve using `python -m http.server 4173 --bind 127.0.0.1 --directory site`,
  then the same Three environment and
  `node scripts/renderer-quality-index-ab.mjs --electrical-planar-ab`: exit 0,
  all four native GL census and exact canvas-parity gates passed. Server stopped
  after completion.

| Trial | Planar policy | Native GL triangles | Native GL calls | Complete-image ms |
| ----- | ------------- | ------------------: | --------------: | ----------------: |
| 1     | ON            |          54,066,262 |           1,291 |        19,728.019 |
| 2     | OFF           |          57,040,012 |           1,408 |        19,590.804 |
| 3     | OFF           |          57,040,012 |           1,408 |        19,042.574 |
| 4     | ON            |          54,066,262 |           1,291 |        18,141.864 |

All four screenshots were byte-identical; native GL counts matched renderer
counters, with zero GL/page errors. Median ON/OFF: **18,934.941 / 19,316.689 ms**,
ratio **0.980237**. This single software ABBA round ran alongside the Node gate;
it validates the revised instrumentation and same-pose parity, not a repeatable
hardware speedup. Do not compare these instrumented timings directly with the
earlier uninstrumented CI protocol.

Ignored supporting artifacts: `test-results/renderer-electrical-planar-ab/`
contains the report and four trial images; `test-results/renderer-v3-pull-*.log`
contains local gate/benchmark output. The reproducible evidence summary is here.

Next work, in order:

1. Repeat `--hardware-electrical-ab` on a verified Windows GPU and retain
   adapter/browser/driver identity and valid timer status; repeat whole ABBA
   rounds before judging performance. This review did not run hardware mode.
2. Exercise the opt-in candidate across near/edge-on/ROI/Section collapse,
   opacity and resource-lifecycle cases. Same-pose parity alone is insufficient
   for changing the default or merging PR #166.
3. Keep rejected internal-volume trials removed. Isolate owner/order/pixel
   differences before attempting another volume optimization.
4. V4 R1 already exists on `perf/renderer-v4-adaptive-tiles-20261010`, stacked
   on this exact V3 head. Review its default-off diagnostic independently and
   obtain inertness/overhead/runtime evidence before implementing tile meshes.

The revised software census is now runtime-verified. Hardware performance,
multiscale scientific acceptance and default promotion remain **open**.

## Real Windows GPU follow-up — 2026-10-10

The hardware gate was executed on the same product commit, with local
formatting/documentation repairs and the manual inspection harness described
in `docs/testing.md`. Experimental product switches remain default OFF.

Adapter: `ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11
vs_5_0 ps_5_0, D3D11)`. Windows reports NVIDIA driver `32.0.16.1060`, dated
2026-06-09. Node v24.16.0, Playwright 1.55.1, Chromium 140.0.7339.186,
Three 0.179.1. Recognized hardware identity was confirmed by the fail-closed
adapter gate. The first ON frames had valid, non-disjoint GPU timers:
263.695360 ms and 233.157632 ms in the two independent runs. Unsupported or
invalid queries still retain `gpuMs: null`.

Reproduce using a fresh local server and pinned Three:

```powershell
python -u -m http.server 4174 --bind 127.0.0.1 --directory site
$env:WAFERCAD_URL = 'http://127.0.0.1:4174'
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
node scripts/renderer-electrical-fresh-context-ab.mjs --hardware-rtx3060
node scripts/renderer-quality-index-ab.mjs --hardware-electrical-ab
```

The first command is the production-path P0 gate: it launches headed Chromium,
fails closed unless every context identifies an NVIDIA GeForce RTX 3060, and
captures fresh OFF/OFF/ON/ON contexts at zero pixel tolerance. It records full
raw GL framebuffer hashes alongside PNG pixel diffs, camera matrices, draw
order, material descriptors and canvas/backing-store dimensions. The report's
`differenceStage` distinguishes a raw framebuffer mismatch from a screenshot-
only mismatch; the accompanying state hashes identify application-input drift.
Per-context traces and PNGs are written before strict parity checks to
`test-results/renderer-hardware-fresh-context-ab/`, including on failed runs.
Run this gate before the ABBA performance command; a parity failure keeps the
optimization default-off and blocks further performance acceptance.

Two independent hardware runs both **failed strict ON/OFF canvas parity** at
trial 2. Both localized the same two changed pixels in the 531 × 275 image:
`(287,189)` had RGB delta `[1,1,1]`, and `(287,190)` had `[3,2,1]`.
Alpha was unchanged. Changed fraction: 2 / 146,025 (0.00137%); maximum
channel difference: **3/255**. The single-pass ON frame submitted exactly
54,066,262 triangles / 1,291 calls, and the OFF frame retained exactly
57,040,012 / 1,408. Native GL attribution and renderer counters agreed,
with zero GL/page errors before the parity assertion failed.

The first ON completed-image checkpoint was 640.059 ms in the first valid
hardware attempt. It is **not a paired performance result**: the parity gate
stopped each round before complete ABBA reporting. No hardware speedup or
scientific/default acceptance is claimed. The reproducible small mismatch
supersedes software-only same-pose parity as evidence for hardware rollout.
Do not relax the assertion or replace approved references to obtain a pass.

An earlier attempt stopped at boot because the port-4173 local test server
failed to deliver the workstation stylesheet; it produced no GPU evidence.
A fresh server with captured output on port 4174 resolved that setup issue.
Hardware artifacts and pixel diagnostics are under ignored
`test-results/renderer-hardware-electrical-ab/`; separate run logs are
`test-results/renderer-v3-hardware-acceptance-retry.log` and
`test-results/renderer-v3-hardware-acceptance-repeat.log`.

**Decision: hardware scientific parity FAIL; keep Draft, default-off and
unmerged.** Same-policy controls, multiscale inspection and ownership/pass-order
localization are required before another promotion attempt.

## Production-path RTX 3060 fresh-context P0 — 2026-10-11

The normal page-boot OFF/OFF/ON/ON gate was added to the Windows hardware
acceptance sequence and run in headed Chromium. Source checkout HEAD was
`113c16992612f3f0ee4fe65acd066ed4b783dd22`; the acceptance harness and this
handoff had local documentation/diagnostic edits during the run. Environment:
Windows x64, Node `v24.16.0`, Playwright `1.55.1`, Chromium `140.0.7339.186`,
Three `0.179.1`, server `http://127.0.0.1:4174`. All four contexts were
fail-closed verified as
`ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)`.

Command:

```powershell
$env:WAFERCAD_URL = 'http://127.0.0.1:4174'
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
node scripts/renderer-electrical-fresh-context-ab.mjs --hardware-rtx3060
```

The exact-pixel gate **failed**. Both same-policy pairs had identical camera
matrices, draw-order hashes, material descriptors, CSS/canvas/GL dimensions,
model/process revisions and native submission counts, but different full
framebuffer hashes and PNG pixels:

| Comparison                     | PNG pixels different | Max channel delta | Raw GL framebuffer | Difference stage  |
| ------------------------------ | -------------------: | ----------------: | ------------------ | ----------------- |
| OFF context 1 vs OFF context 2 |        107 / 146,025 |                 3 | different          | WebGL framebuffer |
| ON context 3 vs ON context 4   |         36 / 146,025 |                 3 | different          | WebGL framebuffer |
| OFF context 1 vs ON context 3  |         66 / 146,025 |                 3 | different          | WebGL framebuffer |

The first mismatch therefore exists before browser screenshot capture; this is
not a PNG-only compositor difference. The measured camera/order/material/layout
inputs match within each policy, so the remaining failure points to cross-context
WebGL rendering variability among the recorded inputs. Sparse raw-pixel probes
matched even while complete framebuffer hashes differed, confirming that those
samples are not a substitute for the full readback. OFF submitted 1,408 calls /
57,040,012 triangles and ON submitted 1,291 / 54,066,262. These counts do not
change the failed parity decision and no performance claim is made.

The gate wrote four PNGs, four per-context traces and `report.json` under ignored
`test-results/renderer-hardware-fresh-context-ab/`. The strict threshold remains
zero. Keep PR #166 Draft and the candidate default-off; do not proceed to the
hardware performance promotion gate until repeatable fresh-context parity is
resolved. This run narrows the failure to the GL framebuffer stage but does not
yet isolate which unobserved context/render input creates the variation.

## Updated draw-input fingerprint P0 — 2026-10-11

After commits `29dab6f1` and `53e5a104` added bounded native draw-input capture
and fail-closed evidence checks, the RTX 3060 P0 was rerun at PR branch HEAD
`53e5a104c83e78db767ca1548d5e9f5332eef9c8`. Environment remained Windows x64,
Node `v24.16.0`, Playwright `1.55.1`, Chromium `140.0.7339.186`, Three
`0.179.1`, with the recognized RTX 3060 adapter. Every context supplied the
required 48 draw samples with non-empty shader sources; the evidence gate itself
passed.

Strict OFF/OFF/ON/ON parity still **failed**:

| Comparison                     | PNG pixels different | Max channel delta | Full GL framebuffer | Sampled draw inputs       |
| ------------------------------ | -------------------: | ----------------: | ------------------- | ------------------------- |
| OFF context 1 vs OFF context 2 |         82 / 146,025 |                 1 | different           | identical                 |
| ON context 3 vs ON context 4   |        194 / 146,025 |                 3 | different           | identical                 |
| OFF context 1 vs ON context 3  |        188 / 146,025 |                 2 | different           | different policy sequence |

Within each policy, the full sampled draw-input fingerprint matched exactly.
The four contexts also exposed the same 12 shader-source hashes and the same
three sampled GL-state combinations (blend, cull, depth, blend equation and
viewport); camera, presentation order and layout matched. The complete GL
framebuffer hashes still differed in every comparison, so the mismatch occurs
before browser screenshot capture. The new evidence does not implicate shader
source or the sampled GL state as the source of same-policy variability.

This result warrants a focused GPU-buffer comparison next. Current draw
fingerprints record draw parameters and whether an element buffer is bound, but
do not capture vertex-attribute buffer contents or hashes. Compare bounded
referenced buffer data for the same-policy sampled draws before changing any
renderer code. Do not relax zero-pixel tolerance. The final run's four PNGs,
per-context traces and report are under ignored
`test-results/renderer-hardware-fresh-context-ab/`; `report.json` records the
draw-input fingerprints and stage classification.

### Inspection controls and scope limits

Added manual `scripts/renderer-electrical-inspection.mjs` under the renderer
test owner. It gathers OFF/OFF/ON/ON controls, unobstructed screenshots, exact
per-pixel differences, physical revision checks and 20 presentation transitions
per arm. No automatic CI job, product default or approved reference changed.

`node scripts/renderer-electrical-inspection.mjs`: **exit 1**. The first
default/OFF arm completed opacity 25%/50%/75%/100%, 20 presentation transitions,
near, edge-on, fitted and full-Z frames, then timed out at the ROI render after
180 seconds. A retry closed Main popovers explicitly and checked the actual
ROI creation status; the ROI was created, but 3D remained `renderState=building`,
frame serial 56, scene generation 6. No page errors. This is a default-renderer
ROI completion failure in the tested sequence, not proof of a candidate-specific
regression. Both attempts failed; ROI acceptance remains **open**. Preserve
the full failure under `test-results/renderer-electrical-inspection/`.

`node scripts/renderer-electrical-inspection.mjs --skip-roi`: **exit 1** at
strict comparison after all four arms completed. Its diagnostic subset is
explicitly incomplete (`roiCovered=false`, `fullAcceptance=false`), with separate
artifacts under `test-results/renderer-electrical-inspection-no-roi/`. The run
completed **80 presentation transitions** with stable retained object/geometry/
material/group counts, unchanged scene generation/surface-plan build count
within the transitions, and unchanged model/process revisions throughout each
arm. ON/OFF submissions matched the accepted counts; the Fast negative control
retained **16,906,262 triangles / 1,408 calls** in all arms.

Crucially, **same-policy controls also changed pixels**. In the initial subset,
the ON/ON saved-camera comparison differed at the exact same two pixels and
RGB deltas as the native hardware ABBA failure. One OFF/ON saved-camera comparison
was byte-identical. Opaque comparisons were identical, but other transparent
OFF/OFF and ON/ON views differed as well. These controls prevent attributing
every mismatch solely to the single-pass policy.

A repeated subset with test-only per-frame camera/order traces also exited 1.
Presentation object order hashes matched in all 40 comparisons. Most actual
camera matrices differed between fresh contexts despite matching pointer
instructions. Some fitted-camera comparisons had **identical camera matrices
and order hashes yet different pixels**, including a same-policy ON/ON pair
(145 pixels, maximum channel delta 5/255). Therefore camera drift is one
confounder, not an established complete explanation. Full scientific parity
requires exact matching-camera controls and repeatable completed frames;
the final harness fails on either pixel or camera mismatch. No tolerance was
introduced. Traces describe presentation object order, not every native GL
primitive or hardware invocation.

Local checks: `npm run check` passed (ESLint, full formatting, documentation,
**615/615 Node tests**, zero failed/skipped); the focused native-frame/backend/
PNG/pass-policy group passed **15/15**. Harness iterations passed focused ESLint
and Prettier. Final documentation/format and diff checks follow this report.
No new scientific runtime pass is claimed for ROI, no complete paired hardware
timing result exists, and no Process/Recipe heavy CI workflow was dispatched.

Next engineering work is **measurement repeatability and the default ROI
completion path**, before optimizing another annotation surface: explicitly
control actual camera matrices, localize differences with same-policy controls
and native per-owner/pass accounting, and reproduce the ROI stall in an isolated
fresh scenario. Hardware gate remains FAIL/unaccepted even though resource
lifecycle checks passed. V4 stays a separate stacked diagnostic experiment.

Publication history: the Windows follow-up was originally prepared locally,
then pushed as `7abcf51a1314f2d77f6d30ee4f2acb2fe4bec125` with the user's
approval. The product renderer at that acceptance commit remained
`3b7e6af9d608ea8814217f385cf251be0f4ffb06`. The later diagnostic
revisions below add an OFF-by-default tracing hook and browser-only tools;
no product optimization was enabled, no merge or deployment performed.
Final formatting, documentation and `git diff --check` passed. Local test servers
were stopped after acceptance runs.

## Post-push P0 diagnostics (2026-10-10; not yet Windows-runtime verified)

Historical tooling publication status; the following Windows execution section
supersedes the unrun-runtime status, without establishing either P0 as fixed.

After commit `7abcf51` was pushed, the same Draft branch received a
**manual-only diagnostic** follow-up. The accepted single-pass optimization,
default transparency policy, canonical geometry, History, workers and approved
visual baselines remain unchanged.

- `?rendererV3RoiTrace=1` records ROI renderer milestones to
  `#threeHost.dataset.rendererRoiStage` and `WAFERCAD_ROI_STAGE` console
  events, including entry/exit around the synchronous clipped surface-plan
  build, caps, sidewalls, annotations and presentation. The flag is OFF by
  default and does not alter any draw or mesh decision.
- `scripts/renderer-roi-profile.mjs` isolates a _default-policy_ 625-site
  Quality ROI rebuild. It records renderer stage events and a Chrome DevTools
  CPU profile (`roi.cpuprofile`) when available. A bounded wait and explicit
  reporting distinguish ROI creation, a stuck renderer build, an unresponsive
  browser and failed profile retrieval. No automatic expensive CI job is added.
- `scripts/renderer-electrical-inspection.mjs` now saves duplicate,
  no-interaction screenshots in the **same** browser context for far/restored,
  fitted and full-Z poses. Reports separate same-frame serial, actual camera,
  draw-order and pixel parity from fresh-context ON/OFF and OFF/OFF checks.
  ROI coverage is true only when **all four arms** captured ROI and ROI-cleared
  states. Pixel tolerance stays zero.

Run on the Windows GPU, from the existing repository checkout, with a local
server at `http://127.0.0.1:4174` and pinned Three:

```powershell
$env:WAFERCAD_URL = 'http://127.0.0.1:4174'
$env:WAFERCAD_THREE_DIR = Join-Path (Get-Location) 'node_modules/three'
node scripts/renderer-roi-profile.mjs
node scripts/renderer-roi-profile.mjs --after-transitions
node scripts/renderer-electrical-inspection.mjs --repeat-only
node scripts/renderer-electrical-inspection.mjs --skip-roi
```

The isolated ROI results write to
`test-results/renderer-roi-profile-fresh/` and
`test-results/renderer-roi-profile-after-transitions/`. The fast
`--repeat-only` subset captures OFF/OFF/ON/ON far and fitted frames, and
same-context duplicates, without 80 transition checks or ROI. Both
inspection subsets remain **diagnostic-only** and cannot pass full acceptance.
The CPU profile can be inspected using Chromium DevTools Performance or
the CPU profiling view. A stage left at `surface-plan-start` is evidence
of time spent in that phase, but the profile stack is needed to identify
the precise hot function before changing the geometry algorithm.

**No new Windows GPU runs or ROI speedup are claimed by this follow-up.**
Keep PR #166 Draft, candidate default-off and unmerged until both P0 issues
are experimentally resolved and the full scientific gates pass.

## Windows execution of the post-push diagnostics — 2026-10-10

Pulled cleanly to `32f83c1c98f8d4ac3a4c9481a85df8e6dadcf462`. The tests below
use that product revision plus a diagnostic-script setup repair: the ROI
profiler now opens the real Display menu and its narrow-panel More ancestor
before filling the hidden opacity input. The first fresh-profile attempt was
interrupted at that hidden-input setup, before CPU sampling or ROI measurement;
it is not a renderer timing failure. No product geometry, budgets, rendering
decisions, experimental default, baseline or workflow was changed in this follow-up.

Environment: Windows x64, Node v24.16.0, npm 11.17.0, Playwright 1.55.1,
Chromium 140.0.7339.186, Three 0.179.1. All measured contexts confirmed
`ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)`.
Run sequentially using the port-4174 server and pinned-Three environment above.

### Frame repetition result

`node scripts/renderer-electrical-inspection.mjs --repeat-only`: **exit 1** at
the final cross-context parity assertion; all four OFF/OFF/ON/ON contexts completed.
All **8/8 same-context duplicate screenshot pairs** were byte-identical, with
unchanged frame serial, camera matrices and presentation object-order hash.
They are repeated reads of the **same retained WebGL frame**, not independent
rerenders, so this does not establish deterministic rendering across new frames.

Cross-context saved-camera images were pixel-identical in all comparisons,
although most camera matrices differed slightly. Fitted-camera comparisons
had identical camera matrices and object-order hashes but changed pixels:
OFF/OFF **96**, ON/ON **62**, and OFF/ON **74 / 110** pixels. No tolerance was
accepted. Fresh-context render inputs, per-object transforms/buffers/materials,
native pass ordering and frame lifecycle still need isolation; neither mouse
drift alone nor screenshot-reading instability explains these results.
Reports and images: `test-results/renderer-electrical-inspection-repeat-only/`.

### ROI result: budget rejection, not a long surface-plan computation

Both `node scripts/renderer-roi-profile.mjs` and the same command with
`--after-transitions` exited **1** at the 60,000 ms diagnostic deadline.
Both started ROI creation from a ready, 1,885-instance exact Quality scene
(generation 3 fresh / 5 after transitions), and both saved usable CPU profiles.

The actual build exited very quickly between `surface-plan-start` and
`build-exited`, without reaching `surface-plan-complete`:

| Case              | First build total elapsed | Surface-plan-start to exit |            CPU samples / idle | Final state             |
| ----------------- | ------------------------: | -------------------------: | ----------------------------: | ----------------------- |
| Fresh             |                  9.900 ms |                   4.000 ms | 38,476 / 35,881 (93.26% idle) | building, generation 4  |
| After transitions |                  6.100 ms |                   2.300 ms | 38,608 / 33,853 (87.68% idle) | building, generation 21 |

The captured native page error in both cases was:
`The requested array area exceeds the bounded geometry point budget. Reduce the process or inspection area.`
The fresh case recorded one rejection; the post-transition wait recorded 16
rejections across repeated attempted rebuilds. These are failed builds, not
completed renderer frames or a measured ROI speedup. The CPU profiles show mostly
idle time and only a few self samples in the array resolution/charging path;
the full 60-second wait must not be attributed to geometry computation.
Fresh diagnostics retained model/process revisions **61/40**. In the
post-transition wait, the host model revision advanced **61 to 63** while Process
revision stayed **40**; its source was not isolated. That run cannot establish
unchanged canonical geometry from revision telemetry alone. A repeated controlled
scenario should compare actual exported geometry and account for extra UI/state
updates before claiming canonical invariance.

Code confirms `buildArrayRenderPlan` resolves an ROI-bounded model through
`resolveArrayModel` before ordinary surface ownership work. Its `charge()` guard
enforces the existing **3,000,000-point** expansion budget, counting material
regions and annotation patches. The guard stays unchanged. The renderer's async
`render()` exits through `finally` after the rejection, leaving `renderState=building`.
The synchronous `try/catch` in `app.js`'s `renderThree()` does not catch the rejected
Promise, consistent with the captured native page errors. This identifies the
failure/lifecycle path; it does not justify bypassing budgets or omitting surfaces.

Artifacts: `test-results/renderer-roi-profile-fresh/` and
`test-results/renderer-roi-profile-after-transitions/` contain each `report.json`
and `roi.cpuprofile`. Summarize samples by node ID against `profile.samples`;
sample fractions are not wall-clock or inclusive function duration estimates.
Logs are `test-results/renderer-v3-repeat-only.log`,
`renderer-v3-roi-fresh-retry.log` and `renderer-v3-roi-after.log`.

The next ROI repair should handle async render rejection explicitly, leave a
clear terminal error with the request to reduce inspection area, and verify
clearing/reducing ROI restores a completed scene without leaked resources or
canonical changes. Supporting larger ROI needs a separate bounded, array-aware
render plan; increasing the safety limit is not an accepted repair. For parity,
prioritize cross-context per-object/native-frame inputs rather than repeatedly
reading an unchanged canvas. **Neither P0 is fixed by these diagnostics.**

At pulled HEAD, [Quality](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38068171310)
and [targeted Chromium](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38068171429)
passed. Draft-heavy array/edge-on/Process/Native Fig3/Recipe gates were skipped;
they are not new acceptance passes. This follow-up is local; no push, merge,
deployment or manual CI dispatch is implied by the diagnostic runs.

Local validation: `npm ci` exit 0 (82 audited packages, zero vulnerabilities);
`npm run check` exit 0 (ESLint, formatting, documentation and **615/615 Node
tests**, zero failed/skipped). The profiler setup repair passed focused ESLint
and its two runtime attempts reached real ROI profiling; the renderer failures
above remain failures. Final documentation/format/diff checks passed. The local
diagnostic server was stopped. The setup repair and reproducible evidence are
saved together in a local commit, resolvable with
`git log -1 --format=%H -- scripts/renderer-roi-profile.mjs`.
