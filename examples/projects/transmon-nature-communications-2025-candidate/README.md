# Tuokkola et al. (Nature Communications 2025): transmon GDS reconstruction

## Sources and target

- Paper: https://doi.org/10.1038/s41467-025-61126-0
- Original data (Zenodo): https://doi.org/10.5281/zenodo.12819934
- Authors' main file: `Zenodo_files/sample.gds` — SHA-256 `6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02`.
- Supplementary transmon sample: `Zenodo_files/Supplementary_material/Sample_design.gds` — SHA-256 `90f5c5d447c84ffe118754cbf9b2e66bd0a863f834bee613ca968b2d12a49072`.
- Source GDS binaries are not committed; retrieve from the public author-provided dataset and verify digests.

## Actual GDS baseline (Node.js 22; WaferCAD `site/gds.js` and `site/layout-io.js`)

| Source | Cells | Boundary records | SREFs | Units | Result |
| --- | ---: | ---: | ---: | --- | --- |
| `sample.gds` | 79 | 39,304 | 371 | 1 nm DBU | Parse succeeds (~90 ms); whole root flatten **fails** at the preserved 120,000-object safety limit |
| `Sample_design.gds` | 55 | 181 | 139 | 1 nm DBU | Root flatten succeeds: 1,693 shapes (~19 ms) |

The main file top cell is `2024-04-07_EITR2_1`. It references `chip0`, `chip1`, `chip2`, `chip3` at (-5000,+5000), (+5000,+5000), (-5000,-5000), (+5000,-5000) µm respectively, plus an auxiliary boolean cell. The reusable `Unnamed_b0465f83` contains 39,232 boundaries on GDS 2/0. A single chip root expands safely without changing global import limits.

The observed GDS layer/datatype pairs are `0/0`, `2/0`, `8/0` and `8/1`. **Material mapping is not established by layer numbers alone.** `chip2` is a GDS hierarchy name, not evidence that the chosen source cell is experimental qubit Q2.

### Reproduce a lossless single-chip selection

```sh
node scripts/transmon-gds-chip-extract.mjs \
  --input sample.gds --root chip2 --output chip2.gds \
  --expected-sha256 6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02 \
  --report chip2-report.json
```

This operation copies source GDS structure records byte for byte for the selected cell and all its transitive references. It does not redraw masks, approximate geometries, or relax the import budget. The selected root is in **cell-local coordinates**; the original reticle's SREF offset is not applied.

Verified `chip2.gds` output: 23 cells, 39,487 polygons, bounds [-5000,-5000] to [5000,5000] µm, SHA-256 `a41c01775172148c50e7e0a7c5d0f5bc54651e191a9ac5a5b7728d6a92be41e0`. Native WaferCAD `parseLayoutFile` imports the selected GDS in ~164 ms; **this is not a Workstation or Renderer visual acceptance**.

## Literature-derived process checkpoints

These are intended scientific baselines, not completed process geometry:

1. Intrinsic (100) Si wafer: 675 µm thick.
2. Sputter Nb: 200 nm.
3. Lithography and CF4 dry etch: measured total 250 nm depth, including ~50 nm silicon recess.
4. Double-layer resist: ~500 nm MMA and ~400 nm PMMA, with undercut.
5. First Al evaporation: 40 nm at 45° tilt and -45° planetary angle; static oxidation.
6. Second Al evaporation: 30 + 30 nm at 45° tilt, different planetary angles.
7. Ar milling / Al bandage / lift-off and final structure.

Supplementary Fig. S1(c) gives the Q2 Josephson junction mask size as 180 × 180 nm; Fig. S2(c) estimates a *fabricated* Q2 junction around 210 × 180 nm. These are different acceptance quantities.

## Acceptance and known gaps

