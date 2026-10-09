# MAGIC-1000 MoS2 bit-parallel computer — paper-derived local reconstruction

**Source**: Dongxu Fan et al., *A bit-parallel molybdenum disulfide computer built through multi-level co-optimization*, Nature Electronics **9**, 887–896 (2026), DOI [10.1038/s41928-026-01641-0](https://doi.org/10.1038/s41928-026-01641-0), main text Fig. 1a/d/e/f and Methods p. 893. Source supplemental PDF includes an extended standard-cell layout table, but **does not provide the complete author GDS**.

## Reproduction target and scientific honesty

This example reconstructs **a representative 40 × 24 µm local cross-section** with four Al interconnect levels (M4→M1), V34/V23/V12/top gate vias, a planarized W bottom gate, HfO2 dielectric, transferred monolayer MoS2, Sb/Au contacts and local D-mode AlOx. Its second device remains E-mode. It is **not** a reproduction of the full 1,433-transistor chip and makes no circuit-operation, power, speed, measured topography, dopant activation or yield claim.

Paper-derived numerical process inputs (µm units inside WaferCAD):
- Isolation: 300 nm SiO2.
- M4→M1: Ti (10 nm)/TiN (20 nm)/Al (250 nm)/TiN (20 nm)/Ti (10 nm), bottom-up M4 then M3, M2, M1.
- Vias: tungsten fill following TiN liners in the paper; W fill represented as one material here.
- Gate: 400 nm W, planarized; HfO2 ALD 10 nm.
- Channel length (contact spacing used in mask layout): 0.5 µm.
- Contacts: Sb 20 nm / Au 40 nm.
- PMMA removal / anneal: 350 °C, 30 min, 5% H2 forming gas (Record only).
- The MoS2 D-mode is produced by patterned sub-stoichiometric AlOx, represented as a **geometric surrogate plus Electrical Region**. This does not predict a threshold shift.

**Inferred/non-source geometry** (all labeled in generator validation): 2 µm Si handle preview thickness; 40 × 24 µm local window; routing rectangles and via positions; 0.4 µm ILD clearance, 0.9 µm ILD deposition before CMP; monolayer MoS2 display thickness 0.7 nm; patterned AlOx surrogate thickness 10 nm. No original layer placement or mask coordinates were available, so the rectangles are schematic. HfO2 gate-access contact etch is **Record only**, not an invented cut through the active transistor region. Transferred film is patterned directly through the captured transfer mask. Doping physics, atomic defects, roughness below 800 pm and E/D-mode circuit electrical behavior are outside this geometric reconstruction.

## Generate and validate

From the repo root:

    npm ci
    node scripts/build-magic-1000-example.mjs --write-repo
    node --test site/tests/magic1000-reconstruction.test.mjs

This generator uses the **actual current Process Geometry Kernel**, not handcrafted final model JSON. It creates History nodes for every physical/record process, named process-stage bookmarks, a complete normalized executable Recipe with Base dimensions and mask selection contexts, and a file-mask layout with per-process GDS/OAS-exportable layer/datatype. Output is:

- site/examples/magic-1000-mos2-beol.wafercad
- test-results/magic1000/validation.json

The test validates every intermediate model, full silicon-footprint coverage, selective stop of each via etch, via-fill and CMP continuity, transferred MoS2 support, lossless project reopening, Recipe preflight and GDS/OASIS mask roundtrips. **In-browser Run All and 3D/Section screenshot comparison remain separate acceptance gates** and must be reported, not silently assumed, even if this generator passes. These checks are required before listing the project as an accepted Welcome example.

## Acceptance criteria for promotion

1. Build from an empty Base, all authored Recipe steps run in order, and real browser **Rebuild Base first → Run all** yields the same canonical model.
2. Export all mask layers to GDS and OAS, reopen both files and compare mask geometry.
3. Compare the final local Section with Fig. 1e/f to verify material order (not exact unpublished dimensions).
4. Inspect the via-fill and CMP steps in Section/3D for internal thin sheets, cracks, arbitrary slits and buried-face leaks.
5. Verify D-mode annotation is **not** interpreted as predictive doping simulation.
6. Only after these gates pass, add a real project preview/thumbnail and Welcome catalog entry. Do not substitute a manuscript figure for a WaferCAD-rendered preview.
