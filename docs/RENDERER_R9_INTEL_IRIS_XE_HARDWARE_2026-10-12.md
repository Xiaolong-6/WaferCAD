# R9 native Intel Iris Xe hardware acquisition — 2026-10-12

**Result:** All five R9 evidence steps completed on an identified Intel Iris Xe
Direct3D 11 WebGL adapter with **zero changed pixels within their respective
policy comparisons**. This is valid *adapter-specific* evidence.
Previously failing RTX 3060 fresh-context hardware evidence remains a P0 blocker.
No product defaults, approved visual baseline, pixel tolerance, or geometry
kernel contract was changed.

## Provenance and evidence integrity

- Input: two private operator-uploaded evidence ZIPs; their raw images,
  device-local paths and logs are **not committed to this public repository**.
- First ZIP (13:33 UTC prefix) contains `fatalError: Chromium installation
  failed` and **no completed experimental steps**. It is infrastructure
  evidence, not an additional sample.
- Complete ZIP (13:37 UTC prefix), captured at
  `2026-10-12T13:42:18.078Z`: `campaign=r9`, `campaignComplete=true`,
  `passed=true`, five completed steps, 20 independent WebGL contexts,
  zero fatal errors. Local reports and pixel-decoded PNGs were inspected.
- Pinned tested revisions: **V3 `43ac000ac92db70fe59670682fbd1ab00751c806`**,
  **V4 `5972f68b9e0fa6795489e7685208016345df41c1`**.
  These precede the subsequent October 12 main-alignment/format-only commits;
  do not relabel the evidence as a run on their new HEADs.
- Browser: Chromium `140.0.7339.186` (V3 report); host: Windows.
  All 20 contexts independently identified
  `ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x0000A7A1), D3D11)`.
  `hardwareVerified=true` and a consistent named native adapter appear
  in every hardware step. **This is Intel Iris Xe, not RTX 3060**.
- Screenshots have dimension `531 x 275` (146,025 pixels) and contain
  thousands of unique RGBA colors and a visible 3D model, ruling out a
  false all-white/all-transparent screenshot. V3 captured valid native
  default framebuffer `530 x 273` with zero GL errors, consistent within
  its own four contexts. Native and screenshot dimensions are tracked
  separately.

## Results by experiment

| Step | Native hardware evidence | Pixel result | Status |
| --- | --- | --- | --- |
| V3 standard | Four fresh contexts, OFF/OFF/ON/ON, GL final-frame and required draw milestones, sampled raster states | OFF/OFF, ON/ON and OFF/ON: zero pixels changed; same-policy native framebuffer hashes agree | **Passed (Intel)** |
| V3 MSAA-off control | Four fresh contexts; `contextAntialias=false`, framebuffer `SAMPLES=0` (standard had `SAMPLES=4`) | Same-policy and cross-policy comparisons all zero pixels changed *within this control* | **Diagnostic complete only** |
| V4 Index only | A/B/B/A, four contexts; observed 2,750,000 indexed vs 4,125,000 original vertices in B | All six pairwise PNG comparisons zero changed pixels; candidate exercised | **Passed (Intel)** |
| V4 Caps only | A/B/B/A; B avoids 106 geometry clones | All six pairwise PNG comparisons zero changed pixels; candidate exercised | **Passed (Intel)** |
| V4 Index + Caps | A/B/B/A; both activity counters positive | All six pairwise PNG comparisons zero changed pixels; candidate exercised | **Passed (Intel)** |

V3 bounded checkpoint sampling recorded 12 hashes per trial, not a
per-draw complete framebuffer trace (`phaseCoverage.complete=false`
is expected for this milestone protocol). The required checkpoint
validation succeeded, and equal-policy raster states were identical
at sampled milestones. Do not claim every draw was observed.

V3 OFF vs ON submitted draw calls **1,408 → 1,291** (8.31% reduction),
triangles **57,040,012 → 54,066,262** (5.21% reduction).
Pixel and native framebuffer equality were exact for this Intel test.

### Candidate resources

| V4 state | CPU TypedArray bytes | Difference from A | Three geometries | Draws / triangles |
| --- | ---: | ---: | ---: | --- |
| A (unchanged R7 baseline) | 32,513,760 | — | 1,468 | 1,409 / 16,906,262 |
| Index B | 32,394,960 | −118,800 B (−0.365%) | 1,468 | unchanged |
| Caps B | 32,181,984 | −331,776 B (−1.020%) | 1,362 | unchanged |
| Combined B | 32,063,184 | −450,576 B (−1.386%) | 1,362 | unchanged |

These are JS/CPU-side allocations and Three geometry identities.
They do not establish lower driver VRAM, GPU workload or draw count.

### Wall-clock measurements: informative only

| Independent V4 ABBA mode | A median (ms) | B median (ms) | A/B observed |
| --- | ---: | ---: | ---: |
| Index | 90.45 | 69.80 | 1.296 |
| Caps | 74.20 | 58.45 | 1.269 |
| Combined | 88.50 | 70.35 | 1.258 |

Eight wall-clock samples per policy per mode. The sampler measures
browser input-to-next-frame plus `gl.finish()` **wall time**,
not disjoint-filtered GPU timer queries; substantial 30–200 ms
within-mode and within-policy variation was observed. Each report
explicitly sets `stats.hardwareAcceptable=false`,
`pureGpuFrameTimeMs=null`, `gpuVramBytes=null`. The ratios
**must not be promoted as proven hardware speedups**.

## MSAA conclusion and renderer policy scope

The standard Intel V3 run was already strictly repeatable with 4
framebuffer samples. The forced no-MSAA diagnostic was also repeatable
with zero samples. Direct PNG comparison *between* normal and no-MSAA
raster policies finds 6,553/146,025 changed pixels (~4.49%).
Disabling MSAA changes visual output and is **not indicated as a
production fix by this run**; it remains an untested RTX 3060 hypothesis.
The control's own `passed=false, acceptanceEligible=false` is
correct, even though `strictParity=true` in that altered state.

V3's standard acquisition uses a transparent **Quality** policy;
V4 R7 A/B/B/A uses transparent **Fast** with V4's already-stacked
R1–R6 changes. Comparing V3 PNG bytes directly against V4 A
would mix policies and branches; it is **not** a V3→V4 visual
equivalence assertion. Only paired comparisons within each
experiment qualify for the above strict acceptance.

## Engineering decision

1. The integrated R9 one-shot harness worked end-to-end on a **real Intel**
   adapter. This is a positive additional hardware compatibility and strict
   pixel-parity result for the **exact pinned captured revisions**.
2. Existing **RTX 3060 strict fresh-context mismatch** still blocks
   production promotion. This Intel result narrows the issue to
   platform/driver/adapter or uncontrolled conditions; it does **not**
   establish a causal mechanism. Do not disable global MSAA or loosen
   zero-pixel tolerances from this evidence.
3. V4 Index and Caps do produce genuine independent CPU resource savings.
   Their recorded wall-time ratios have high variance and no reliable
   GPU timer or VRAM evidence; they remain **gated off**.
4. Keep **PR #166 and PR #174 Draft**. Do not merge based only on the Intel
   result or on green software CI. A relevant RTX 3060 validation is
   required for release if it remains a target platform.
5. No repeated Intel run is requested. Analyze future RTX evidence only
   when available; avoid new diagnostic code unless a specific
   falsifiable missing measurement is identified.

Related decisions: [R9 consolidation](RENDERER_R9_CONSOLIDATION_2026-10-12.md)
and [single-session runbook](RENDERER_R9_HARDWARE_RUNBOOK_2026-10-12.md).
