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

## 2026-10-13 complete RTX 3060 preserved-MSAA acquisition

The operator's private evidence ZIP is `2026-10-13T10-41-24-416Z.zip` (SHA-256 `2f31df3cf1ec4c1b3f79d2cb99cef72b32f5aaee568f8ffd4efb0f692301b788`). Its 14 entries include four full PNGs, four traces and the report. Source revision is `e231d8537bbd06ecfc47fe83c0b26e5b6cbacec6`. Raw machine traces and screenshots remain outside the public repository.

All four OFF/OFF/ON/ON contexts identified the same physical NVIDIA GeForce RTX 3060 through ANGLE D3D11. The native WebGL readback verified `antialias=true`, `preserveDrawingBuffer=true`, four actual default-framebuffer samples and no GL errors in every trial. The campaign completed with `diagnosticComplete=true`, `fatalError=null`, and `strictParity=false`. Diagnostic classification remains `passed=false` and `acceptanceEligible=false`.

At 531x275, OFF/OFF differed in 11 of 146,025 pixels (maximum channel delta 1/255); ON/ON differed in 76 pixels (maximum 1/255). The different-policy OFF/ON comparison differed in 154 pixels (maximum 2/255) and is not evidence of a pure raster-lifecycle difference. Independent pixel-by-pixel PNG comparison reproduced those counts. Same-policy native framebuffer hashes had already diverged before browser screenshot composition.

Both same-policy pairs retained identical camera, layout, draw order, material signatures, sampled draw inputs and measured raster state. The first differing native `material-exterior` checkpoint occurred after draw 256 for OFF/OFF (draw 128 matched), and after draw 384 for ON/ON (draw 256 matched). These intervals bound the earliest observed mismatch; they do not establish a specific draw or prove a GPU-driver cause.

The prior independent non-preserved 4x-MSAA run differed in 49 OFF/OFF and 85 ON/ON pixels. A smaller count in this run does not prove a stable improvement. Preserving the drawing buffer failed to eliminate strict production 4x-MSAA pixel drift. Earlier zero-MSAA experiments also cannot authorize changes to the production baseline.

This preservation hypothesis is closed as insufficient. Do not repeat this hardware campaign or the already completed Index, Caps and Combined no-MSAA campaigns. Keep PR #174 Draft, all experimental flags default-off, the original 4x-MSAA setting and a strict zero-pixel gate. Any subsequent exterior-material MSAA/resolve investigation should first validate its read-only instrumentation in CI and request hardware only for one bounded, decision-relevant experiment.

## R9 follow-up: V4 production-MSAA bounded draw-window preparation

The archived preserved-buffer trial found first observed OFF/OFF divergence
between draws 128 and 256, and ON/ON divergence between draws 256 and 384.
These intervals overlap the exterior-material stage. Captured evidence
does not identify the first causal draw.

The current V4 branch now includes a diagnostic-only
`--campaign=r9-phase-window` plan. It targets one combined draw window
`128:384` using eleven intermediate framebuffer checkpoints plus one
final framebuffer, within the existing twelve-readback limit per arm.
It runs the same OFF/OFF/ON/ON four-context experiment on a single
verified hardware adapter. The source revision is the fetched V4 head;
the retired V3 remote branch is not used.

The classifier requires native four-sample MSAA, normal
`preserveDrawingBuffer=false`, unchanged default framebuffer binding,
four completed hardware contexts, exact comparison identities and
complete GL/raster-state checkpoint coverage. It rejects missing or
altered evidence. The full-wafer mesh and all renderer optimization flags
remain untouched and disabled by default.

The planning and fail-closed classifier can be tested without hardware:

```powershell
node scripts/renderer-unified-hardware.mjs --plan-only --campaign=r9-phase-window
node --test scripts/tests/renderer-unified-hardware.test.mjs
```

A future hardware acquisition, if justified by completed CI, uses
`--hardware-gpu --campaign=r9-phase-window` once, and yields separate
evidence rather than rerunning the old broad R9 or preservation experiment.
No new hardware result is asserted here. All results from this campaign
are diagnostic-only: `acceptanceEligible=false`, `passed=false`
regardless of any observed pixels. The original strict zero-pixel
production baseline remains the acceptance gate for PR #174.

## 2026-10-13 RTX 3060 R9 phase-window: four-context acquisition

The private `2026-10-13T12-25-04-372Z.zip` archive (SHA-256
`078df6d16b8c3b94a51b8401710b09fc9dd61d078104f4ab4dcfec025d43c420`)
contains 14 files, four fresh-context trace/PNG pairs, a complete
`report.json` and the launcher's `summary.json`. The exact tested
V4 source is `1d4dc4de8e41c1ba12083e3ab872050d4a274d35`. Raw GPU
artifacts stay private; this text preserves derived diagnostics only.

