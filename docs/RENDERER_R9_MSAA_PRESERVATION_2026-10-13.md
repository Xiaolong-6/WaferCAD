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
