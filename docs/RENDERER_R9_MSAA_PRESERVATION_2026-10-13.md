# R9 production 4x-MSAA preservation diagnostic (2026-10-13)

## Evidence-based question

The native RTX 3060 R9 acceptance observed 49 changed pixels for V3
OFF/OFF and 85 for ON/ON across fresh WebGL contexts, with every
changed channel differing by at most 1/255. GL framebuffer hashes
already diverged. Four-context no-MSAA controls became identical,
but removing MSAA changes 6,554 of 146,025 pixels versus the product
visual baseline. The separate V4 Index, Caps and Combined no-MSAA
acquisitions also have strict zero-pixel diagnostic parity.

These results associate the drift with the 4-sample raster path, but
do not isolate multisample shading, sample locations, default
framebuffer invalidation, or presentation-time resolve.

## Single controlled experiment

Run the historical V3-style OFF/OFF/ON/ON instrumented product workflow
from the **current V4 branch**, with the same 625-site fixture and
opt-in candidate flags still disabled. Only the WebGL2 context
creation request changes: `preserveDrawingBuffer: true` with
`antialias: true`. The runner rejects any captured frame without
actual `SAMPLES=4`, `contextAntialias=true`,
`contextPreserveDrawingBuffer=true`, a default framebuffer or the
expected physical adapter. Its shader/geometry inputs, drawing
policy, science model and source code remain unchanged.

From an existing checkout of
`perf/renderer-v4-adaptive-tiles-20261010`:

```powershell
git pull --ff-only origin perf/renderer-v4-adaptive-tiles-20261010
node scripts/renderer-unified-hardware.mjs --plan-only --campaign=r9-preserved-msaa
node scripts/renderer-unified-hardware.mjs --hardware-gpu --campaign=r9-preserved-msaa
```

The unified launcher installs only the V4 worktree, checks HTTP
readiness and produces one ZIP under
`test-results/renderer-unified-hardware/`. The run is **diagnostic
only**, with `acceptanceEligible=false` and `passed=false`, even
if all three strict comparisons are pixel-identical. Its step
classification demands four complete fresh-context reports, three
properly labeled comparisons, 4-sample framebuffer verification
and full recorded phase checkpoints.

## Interpretation

- **A/A and B/B both become identical:** a change in default
  framebuffer lifetime/presentation may be relevant. This is a
  narrower hypothesis, not a proof of an ANGLE or GPU driver defect.
  Compare altered raster output to the approved product baseline
  before considering any product-level architecture change.
- **Same-policy drift persists with 4 samples:** preservation
  alone cannot resolve the observed instability; investigate
  sampling/rounding and default MSAA resolve under an isolated
  alternative diagnostic, with no production changes.
- **A/A or B/B differs in GL state, draw order or geometry inputs:**
  those mismatches invalidate a purely raster-lifecycle attribution.
- **Experiment aborts, uses 0 samples, software GPU, or an
  incomplete phase trace:** it is an infrastructure error, not
  a valid pixel-parity comparison.

Never reinterpret `diagnosticComplete=true` as product acceptance.
The original zero-changed-pixel **standard 4-sample** hardware
gate remains mandatory before enabling V3/V4 experimental flags.
PR #174 remains Draft, and no main merge or screenshot-tolerance
change is authorized. Do not repeat the completed Index/Caps/Combined
no-MSAA hardware campaigns.

## 2026-10-13 first native acquisition: harness error, no parity conclusion

The operator's private Windows evidence archive
`2026-10-13T10-19-54-987Z.zip` (SHA-256
`8c3363a81535f6371fdb98f4403768f4df3df9640c622398ed3d2067b25e7a8e`)
used V4 `b911b832` and the intended `r9-preserved-msaa` campaign.
The HTTP preflight reached `app-legacy.html` (200); Chromium produced
`1-OFF.png`. The first trial then threw
`default framebuffer was not preserved: actual undefined, expected true`.
The ZIP has only one partial trial, no GL adapter/phase comparisons,
`campaignComplete=false`, and `diagnosticComplete=false`.

**Root cause in the diagnostic harness:** the injected GL probe already
captured `frame.contextPreserveDrawingBuffer` from
`gl.getContextAttributes()`, but
`renderer-electrical-fresh-context-ab.mjs` omitted the field when
projecting the probe frame into the serialized `native` record.
The assertion therefore received `undefined` regardless of the actual
WebGL attribute. Commit `9c527ea` forwards the recorded value unchanged;
the focused evidence-projection regression and existing fail-closed
classifier checks guard this boundary. The original hardware trial cannot
be reclassified and must remain incomplete.