- [x] Verify original binary GDS units, cells, layers, refs and SHA-256.
- [x] Reproduce full-chip hierarchy budget rejection, without changing its safety limit.
- [x] Select a chip via original GDS record preservation and verify imported element counts, bounds and units.
- [ ] Establish material interpretation for each GDS layer using the paper and geometric overlays.
- [ ] Locate Q2 unambiguously and compare its original mask to Supplementary Fig. S1.
- [ ] Rebuild Nb deposition, dry etch and Si recess and verify 200 nm/50 nm cross-sections.
- [ ] Check shadow evaporation, oxidation interface and lift-off against the process kernel; never claim unsupported process physics.
- [ ] Capture actual WaferCAD Chromium Mask, Section and 3D images; validate save/open and History/Recovery using normal origin.
- [ ] Final targeted CI, Quality and scientific release gates before requesting a merge.

The initial audit was run against an older offline source snapshot; the current `main` copies of `site/gds.js` and `site/layout-io.js` were independently checked to have the **same Git blob hashes** (`78afaeddfcb28887d6134853f9aaa436faf7da9b`, `7100985c7ad579daf6ca0e90adbbc0789cd85a39`). A complete latest-main local checkout and Chromium acceptance are still outstanding.


## Q2 original-GDS ROI and first native Nb Process replay

