# M3D-LIME (Li et al., 2023): geometric reconstruction contract

**Source:** Y. Li et al., _Nature Communications_ **14**, 7140 (2023), DOI [10.1038/s41467-023-42981-1](https://doi.org/10.1038/s41467-023-42981-1).

**Builder:** `scripts/build-m3d-lime-example.mjs`; focus test: `node --test site/tests/m3d-lime-builder.test.mjs`.

**Scope:** first-pass, representative local **geometric** replay of a _fabricated M3D-LIME prototype_, not a transistor-level circuit simulator, original author GDS or a fully integrated/fully functional inference accelerator. Three functional tiers are required. The third tier contains both buffer and TCAM regions and **must not be counted as two separate tiers**.

## Corrected foundry/CIM chronology (2026-10-14 audit)

The main paper's **Fabrication of the M3D-LIME Chip** (pp. 7–8) states that foundry CMOS fabrication stops after M4 CMP with **exposed W top vias**. The second-tier RRAM begins immediately with TiN BE (30 nm) → HfAlOₓ (8 nm) → TaOₓ (45 nm) → TiN TE (30 nm), followed by patterning, then **400 nm SiO₂ passivation**, W TE vias and Al bit lines.

Earlier revisions inserted a second 400 nm SiO₂ deposition and another W-via fill **before** the analog RRAM. That order is unsupported by the Methods and was removed. The builder now uses a clearly tagged **100 nm M4 dielectric surrogate** with pre-existing exposed W landing pads for the unpublished foundry backend; the 100 nm value is an illustrative modeling assumption, not a claim about the actual chip. The exported Recipe still represents the surrogate geometry as editable actions and retains its source limitation.

The passivation and ILD CMP stop planes were recalibrated to this corrected base. Material thickness assertions and the browser Run All must pass again before the project file can be accepted.

## Source-mapped layer and process ledger

All lengths below are physical nanometres unless noted. The builder converts nm to internal micrometres. “Inferred” values are not fabrication claims.

| Tier               | Material/process                                                                                                | Source                        | Implementation / boundary                                                                                                                                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Si CMOS            | 130 nm foundry process stopped at M4 with exposed W vias                                                        | Main paper p. 7, Methods      | 2 µm Si substrate + inferred 100 nm M4 dielectric and exposed W landing state (not published CMOS FEOL or full routing)                                                  |
| CIM / analog 1T1R  | TiN BE 30 / HfAlOₓ RSL 8 / TaOₓ TEL 45 / TiN TE 30; HfAlOₓ ALD at 300°C                                         | Main pp. 3, 7, Fig. 2c        | Mask-local real film sequence; process temperature recorded in Step labels                                                                                               |
| CIM backend        | PECVD SiO₂ 400, W contacts + CMP, Al 500 BL, SiO₂ 100 / Si₃N₄ 900 + CMP                                         | Main pp. 7–8, Methods         | Film lengths sourced; CMP absolute Z values and local via/mask coordinates inferred                                                                                      |
| CNTFET             | Ti 10 / Pd 15 / Ti 1 gate; HfO₂ 10 at 250°C; wet transferred CNT; Ti 1 / Pd 45 source/drain                     | Main p. 8, Methods; SI Fig. 4 | CNT island drawn 20 µm W × 2.6 µm L to allow inferred 0.3 µm S/D overlap on both sides; the **uncovered active gap remains the reported 2 µm**; 1 nm film is a surrogate |
| CNTFET protection  | Y 10 nm naturally oxidized at 250°C to Y₂O₃; Al₂O₃ 35 / HfO₂ 10 at 250°C                                        | Main pp. 4, 8, Methods        | Oxidation as **Record**; Y₂O₃ geometry 10 nm surrogate, not predicted grown-oxide thickness                                                                              |
| Buffer / 2T2R TCAM | Pd BE / TaOₓ 20 / Ta₂O₅ 10 / Pt 10; Pd hard-mask 60; Al₂O₃ protection 45 at 150°C; Ti 20 / Pd 120 interconnects | Main pp. 4, 8, Methods        | One top-tier process for both buffer and TCAM; Pd hard-mask and dry etch are **Record** because surviving final mask is unspecified                                      |

For detailed source circuit topology see **main Fig. 1b–3** and **Supplementary Fig. 1, 4 and 6**. The 1k-bit CIM in Fig. 2 has 8 BL × 128 SL, and a 512-bit 1T1R buffer is stacked in the third tier alongside the fabricated 5 × 1 2T2R TCAM. The generator preserves these as _documented design context_, with **eight analog CIM sites, four digital buffer sites and all five local TCAM cells** explicitly materialized. It must never claim to materialize the full 1k+512-bit arrays.

## Unpublished/assumed information

- The authors' precise GDS/OASIS, unit pitches, full M4 logic layout, pad shapes, local via XY alignment, metal routing, and full-chip placements are **not supplied** by the article or supplement. The exported layout is an illustrative geometric inference with eleven intentionally named Mask layers.
- The paper provides a structural TEM, but no complete transistor-by-transistor CMOS process stack. The 2 µm Si body is a visualization device; it is not a reported CMOS substrate thickness.
- The 130 nm foundry CMOS processing ends after M4 CMP with **already exposed W vias**. A 100 nm M4 dielectric and the local W via footprints are inferred to reproduce this _starting state_; the paper does not describe their film thickness or additional BEOL deposition. The only reported 400 nm SiO₂ deposition follows the patterned analog RRAM, before the W TE contacts.
- The modeled CIM-passivation and ILD CMP targets (Z = 1.28 and 2.05 µm relative to the illustrative silicon substrate midpoint) are geometric closure assumptions, **not** reported metrology.
- The nominal CNTFET 2 µm channel is the **edge-to-edge source/drain separation**; the 0.3 µm contact overlaps, 1.2 µm source width, and 1.8 µm drain/Pd BE landing width are inferred and intentionally separate from the source-reported dimensions. The gate polygon spans the full uncovered channel.
- Dense CNT nanotube film morphology and CNT/oxide electrostatics are not simulated. Thin CNT is represented as a contiguous 1 nm film solely for inspecting material ownership.
- Y oxidation chemistry and possible volume expansion are **not** simulated by the Process Kernel.
- CIM-to-buffer _electrical interlayer via connections_ are not geometrically proven. The paper's Fig. 1b itself omits these ILVs. Their fabrication is recorded, while local device examples remain physically distinguishable.
- The fabricated prototype relies on **off-chip** ADC/programming/read circuitry, with no on-chip TCAM sense amplifier; do not insert those as fabricated structures. See paper discussion and public peer review file (reviewer 1 responses 1/5).
- Hardware accuracy, Hamming-distance, CNN execution time and energy-efficiency values are from measurements combined with system-level simulation. WaferCAD models **geometry** and cannot recalculate those metrics.

## Generation and acceptance

Run on a checkout of the feature branch:

```bash
node scripts/build-m3d-lime-example.mjs
node --test site/tests/m3d-lime-builder.test.mjs
node scripts/build-m3d-lime-example.mjs --write-repo
npm run check
```

`--write-repo` deterministically generates the committed `site/examples/m3d-lime-rram-cntfet.wafercad`. The generator validates each material stage with the real Process Kernel, recipe preflight, project schema and a storage round-trip before writing. The dedicated CI workflow also loads the file into the real UI v2 Chromium Workstation, runs the full Recipe from a fresh Base and exports and reopens the resulting project. The browser also exports all 11 inferred Mask layers to GDSII and OASIS and checks lossless layer/polygon XY bounds at 1 nm resolution; this is a representative geometry acceptance, **not** full-array or exact-layout verification. Do not add this family to `site/bundled-examples.js` or claim it is deployed before the remaining source/visual/release gates are satisfied.

The builder enforces 2 µm source/drain gap and complete active gate coverage for **all 14 CNTFETs**. A paper-informed, locally framed 9 µm Section A–B now passes through one vertically aligned analog CIM cell and a CNTFET/digital RRAM. The 3D inspection ROI focuses that local cross-section (clear ROI to inspect the full 8-CIM/4-buffer/5-TCAM representative sample). The builder also verifies strict adjoining material interfaces across CMOS W→CIM TiN, CIM TiN→W→Al, and Pd drain→TaOₓ→Ta₂O₅→Pt→Ti→Pd. Their original routing polygons are still inferred. Browser project Open, actual Recipe `Run All`, and project Export/Reopen passed on the representative local device in the [M3D-LIME acceptance run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38532631408). The 3-tier Section regression now checks the actual physical Z thicknesses, including the 8 nm HfAlOₓ RSL, 20 nm TaOₓ reservoir, 10 nm Ta₂O₅ RSL, 10 nm Pt electrode and 1 nm CNT display surrogate. The separate v2 browser acceptance exports **all 11 inferred Mask layers (130 polygons)** using the real GDSII and OASIS workers; each file is re-parsed and checked for preserved layer IDs, polygon counts and nanometre-grid XY boundaries. The full exports intentionally differ from the three initially highlighted inspection layers. These checks prove internal format interoperability only, not correspondence with any author-supplied GDS. Next, inspect TEM-to-Section correspondence and local wiring continuity, and consider canonical array translation to reconstruct the complete 1Kb CIM / 512-bit Buffer only after bounding the runtime. A previous full-wafer Section with 210 µm XY span displayed Z exaggeration ×64.4; the default local Section reduces this presentation distortion without changing physical Z. Dedicated Section/3D TEM-to-geometry visual acceptance, accurate inferred routing, full-array replay and a real preview/thumbnail remain **unpassed publication gates**.

## Supplementary Fig. 6 structural topology audit (October 14, 2026)

Supplementary Fig. 6a shows the Ta₂O₅ RRAM pillar **laterally separated** from the CNTFET active channel, with an intervening Pd electrode/landing path. The original local mask polygons and exact lateral clearance are not disclosed. Earlier local reconstructions let the digital RRAM overlap 0.2 µm of the drawn CNT island in X; the updated representative layout moves it beyond the active CNT island and extends the inferred Pd drain/bottom-electrode landing to support the new footprint. The **0.45 µm lateral clearance** is an illustrative hypothesis, **not** a TEM-derived measurement. The lithographic masks and real Process Kernel must independently verify that TaOₓ/Ta₂O₅/Pt grows on Pd and cannot overlap the CNT island, without inserting a disconnected digital RRAM stack. Orientation in XY is not asserted to match the microscope image.

The physical structure is still a source-constrained local *illustration*, not an atomically or lithographically accurate reconstruction. The unresolved gate-contact openings, 1 nm CNT geometric surrogate, Y₂O₃ oxidation expansion, inter-tier ILVs, original CMOS foundry FEOL and full-chip routing remain outside its demonstrated fidelity.

## Independent KLayout export check (October 14, 2026)

The dedicated [M3D-LIME CI run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38552197672) imported browser-exported `full-inferred-mask.gds` and `full-inferred-mask.oas` using **KLayout Python 0.30.12**. The external reader verified all 11 inferred layers, all 130 original rectangles, layer/datatype identities, and the complete physical polygon bounds on a canonical 1 nm grid.

- GDSII DBU: 0.0001 µm.
- OASIS DBU: 0.00005 µm.
- CNTFET channel width: 20 µm in both formats.
- Source/drain active length: 2 µm in both formats.
- Inferred source overlap: 0.3 µm in both formats.

Distinct GDS/OAS DBUs are valid; directly XORing database-grid polygons across different DBUs is not a valid geometry test. The verifier compares physical-coordinate polygons instead. This is an **external format interoperation** check for WaferCAD's inferred layout, **not** independent confirmation of the authors' unpublished original GDS or mask placement.

## Working branch and status

- Branch: `feat/m3d-rram-cntfet-lime-20261014`.
- Committed deliverables: source ledger, real Kernel builder and regression, eleven inferred mask layers, fully editable Recipe and matching History nodes with nine bookmarks, and the generated representative `.wafercad` asset.
- Dedicated Kernel and UI v2 Chromium acceptance passed for the local sample; the complete CI Quality gate and desktop/human visual acceptance are tracked separately on Draft PR [#226](https://github.com/Xiaolong-6/WaferCAD/pull/226).
- Recipe **Rebuild Base → Run All** now retains a valid pre-existing physical Section A–B (including the paper-aligned local slice); the UI v2 and legacy Base controllers share this policy, while a manual Base change or an out-of-bounds Section still selects a centered default. Browser-level persistence is a required CI assertion.
- No proof of full array connectivity, original lithographic coordinates, device performance or electrical simulation is claimed.