Once **automated gates pass**, repeat only the isolated
`--campaign=r9-preserved-msaa` diagnostic from the corrected V4 HEAD;
do not repeat the completed V4 Index/Caps/Combined no-MSAA runs or the
full five-stage R9. This diagnostic can distinguish preserved-buffer
behavior under **actual four-sample** MSAA, but cannot approve production
pixel parity or experimental V4 speedups. Keep the branch Draft/default-off.

## 2026-10-13 completed RTX 3060 preservation acquisition: drift persists

This supersedes the previous *incomplete first run* as the final
preservation hypothesis result. The operator's separate, complete private
evidence archive is `2026-10-13T10-41-24-416Z.zip` (SHA-256
`2f31df3cf1ec4c1b3f79d2cb99cef72b32f5aaee568f8ffd4efb0f692301b788`).
It contains 14 files, including four 531x275 PNGs, four native
per-arm traces and the full `report.json`; raw screenshots, driver
logs and full trace contents are **not committed** to the repository.
The pinned V4 source is `e231d8537bbd06ecfc47fe83c0b26e5b6cbacec6`.

- One `r9-preserved-msaa` experiment completed the entire
  `1-OFF / 2-OFF / 3-ON / 4-ON` fresh-context series.
  `exitCode=0`, `fatalError=null`, `campaignComplete=true`,
  `diagnosticComplete=true`, `stage=completed`.
- Every context independently reported the same verified physical
  `NVIDIA GeForce RTX 3060` / ANGLE D3D11 adapter,
  `contextAntialias=true`, `contextPreserveDrawingBuffer=true`,
  default `SAMPLES=4`, default framebuffer, and `glError=0`.
  OFF/OFF submitted 1,408 calls / 57,040,012 triangles per arm;
  ON/ON submitted 1,291 calls / 54,066,262 per arm.
- The captured 12 per-arm GL checkpoints are valid with equal
  comparable raster states. Matching-policy camera matrices, material
  and object order hashes, 48 bounded sampled draw inputs, and layout
  match. Only these **sampled** inputs are proven equal; an unmeasured
  input cannot be ruled out.

- **OFF/OFF:** 11 / 146,025 changed PNG pixels; max channel
  delta 1/255; first differing native checkpoint after draw 256
  (draw 128 matched).
- **ON/ON:** 76 / 146,025 changed PNG pixels; max channel
  delta 1/255; first differing native checkpoint after draw 384
  (draw 256 matched).
- **OFF/ON:** 154 / 146,025 changed PNG pixels; max channel
  delta 2/255. Policies differ, so this comparison does not isolate
  a raster-lifecycle cause.

The matching-policy framebuffer hashes already differ **before**
compositor capture. Both first differences arise during
`material-exterior` submissions, in observed draw intervals
`(128,256]` for OFF and `(256,384]` for ON; these do not identify a
specific draw or hardware root cause. A separate manual RGBA comparison
of the PNGs reproduced 11, 76 and 154 differing pixel counts.
The matching-policy differences remain small and local, but strict
zero-pixel parity is unambiguously **false**.

Previous non-preserved production 4x-MSAA acquisition recorded 49
OFF/OFF and 85 ON/ON differing pixels. Lower counts here are one
independent capture sample, **not** statistical evidence of improvement.
Preserving the default drawing buffer was **insufficient** to eliminate
same-policy cross-context drift. The separate zero-MSAA experiments
were deterministic, but change the approved rasterization baseline and
remain diagnostic-only.

**Disposition:** this exact hypothesis is closed with a negative
result. `strictParity=false`, `passed=false` and
`acceptanceEligible=false` are correct. Do not change production
`antialias`, shader/geometry paths or the strict zero-pixel threshold.
Do not enable experimental flags or merge PR #174. Do not repeat this
preservation experiment or the completed no-MSAA Index/Caps/Combined
campaigns. The remaining scientific question is 4-sample coverage /
resolve / quantization variability within those first observed
exterior-material draw windows. Design and validate any next read-only
diagnostic in automated CI before requesting a **new, strictly bounded**
hardware capture; do not label a plausible cause as proven.
