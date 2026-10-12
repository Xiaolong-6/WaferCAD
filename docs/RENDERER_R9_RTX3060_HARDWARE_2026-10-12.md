# R9 RTX 3060 native hardware decision — 2026-10-12

**Status: standard production hardware parity BLOCKED; no-MSAA diagnostic exact; experimental V4 performance not demonstrated.** Data came from the operator's privately uploaded complete R9 campaign ZIP. Do not commit raw PNGs or machine logs to this repository.

## Reproducible run

- Capture completed at `2026-10-12T14:57:53.791Z`.
- Exact captured branch SHAs: V3 `4e7128042fb5ef86908e4ee7e3df7084ae7ce52f`, V4 `80689689917b5b7f1c806df8e20fef4184804a26`.
- GPU from all 20 contexts: `ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)`, unmasked and `hardwareVerified=true`.
- Chromium `140.0.7339.186`, Windows, 531 x 275 screenshots (146,025 pixels). Five stages finished without an infrastructure error: standard V3, no-MSAA V3, V4 Index, Caps and Combined. `campaignComplete=true`, `passed=false`.
- Reports preserve strict pixel tolerance **zero**, independent fresh contexts, GL frame hashes, sampled draw checkpoint hashes, actual sample count, and product-state snapshots.

## V3: controlled MSAA isolation

| Trial comparison                        |                                 Default `SAMPLES=4` |                                 Diagnostic `SAMPLES=0` |
| --------------------------------------- | --------------------------------------------------: | -----------------------------------------------------: |
| OFF/OFF (same policy)                   | **46** changed PNG pixels (maximum channel delta 1) |                                                  **0** |
| ON/ON (same policy)                     | **75** changed PNG pixels (maximum channel delta 1) |                                                  **0** |
| OFF/ON (candidate comparison)           | **37** changed PNG pixels (maximum channel delta 1) |                                                  **0** |
| GL framebuffer fingerprint              |                              Same-policy mismatches |                             Identical in all four arms |
| Draw inputs and sampled raster GL state |                 Same-policy inputs and states agree |                    Same-policy inputs and states agree |
| Sampled GL phase fingerprints           |                     Same-policy checkpoint mismatch |                      Same-policy checkpoints identical |
| Acceptance                              |                       Standard `strictParity=false` | `strictParity=true` **but `acceptanceEligible=false`** |

Native draw counts remain OFF **1,408 / 57,040,012 triangles** and ON **1,291 / 54,066,262 triangles** in both raster policies. Disabling MSAA removes the _observed_ divergence in this controlled capture, which strongly implicates MSAA/resolve or a coupled driver rasterization path. It does not distinguish all possible driver causes, establish a cross-driver fix, or approve changing production antialias settings.

Comparing the **standard-MSAA output against no-MSAA output** changes 6,554 PNG pixels on OFF1 (6,554 OFF2; 6,555 ON3; 6,554 ON4), up to **70/255** per channel, across the rendered structure. This is a substantive visual-policy change and cannot silently replace the approved image. A general `antialias:false` production switch is **not** authorized by the diagnostic result.

## V4: RTX 3060 A/B/B/A results

| V4 candidate | Same-policy A1/A2 changed pixels | Same-policy B1/B2 changed pixels | Baseline median wall ms | Candidate median wall ms | Median A/B ratio |
| ------------ | -------------------------------: | -------------------------------: | ----------------------: | -----------------------: | ---------------: |
| Index only   |                               72 |                               57 |                   36.65 |                    36.85 |        **0.995** |
| Caps only    |                              129 |                              108 |                   42.85 |                    45.45 |        **0.943** |
| Both         |                               63 |                              134 |                   36.95 |                    39.00 |        **0.947** |

Every V4 step has all six ABBA pixel pairs mismatching, even the independent **baseline A/A** pair. Candidate activation is verified in all cases. Therefore cross-policy differences **cannot be attributed solely to the optimizations** and fail the existing strict gate. Captured V4 frame submissions stay at **1,409 draw calls / 16,906,262 triangles** in every policy. Typed-array accounting still supports the independent CPU-memory savings (Index 118,800 B; Caps 331,776 B; Both 450,576 B), but not reduced GPU primitives.

All wall samples measure input-to-next-frame plus `gl.finish()`, not pure GPU time; `hardwareAcceptable=false`, `pureGpuFrameTimeMs=null`, `gpuVramBytes=null`. Unlike the earlier Intel Iris Xe one-session result, this RTX session gives **no promising stable wall-clock improvement**. Do not market a performance speedup.

## Merge decision

- **Promote correctness in isolation:** the independent, already unit-tested PNG capture transaction and nested scene-resource-disposal fixes can go into one small `main` PR, with focused CI; they do not depend on optional V3/V4 performance flags. Treat ROI recovery separately if a small independent patch can be justified.
- **Do not bulk-merge experimental V3/V4 feature branches:** the full V3 PR carries performance instrumentation and guarded geometry experiments, and the stacked V4 PR carries additional unproven optimization policy and test infrastructure. Git mergeability and passing software CI are not promotion criteria.
- Keep both original PRs Draft and candidate defaults off. Preserve the single production `site/three-view.js` renderer.
- The new RTX evidence **does not invalidate** the earlier Intel Iris Xe strict-pixel PASS at its exact older SHAs. Results differ by GPU driver/raster policy; preserve both.
- Next phase: explicitly distinguish baseline native-MSAA repeatability from candidate equivalence under a reproducible raster policy. Do not lower the zero-pixel threshold or change approved baselines without a separately reviewed acceptance decision. No blind repeat hardware capture.

Related: [Intel Iris Xe evidence](RENDERER_R9_INTEL_IRIS_XE_HARDWARE_2026-10-12.md), [R9 consolidation](RENDERER_R9_CONSOLIDATION_2026-10-12.md).
