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
