# V3 / V4 RTX 3060 hardware acceptance — 2026-10-12

## Scope and provenance

**Result: FAIL (scientific parity), with complete valid hardware evidence.**

User-supplied review bundle: `rtx3060-diff-2026-10-12T04-22-50-392Z.zip`.
The ZIP is external evidence, not a Git-tracked visual baseline. The original
`evidence/summary.json`, four `report.json` files, PNGs and V3 GL traces
were inspected. All four experiments completed. The previous
`ERR_HTTP_RESPONSE_CODE_FAILURE` from October 11 was absent.

- Windows, Node 24.16.0, Playwright 1.55.1 / Chromium 140, Three 0.179.1.
- Real GPU: ANGLE Direct3D11, NVIDIA GeForce RTX 3060 (unmasked adapter).
- V3: `1620f8b182b3abf38353ec75ca55b2c99b68657a` (#166).
- V4: `97212f955f9f49ce1897cc7985f9422edfc17b8a` (#174).
- Each image is 531 × 275, or 146,025 pixels. Hardware strict pixel
  tolerance remains **zero**.

## Experimental results

| Run | Same policy A1/A2 changed px | Same policy B1/B2 changed px | Stable policy-specific px | Strict parity |
| --- | ---: | ---: | ---: | --- |
| V3 OFF/OFF and ON/ON | 54 | 78 | Not evaluated | FAIL |
| V4 Index-only | 84 | 107 | 9 | FAIL |
| V4 Caps-only | 95 | 79 | 24 | FAIL |
| V4 Combined | 163 | 179 | 5 | FAIL |

The stable policy-specific pixel sets for V4 Index-only, Caps-only and
Combined have **zero shared coordinates between any pair** in this run.
These values do not reproduce the previously seen 45 stable A/B pixels.
All same-context duplicate V4 screenshots are pixel-identical; the drift
appears between fresh contexts. Reported changes are sparse, generally
1–5 RGB channel values, with no changes to the alpha channel.

### V3: stage and input evidence

For each pair with the same V3 policy, sampled draw-input hashes, camera,
material fingerprint and draw-order fingerprint agree. WebGL framebuffer
hashes disagree *before* the browser screenshot/compositor stage. Both
arms have `glError = 0`. The phase checkpoints establish the earliest
**observed** drift boundaries:

- OFF/OFF: checkpoint at draw 256 matches; draw 384 differs
  (the captured owner kind at draw 384 is `material-exterior`).
- ON/ON: checkpoint at draw 128 matches; draw 256 differs
  (owner kind at draw 256 is `material-exterior`).

The exact first differing draw inside each interval is unknown. These
are bounded checkpoints, **not** per-draw evidence. The observations
implicate the earlier material/raster path in fresh-context drift and
do not support attributing all pixel changes to Electrical geometry.

### V4: actual optimization activity and cost

All four ABBA contexts completed in each mode. The tested A baselines
exercise neither optional optimization; both B samples in each mode
exercise **exactly** their requested optimization(s).

All arms: **1,409 draw calls / 16,906,262 triangles**. Both independent
in-context repeat screenshots match byte-for-byte per arm.

| V4 mode | B CPU estimated buffer bytes | Change vs A | B geometries | Median A / B finish-wall ms |
| --- | ---: | ---: | ---: | --- |
| A (all modes) | 32,513,760 | — | 1,468 | — |
| Index-only | 32,394,960 | −118,800 | 1,468 | 41.40 / 47.45 |
| Caps-only | 32,181,984 | −331,776 | 1,362 | 44.35 / 49.95 |
| Combined | 32,063,184 | −450,576 | 1,362 | 41.70 / 50.45 |

Index-only B registers 2,750,000 indexed vertices against 4,125,000
original vertices. Caps-only and Combined avoid 106 flat-cap clones.
These are legitimate CPU-side structural savings; the buffer-byte figure
is an estimate, **not GPU VRAM**. Candidate median wall times are higher
in this one sample; this is not a rigorous speed regression proof, but
the data do **not** demonstrate a hardware speedup.

## Acceptance decision

1. V3 and V4 **remain Draft**. Do not merge, enable optimizations by
   default, change baseline images or weaken the zero-pixel gate.
2. The three V4 stable-pixel signatures are *associative* only; since
   A/A and B/B drift, source attribution to Index or Caps is blocked.
3. Investigate shared `material-exterior` draw/raster reproducibility
   before changing the Electrical optimization or flat-cap geometry.
4. The unified summary at V4 `97212f9` labelled each completed V4
   strict parity assertion `error`. The report contents establish
   `blocked`; the result classifier is corrected separately with a
   failing-case regression. This does not alter renderer output.
5. No additional broad RTX 3060 benchmark is justified until a
   targeted deterministic root-cause hypothesis can be tested.

## Recorded validation limits

These conclusions cover one complete Windows RTX 3060 acquisition using
the exact SHAs above. Software CI remains a separate requirement and
cannot substitute for zero-pixel hardware parity. The supplied ZIP was
read and analyzed; its screenshots were not added to approved baselines.
