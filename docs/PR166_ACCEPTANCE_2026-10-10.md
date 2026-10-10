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