**Status: source-backed research candidate, not a released Example.** The original dataset is published by the authors (Zenodo v4: https://zenodo.org/records/14651787). No original binary author GDS is checked into WaferCAD; obtain it from Zenodo.

The `chip0`–`chip3` cells in the main GDS are *chip variants*, not transmons Q1–Q4. In author `chip2`, Q2 is the original SREF to `jj_width0p18` at **(1400, 2513) µm**, consistent with the 180 × 180 nm Q2 junction mask design in Supplementary Fig. S1. This has been checked against the source GDS cell hierarchy.

```sh
node scripts/transmon-gds-q2-roi.mjs \
  --input sample.gds --output transmon-Q2-ROI.gds --radius 500 \
  --expected-sha256 6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02 \
  --report transmon-Q2-ROI-report.json

node scripts/transmon-replay-nb-q2.mjs \
  --input transmon-Q2-ROI.gds \
  --output Transmon-Q2-Nb-etch.wafercad \
  --report Transmon-Q2-Nb-report.json
```

The author ROI selection does **not redraw any polygons**: it copies original GDS polygon records whose untransformed bounding boxes intersect the Q2 search window. Polygons crossing the requested ROI remain whole. Source SREF to Q2 and dependent structures are preserved. The resulting source-local Q2 GDS has SHA-256 `12e40565bab2f6c0841b5c3d051fcf38cc1e3c9deda5eaa53ab06cd70782f5e5`, **7 cells, 45 polygons**: 28 on `2/0`, 8 on `8/0`, and 9 on `8/1`; WaferCAD's own layout parser imports it. The exported bounding box can exceed the requested ROI because source polygon geometry is not clipped.

The initial reconstruction uses the `2/0` source patterns as Nb *removal* regions, based on correspondence with the shaded Nb-removal design shown in Supplementary Fig. S1. The interpretation is still subject to a final overlay/author-process check. The two `8/*` datatypes are reserved for EBL junction lithography; their exposure-dose assignments have **not** been proven.

### Verified first process checkpoint

- Starting substrate: intrinsic Si (100), 675 µm.
- Real native Process operation: blanket 200 nm Nb deposition.
- Real native Process operation: 250 nm directional etch through the translated and geometrically clipped source `2/0` mask, i.e. 200 nm Nb removal plus 50 nm Si recess.
- Model processRevision 2, 2 material regions. At model XY (0,0), Si top is 337.45 µm with no Nb; at (0,20), remaining Nb thickness is 0.2 µm above original Si top 337.5 µm.
- Full output project successfully passed strict schema validation, export serialization, storage expansion, and scientific readback. Output project SHA-256: `5ba6debaf54c6f0ebd6c38b1bd9b16633983fac5059744a51b0d5fa1c5eedf8f`.
- Focused tests with both author-provided GDS files: **8/8 passed**. Run them locally with:

```sh
WAFERCAD_TRANSMON_GDS=/path/to/sample.gds \
WAFERCAD_TRANSMON_Q2_ROI_GDS=/path/to/transmon-Q2-ROI.gds \
node --test site/tests/transmon-gds-chip-extract.test.mjs \
  site/tests/transmon-gds-q2-roi.test.mjs \
  site/tests/transmon-q2-nb-replay.test.mjs
```

- The existing `scripts/offline-native-app-capture.py` loaded the strictly validated project in an **isolated native Three.js** model viewport using Chromium + SwiftShader with ROI `[-125,-125,125,125]` µm and Z break `[337.7,336.8]` µm. Native mesh completed; 0 browser page errors. **Normal-origin loading was blocked by managed Chromium URL policy.** This is partial native Renderer evidence, **not** Mask/Section synchronization, Worker-backed Open, History/Recovery, or product visual acceptance.
- This first local Kernel diagnostic ran against the previously mounted source snapshot because the current `main` exact-SHA checkout is not available locally; the current-`main` `gds.js` and `layout-io.js` Git blobs match the snapshot, but `model.js` does not. Targeted process/scientific tests on the actual new branch baseline remain required before merge.

The project does not simulate Josephson shadow evaporation, lift-off, AlOx or the quantum electrical response. It is a **Nb + Si recess checkpoint** only. No manual CI or full Quality suite was run for this research iteration.

## Original Josephson junction double-dose mask verification

The author GDS source has also been checked at the **actual Q2 SREF** and in its native unrotated cell, using `scripts/transmon-junction-dose-audit.mjs` and `site/tests/transmon-junction-dose-audit.test.mjs`. This test uses the public source binary and does not create synthetic replacements for the final source measurement.

```sh
node scripts/transmon-junction-dose-audit.mjs \
  --input /path/to/Zenodo_files/sample.gds \
  --report q2-junction-dose-audit.json
WAFERCAD_TRANSMON_GDS=/path/to/Zenodo_files/sample.gds \
  node --test site/tests/transmon-junction-dose-audit.test.mjs
```

**Measured author mask facts:** `chip2` references `jj_width0p18` at (1400, 2513) µm with a 90° rotation, no reflection, unit magnification. Flattening the original `chip2` yields 39,487 polygons; all 17 nearby EBL polygons equal the native `jj_width0p18` geometry after that reference transform, matching their original vertices and layer/datatype identities. In the junction cell, `8/0` has 8 polygons with total union area 11.200000 µm², and `8/1` has 9 polygons with total area 11.201288 µm². Their Boolean intersection is zero.

**Dose-to-layer interpretation remains a hypothesis:** the `8/1` long connected junction strips geometrically correspond to the main lithographic pattern (1000 µC/cm² in the article). The `8/0` terminal regions plausibly correspond to the lower-dose undercut exposure (400 µC/cm²). Because the GDS contains no unambiguous exposure-dose metadata, this cannot yet be stated as an author-verified layer map. See Supplementary Fig. 1 and the Methods section; do not silently turn this hypothesis into a verified material/process assignment.

Local offline validation on the source snapshot: **3/3 new targeted tests passed**, including incorrect-rotation and overlapping-datatype counterexamples; Prettier 3.9.9 check passed. GitHub copies of both files were verified by their exact Git blob hashes. The complete current-branch checkout, WebGL Workstation, resist undercut geometry, actual 45° shadow evaporation, thin AlOx and lift-off **remain unverified/not implemented for this paper**. No simulated junction 3D result is claimed.

**Next scientific gate:** establish a generic material/process contract for two-layer MMA/PMMA relief, shadow occlusion and directional deposition at the specific `θ=45°`/`ϕ` angles in the paper, including selective clearing and bandage contact. Do not approximate this by non-shadowed conformal coating or falsely claim the existing Implant tilt models metal evaporation.
