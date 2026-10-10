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
node scripts/renderer-quality-index-ab.mjs --hardware-electrical-ab
```

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

Publication status: this follow-up and its inspection harness are saved in a
local commit on the V3 branch; no push, PR readiness change, merge or deployment
was performed. Resolve the tooling revision with
`git log -1 --format=%H -- scripts/renderer-electrical-inspection.mjs`; the
unchanged product renderer revision remains `3b7e6af9d608ea8814217f385cf251be0f4ffb06`.
Final formatting, documentation and `git diff --check` passed. Local test servers
were stopped after acceptance runs.

## Post-push P0 diagnostics (2026-10-10; not yet Windows-runtime verified)

After commit `7abcf51` was pushed, the same Draft branch received a
**manual-only diagnostic** follow-up. The accepted single-pass optimization,
default transparency policy, canonical geometry, History, workers and approved
visual baselines remain unchanged.

- `?rendererV3RoiTrace=1` records ROI renderer milestones to
  `#threeHost.dataset.rendererRoiStage` and `WAFERCAD_ROI_STAGE` console
  events, including entry/exit around the synchronous clipped surface-plan
  build, caps, sidewalls, annotations and presentation. The flag is OFF by
  default and does not alter any draw or mesh decision.
- `scripts/renderer-roi-profile.mjs` isolates a *default-policy* 625-site
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
