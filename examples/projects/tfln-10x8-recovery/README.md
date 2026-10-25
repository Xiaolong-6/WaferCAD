# Recovered TFLN 10×8 resonator array — engineering candidate

**Status: candidate reconstruction, not a published Welcome Example or paper-verified replacement.** This is the actual archived TFLN round-resonator/fanout geometry, not the synthetic 10×8 rectangular-island stress fixture. It is intentionally separate from the border renderer fix. Original clean-rebuild `TFLN_10x8_REBUILT_editable.wafercad` (reported as 1.74 MB) was not available in the recovered source files, so these are **new recovered outputs**, not byte-identical copies of that deliverable.

## Provenance and structure

- Recovered from the previously saved `TFLN_10x8_constrained_BOX_release.wafercad` (WaferCAD v14 `shared-assets-v2`), not fabricated from screenshots. The earlier `TFLN_10x8_corrected_mask_driven_80units.wafercad` and the unoptimized standalone source were inspected and not substituted without retaining BOX-release staging.
- 8 columns × 10 rows, **80 instances**; overall 1,160 × 3,600 µm; cell pitch 145 × 360 µm. The array stores **30 unique physical-geometry templates** to retain archived per-cell segmentation instead of assuming every cell's final polygon clipping is bit-identical. Material stacks include base silicon, SiO₂ BOX (5–7 µm Z), and X-cut LiNbO₃ (nominally 7–7.3 µm Z, locally reduced by the archived release model).
- File Mask: 1,200 polygons on **11/0 (M1)** and 800 polygons on **12/0 (M2)**. The lossless geometry derives from the archived mask reconstruction. The two native mask exports were parsed back and matched **every polygon** on the 0.1 nm database-unit coordinate grid, allowing ring rotation/reversal.
- Project geometry and all original mask elements are stored in native WaferCAD format; physical Z and layer ownership remain in µm. Not a canonical single-template process replay: exact original M1/M2 operation history was not recovered.

## Files

- `TFLN_10x8_recovered_native.wafercad.gz` — valid editable native array project, 4,686,270 bytes uncompressed (SHA-256 `3e0fcdcd1ef81419580695eb74b3ab30692f4ac014a701562b52f5ab74eb8df8`)
- `TFLN_M1_M2_10x8_recovered.gds.gz` — 1,491,322 bytes uncompressed (SHA-256 `e5646056a2a215f596688f7b6eb617cce815c9db8d97dda24677634bcaef14d1`)
- `TFLN_M1_M2_10x8_recovered.oas.gz` — 874,558 bytes uncompressed (SHA-256 `9bbe1d46446e0a15be31b9434203e8f53ac114ef78b9fd109d8c8dfa1906f548`)

Decompress individually, e.g. `gzip -dk TFLN_10x8_recovered_native.wafercad.gz`. Keep the `.wafercad` extension for the workstation's native Open action. The compressed files minimize repository transport and **do not change** the imported physical geometry. From the repository root run `node examples/projects/tfln-10x8-recovery/verify.mjs` to validate the payload digests, actual project schema, array hierarchy, the two complete Mask polygon round-trips, and the ROI geometry plan.

## Acceptance and limitations

- Local strict `readProjectFile()` completed, 80 array sites, 30 templates, 2,000 mask polygons; the full native 3D surface plan was constructed (260 caps, 144 sidewall groups). Six archived material-region footprint totals matched the recovered instances with a maximum relative deviation below `3e-13` following 0.0001 µm geometry quantization.
- Native headed Chromium/Three.js 0.179.1 rendered a real single-round-resonator ROI at 55% opacity with 0 page errors and 0 unexpected rejections. This was **`about:blank`/null-origin** native renderer diagnostics. Normal-origin Worker Open, History/Recovery and actual Clean/Structure/X-Ray controls are **not signed off**.
- The archived flattened polygon topology still creates a dense full-array outline plan (~263k horizontal/vertical segment inputs in the 2026-10-23 baseline). Further ownership/performance tuning, full 10×8 visual inspection and comparison to the published device dimensions remain necessary before promotion to an official Example or PR merge.
- This recovery adds **no alternative Renderer angle rule**, no process-kernel changes and no new CI triggers. It is meant to preserve the original disc-array source and enable targeted scientific/visual validation on PR #369.