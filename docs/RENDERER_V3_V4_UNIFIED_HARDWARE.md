# Renderer V3 + V4 unified RTX 3060 evidence

This is a **diagnostic tool**, not a replacement for either PR's acceptance gates.
PR #166 (V3) targets `main`; PR #174 (V4) targets the V3 branch.
Both remain Draft until their individual hardware parity requirements pass.

## One command on Windows

From any checkout of PR #174, with Node 24, npm, Git, network
access to the repository, and a working RTX 3060:

```powershell
node scripts/renderer-unified-hardware.mjs --hardware-rtx3060
```

The script first verifies actual Chromium navigation to the locally served\n`app.html`, before any GPU trial. If it fails, `preflight-chromium.log`\nexplains the HTTP response or browser error and the run ends without wasting\nGPU captures.\n\nThe script fetches both remote branch heads, checks that the V4 HEAD contains
the V3 HEAD, makes two **detached temporary Git worktrees**, installs pinned
dependencies with `npm ci --ignore-scripts --no-audit --no-fund`, installs
pinned Playwright Chromium, and launches its own local HTTP server. It leaves
the current checkout and its uncommitted changes untouched.

The default run executes the original V3 OFF/OFF/ON/ON diagnostic and the V4
A/B/B/A diagnostic for each of `FastSmoothIndex` only, `SharedFlatCaps`
only, and both enabled. Each trial uses the exact revision of its respective
PR; never substitute the V4 default-off scene for a V3 commit-level result.

For a smaller targeted run, use `--modes=index`,
`--modes=caps`, `--modes=combined`, or
`--modes=index,caps`. Review the plan without touching Git or GPUs:

```powershell
node scripts/renderer-unified-hardware.mjs --plan-only
```

## Evidence and result interpretation

Every run produces a new timestamped directory under
`test-results/renderer-unified-hardware/` and an accompanying ZIP created with Node built-ins (no PowerShell Archive\nmodule required). It
contains a `summary.json`, the exact SHA for each branch, logs for installation
and each experiment, plus the original screenshots and `report.json` files.
Upload **one ZIP** for review. The runner continues gathering the other policies
after a strict pixel mismatch. Missing artifacts, wrong candidate flags,
unexercised V4 optimizations, and nonzero error exits remain failures.

CI uses software WebGL (SwiftShader) and cannot validate Windows Direct3D11
or actual GPU execution time. On RTX 3060, the strict zero-pixel requirement
is unchanged. The previously observed 45 stable A/B pixels are an attribution
lead, not proof of a specific geometry or material defect. No approved visual
baseline is modified by this script.

The runner may exit nonzero **while still producing a usable ZIP** because the
strict pixel gate has not passed. Retain the evidence; do not weaken assertions
or merge either PR on the strength of software smoke tests.

## 2026-10-11 failed first Windows capture (invalid evidence)

The user-supplied `rtx3060-488aa89e-2026-10-11T17-19-25-511Z.zip`
contains V3 `1620f8b` and V4 `488aa89`. Dependencies installed,
but all four experiments failed at their initial `page.goto(app.html)` with
`net::ERR_HTTP_RESPONSE_CODE_FAILURE`. There are **no GPU screenshots or
pixel comparisons** and no evidence establishing the 45 stable A/B pixels'
cause. The original summary incorrectly called V3 `blocked` and the
three V4 runs `candidate-not-exercised`, although no candidate ever
started. The archive module also failed to import on the user's Windows
PowerShell installation. These were harness failures, not new renderer
pixel-parity failures.

The repaired launcher now classifies boot errors separately, self-tests
local HTTP and Windows Chromium navigation before any GPU run, logs 403/404
with attempted paths, preserves partial artifacts and produces ZIP without
PowerShell. Linux CI exercises the HTTP service/ZIP unit tests; the focused
workflow also runs an independent Windows Chromium navigation job. **Do not
ask for the next RTX 3060 collection until that Windows preflight is green.**

## Targeted raster-isolation diagnostic (separate from acceptance)

The October 12 RTX 3060 ZIP identified **54 OFF/OFF and 78 ON/ON**
fresh-context changed pixels in V3; the first differing _sampled_ GL
checkpoint was in a material-exterior draw interval. Pixel changes were
small (mostly single-channel ±1) and located in nonuniform shading areas.
The recorded WebGL state had `GL_DITHER` enabled; this motivates a single
controlled **hypothesis test**, without claiming dithering caused the drift.

On the **latest V4 branch**, the following one-command experiment runs only
V3 on two fresh contexts per electrical policy with GL dithering disabled
during each WebGL draw; the original GL state is restored after every draw:

```powershell
node scripts/renderer-unified-hardware.mjs --hardware-rtx3060 --diagnose-v3-dither
```

It uses the updated V3 exact SHA, separately writes
`renderer-hardware-fresh-context-ab-no-dither` evidence, and records a
per-frame count proving GL_DITHER was actually disabled. This produces
`diagnosticComplete` **never** `passed` regardless of raw pixel parity.
The renderer's production/default output, strict zero-pixel acceptance gate
and approved visual baselines remain untouched.

Compare with the archived standard-dither hardware evidence before drawing
conclusions; if both fresh-context pairs become identical, this is evidence
for dithering sensitivity, subject to independent replay. If either still
drifts, the next isolated variable is multisample antialiasing or shader
precision. Do not turn this flag into a production rendering default without
a separate visual and scientific review.

## October 12 DITHER-off diagnostic: hypothesis falsified as a sole fix

Hardware bundle `rtx3060-v3-dither-3b07cf2-2026-10-12T05-17-55-947Z.zip`
was captured on a genuine RTX 3060 / ANGLE D3D11.
V3 `3b07cf2`, V4 `465dfc2`. The four contexts completed with
`GL_DITHER` disabled during **1,408 OFF draws / 1,291 ON draws** in
their respective captured frames. Both same-policy draw-input hashes,
material hashes, camera matrices and draw order agreed.

| Fresh-context same policy | Oct 12 baseline | DITHER disabled |
| ------------------------- | --------------: | --------------: |
| OFF/OFF changed pixels    |              54 |              33 |
| ON/ON changed pixels      |              78 |             134 |

Differences persisted in native GL framebuffer with zero GL errors,
1/255 maximum channel delta and unchanged alpha. DITHER-off is not a
strict-parity solution; comparing only one baseline and one intervention
does not establish a reliable direction of effect. The earliest sampled
material-exterior differences remain at draw 256 (OFF) and draw 384 (ON).
Most changed pixels have high local gradients (in DITHER-off: 29/33
OFF pixels and 129/134 ON pixels exceed an RGB mean local gradient of
2, versus ~6.5% of all frame pixels). This suggests sampling/raster
or shading quantization at rendered edges.

## Next targeted test: disable MSAA, leave DITHER unchanged

From the latest V4 runner branch, after the Windows preflight and
software CI succeed:

```powershell
node scripts/renderer-unified-hardware.mjs --hardware-rtx3060 --diagnose-v3-msaa
```

This runs **V3 only** on the pinned V3 HEAD, intercepting WebGL2 context
creation to request `antialias: false`; it confirms
`contextAntialias=false`, default framebuffer samples = 0 and
default framebuffer ownership for all four captured frames.
`GL_DITHER` is not overridden. Results are marked
`diagnosticComplete`, never product `passed`; previously approved
pixel baselines, normal renderer settings and strict zero tolerance are
unchanged. If parity still drifts, investigate shader float/color
quantization instead of another unstructured full-wafer benchmark.