The native diagnostics verified one NVIDIA GeForce RTX 3060 / ANGLE
D3D11 adapter in every context, `antialias=true`, `SAMPLES=4`,
`preserveDrawingBuffer=false`, default framebuffer binding and
`glError=0`. All four arms captured eleven requested checkpoints
within draws 128–384 plus their respective final frames. The
recorded native framebuffer measures 530x273; separately captured
PNG screenshots measure 531x275. The checkpoint arrays match the
intended draw schedule and raster states are identical between
same-policy arms.

The OFF/OFF screenshots differ in **83/146025** pixels, with maximum
8-bit channel delta **3**; the ON/ON screenshots differ in
**99/146025**, also maximum delta **3**. Alpha changes are zero.
Native framebuffer SHA-256 hashes already differ, before browser
screenshot composition. Same-policy camera matrices, draw order,
material identifiers and **48 sampled** draw-input records match.
The finite input sample cannot exclude all unsampled vertex,
uniform, texture or driver-level state differences.

The first identical native checkpoint is at draw 128. Both OFF/OFF
and ON/ON pairs differ at the next checkpoint, draw 154. Thus
the **first observed drift interval is (128,154]**, under
`material-exterior` in both policies. This is a 26-draw observational
bound and does not identify the causative draw.

There is a striking cross-policy hash partition. At draw 128,
all four native framebuffers are identical. At every recorded
checkpoint from draw 154 through draw 358, `1-OFF` exactly matches
`3-ON`, while `2-OFF` exactly matches `4-ON`, and the two pairs
differ from one another. At draw 384, all four hashes differ.
This is **replicate-index grouping** in four _distinct_ contexts;
no WebGL context is actually reused between OFF and ON arms.
It suggests the first observable divergence precedes any relevant
policy-specific raster-output difference in this window; it is not
proof of an ANGLE/driver cause or of the identity of unsampled GL
inputs. It also does not establish a universal breakpoint across
independent launches.

The ZIP classifier reports `campaignComplete=true`,
`diagnosticComplete=true`, `fatalError=null`,
`strictParity=false`, `passed=false` and
`acceptanceEligible=false`. This is valid experimental evidence
and an explicit product-acceptance failure. Keep the strict zero-pixel
4x-MSAA gate; no visual threshold, shader, geometry or optimization
default changes are authorized.

The follow-up adds the read-only `renderer-r9-phase-readout.mjs`
command and its small cross-policy fingerprint-partition module.
For an already extracted ZIP, run the command with the saved
`v4-phase-window/report.json` as its argument. It rejects missing,
malformed or reordered checkpoint sequences. The next engineering
step should inspect the complete GL draw inputs (not merely the
existing 48 sampled draws) within (128,154], by read-only bounded
instrumentation in CI. No additional GPU acquisition is requested
at this stage. Do not repeat the older R9, preservation or
no-MSAA campaigns.

## Follow-up: focused per-draw WebGL input fingerprints

The next bounded diagnostic is a separate `r9-focus` campaign.
The previous `r9-phase-window` records and their classifiers remain
valid without the new focused fields. The new campaign preserves the
same four fresh WebGL contexts and draw-128-to-384 framebuffer
checkpoints, then adds consecutive input snapshots before each draw
from 129 through 154.

Each of the 26 observations includes the draw operation, primitive
arguments, material owner, attached shader source hashes, active
uniform values (capped at 128 uniforms), measured raster state, and
bounded vertex/index buffer samples (up to 4096 bytes per binding).
It records texture binding presence for up to 16 texture units and
verifies that referenced sampler units lie within the captured set.
Active vertex attributes beyond the first eight are explicitly
reported as incomplete.

These are complete _draw-sequence observations_, not complete GPU
resource snapshots. Buffer content beyond the bounded readback
remains unverified. Texture image bytes are **not** captured or
verified, so matching fingerprints cannot exclude differences in
texture contents, driver state, or unsampled geometry bytes. The
instrumentation itself may perturb GPU scheduling and must not be
used as a speed benchmark.

The isolated campaign is diagnostic-only. A missing draw,
unavailable shader/uniform, over-budget sampler, or incomplete
buffer evidence fails closed. It cannot satisfy product acceptance,
regardless of matching fingerprints. No physical acquisition with
this instrumented campaign has been performed yet.

```powershell
node scripts/renderer-unified-hardware.mjs --plan-only --campaign=r9-focus
```

Run a physical `--hardware-gpu --campaign=r9-focus` acquisition
only after the revised CI gates succeed and only if a new
decision-relevant comparison remains necessary. Do not re-run the
older R9, preservation, or candidate no-MSAA campaigns. Keep PR
#174 Draft, experimental feature flags off, production 4x-MSAA
unchanged, and strict zero-pixel parity as the acceptance target.
