# R9 Renderer consolidation decision — 2026-10-12

## Decision and scope

**Keep one production 3D rendering engine.** V3 and V4 are stacked
iterations of `site/three-view.js`, not two independent shipping engines.
Retain the current default renderer and its V3 scientific presentation rules.
Carry V4's independently proven error-recovery and resource-lifetime
correctness fixes upstream into V3. Keep V4's optional geometry and tile
experiments isolated; **do not enable them or merge PR #174 yet**.

This document is an engineering decision, not a claim of hardware parity.
PR #166 remains Draft and **not ready to merge** until its strict native
hardware evidence is accepted. PR #174 remains Draft and **not ready to
merge** because strict hardware parity and positive hardware performance
have not been demonstrated.

## Confirmed P0 product defects removed from the V3 baseline

1. **3D PNG transactional recovery.** V3 previously created a temporary
   WebGL renderer, changed interactive pixel ratio and camera aspect, then
   awaited rough geometry preparation *before* entering its cleanup
   `try/finally`. A failed rough build skipped cleanup and could leave
   the main viewport altered. Successful cleanup also restored the
   capture aspect instead of the original aspect.
   V3 now uses V4's `runTemporaryRendererCapture` implementation,
   including cleanup on setup/prepare/encode/dispose failures and
   restoration of the original viewport projection.
2. **Scene disposal fault containment.** V3 had two shallow disposal
   loops over direct children. Failure disposing one geometry stopped
   retirement of subsequent resources; nested mesh resources could be
   omitted. V3 now reuses V4's tested owner-scoped
   `disposeRendererSceneResources` helper from both scene disposal
   call sites. It handles nested objects, unique resources and
   exceptions, reports failures, and proceeds with scene-cache cleanup.

The V4 implementations and their direct Node tests are copied
**without changing their source**. V3's scene assembly, materials,
shader programs, geometry, alpha sorting, stored units and approved
visual baselines are otherwise unchanged. The updated V3 shell
still requires browser and CI validation at the exact new head.

## Performance and hardware evidence

| Metric / behavior | Measured result | Interpretation |
| --- | --- | --- |
| V3 Quality 625-site OFF | 1,408 draws; 57,040,012 triangles | Prior RTX 3060 native capture; hardware parity blocked |
| V3 opt-in planar single pass ON | 1,291 draws; 54,066,262 triangles | Lower submission counts, not proof of a GPU speedup |
| V4 R7 625-site A and B | 1,409 draws; 16,906,262 triangles each | Candidate Index/Caps does not reduce submitted draws or triangles |
| V4 R7 CPU TypedArrays | 32,513,760 B A; 32,063,184 B B | 450,576 B (1.386%) saved; *not* driver VRAM |
| V4 R7 wall time, A1 / A2 | 40.40 / 72.20 ms | Baseline nonstationarity; no reliable speedup inference |
| V4 R7 wall time, B1 / B2 | 31.55 / 39.80 ms | Candidate nonstationarity; not GPU timer queries |
| V4 same-policy fresh context A1/A2 | 78 changed pixels | Strict baseline parity fails on RTX 3060 |
| V4 same-policy fresh context B1/B2 | 147 changed pixels | Strict candidate parity fails |
| V4 all four PNG policy-consistent | 45 coordinates | Candidate-correlated difference is real observation; feature attribution unproven |
| V3 fresh-context OFF/OFF and ON/ON | 54 and 78 changed pixels in prior capture | Native framebuffer drift persisted with equal camera/material/draw hashes |
| V3 DITHER-off diagnostic | 33 OFF/OFF; 134 ON/ON | Dithering is **not** a complete remedy |

These numbers are from the existing R7 hardware forensic record and
V3 hardware diagnostics; they are different experiments and **must not
be merged into an A/B GPU speedup statistic**. The R8.3 native readback
now records draw-milestone GL raster state, but this new field has not
yet been acquired on hardware. No causal shader, MSAA or driver
attribution is established. Zero-pixel tolerance remains unchanged.

## Consolidation decisions

| Capability | Decision | Rationale |
| --- | --- | --- |
| Existing geometry, transparent sorting and physical-model ownership | **Keep** in one shared renderer | Correct scientific baseline; no alternative acceptance |
| V4 owner-scoped disposal and transactional PNG capture | **Promote to V3 now** | Independent failure-case tests, no pixel-policy change |
| V3 planar-cap single pass, quality wall index | **Keep gated off** | Native strict pixel parity unresolved |
| V4 FastSmoothIndex and SharedFlatCaps | **Keep gated off in V4** | ~1.4% CPU buffer reduction, zero draw/triangle reduction, strict hardware block |
| V4 adaptive-tile classifier/cache and feature survey | **Diagnostics only; no rendering promotion** | No alpha-coverage proof, no actual mesh replacement / skipped triangles |
| V4 no-damping interaction pilot | **Experimental only** | Not relevant to pixel correctness; performance acceptance absent |
| Additional GL-state probes | **Freeze unless evidence identifies a precise missing measurement** | Stop expanding tools without a discriminating hypothesis |
| Separate “Renderer V5” architecture | **Do not create** | Existing engine + selected proven helpers is the consolidation target |

## Remaining acceptance blockers

**Hardware P0 (both PRs):** on a verified Intel, AMD or NVIDIA hardware
WebGL adapter, collect independent same-policy fresh-context evidence
with valid draw milestones, full framebuffer hashes, screenshot pixel
comparisons, camera and materials, sampled buffer hashes and R8.3 GL
state. Pixel equality must be exact. Previous RTX 3060 runs are
explicitly red. If the GL state matches while native framebuffer
hashes diverge, test the already implemented no-MSAA hypothesis before
proposing any shader or raster modification; an uncollected test is
**unknown**, not a pass or a failed hypothesis.

**V4 performance P1:** for each candidate mode independently,
require hardware A/B/B/A with A/A, B/B and A/B parity, steady-state
frame-time distributions, driver/GPU timing where supported, and
memory telemetry. One nonstationary combined-mode R7 acquisition
does not justify retaining complexity on the production path.

**Integration P2:** V3's pure-unit and cross-interface CI gates and
V4's full focused/compatibility gates must pass at their respective
latest heads. Keep PR #174 stacked on PR #166, V3 synced with main.
Do not bypass a check, modify an approved visual baseline or
represent SwiftShader as hardware evidence.

## Stop/go decision

- **PR #166:** Draft / blocked on hardware zero-pixel parity; now also
  contains backported safe lifecycle/PNG behavior.
- **PR #174:** Draft / not eligible for main; resource/capture fixes
  are no longer reasons to hold them only on V4. Index/Caps/tile
  features remain experimental pending evidence.
- **One engine:** `site/three-view.js`; do not introduce a second
  renderer or maintain duplicate scene output paths.
