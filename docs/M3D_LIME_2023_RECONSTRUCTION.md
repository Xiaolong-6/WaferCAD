# M3D-LIME (Li et al., 2023): geometric reconstruction contract

**Source:** Y. Li et al., _Nature Communications_ **14**, 7140 (2023), DOI [10.1038/s41467-023-42981-1](https://doi.org/10.1038/s41467-023-42981-1).

**Builder:** `scripts/build-m3d-lime-example.mjs`; focus test: `node --test site/tests/m3d-lime-builder.test.mjs`.

**Scope:** first-pass, representative local **geometric** replay of a _fabricated M3D-LIME prototype_, not a transistor-level circuit simulator, original author GDS or a fully integrated/fully functional inference accelerator. Three functional tiers are required. The third tier contains both buffer and TCAM regions and **must not be counted as two separate tiers**.

## Corrected foundry/CIM chronology (2026-10-14 audit)

The main paper's **Fabrication of the M3D-LIME Chip** (pp. 7–8) states that foundry CMOS fabrication stops after M4 CMP with **exposed W top vias**. The second-tier RRAM begins immediately with TiN BE (30 nm) → HfAlOₓ (8 nm) → TaOₓ (45 nm) → TiN TE (30 nm), followed by patterning, then **400 nm SiO₂ passivation**, W TE vias and Al bit lines.

Earlier revisions inserted a second 400 nm SiO₂ deposition and another W-via fill **before** the analog RRAM. That order is unsupported by the Methods and was removed. The builder now uses a clearly tagged **100 nm M4 dielectric surrogate** with pre-existing exposed W landing pads for the unpublished foundry backend; the 100 nm value is an illustrative modeling assumption, not a claim about the actual chip. The exported Recipe still represents the surrogate geometry as editable actions and retains its source limitation.

The passivation and ILD CMP stop planes were recalibrated to this corrected base. Material thickness assertions and the real-browser 46-step Run All passed again in the [October 15 native-ALD acceptance run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38700722241); the absolute CMP endpoints remain inferred.

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

The physical structure is still a source-constrained local _illustration_, not an atomically or lithographically accurate reconstruction. The unresolved gate-contact openings, 1 nm CNT geometric surrogate, Y₂O₃ oxidation expansion, inter-tier ILVs, original CMOS foundry FEOL and full-chip routing remain outside its demonstrated fidelity.

## Independent KLayout export check (October 14, 2026)

The dedicated [M3D-LIME CI run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38552197672) imported browser-exported `full-inferred-mask.gds` and `full-inferred-mask.oas` using **KLayout Python 0.30.12**. The external reader verified all 11 inferred layers, all 130 original rectangles, layer/datatype identities, and the complete physical polygon bounds on a canonical 1 nm grid.

- GDSII DBU: 0.0001 µm.
- OASIS DBU: 0.00005 µm.
- CNTFET channel width: 20 µm in both formats.
- Source/drain active length: 2 µm in both formats.
- Inferred source overlap: 0.3 µm in both formats.

Distinct GDS/OAS DBUs are valid; directly XORing database-grid polygons across different DBUs is not a valid geometry test. The verifier compares physical-coordinate polygons instead. This is an **external format interoperation** check for WaferCAD's inferred layout, **not** independent confirmation of the authors' unpublished original GDS or mask placement.

## Direct screenshot / ALD fidelity audit (October 14, 2026)

- The supplied four-view screenshot shows a substrate-dominated 3D slab and a block-like Section; **it does not meet TEM morphology acceptance**.
- In the latest [automated browser evidence](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38569363465), one half-cell is framed using an inspection-only 10 × 24 µm ROI and a closer camera. This improves framing, but the 2 µm **illustrative CMOS body** still dominates 3D and the image is not a credible match to a 200 nm-scale TEM cut.
- At the October 14 audit, the earlier fixture had **136 conformal-sidewall region segments** from the 10 nm HfO₂ gate oxide, 35 nm Al₂O₃ and 10 nm HfO₂ passivation stages, plus 30 material layers and 167 XY regions. This count describes the **superseded fixture**; the October 15 corrected project has 30 material layers and **233 XY regions**.
- At the October 14 audit, the paper's **45 nm ALD Al₂O₃ top RRAM passivation** failed safely during full conformal replay with a **2.43 × 10⁻⁷ µm² XY-owner overlap** (approximately 0.243 nm²). The **then-current** fixture used an explicitly disclosed directional geometry surrogate. This is a historical finding; native conformal replay was restored on October 15 under a bounded postcoat-only grid-fragment rule (below), **without globally relaxing material-overlap rejection**.
- Gate contact etching and CMOS-to-top-tier ILVs are **process records without complete 3D geometry**. The paper does not disclose their full local mask coordinates; do not represent the entire three-tier circuit as electrically continuous.
- Morphology comparison to Fig. 2c–d and Supplementary Fig. 6a remains a **separate blocking visual/scientific gate**, beyond successful Recipe replay, mask interoperability and geometry schema tests.

## Inferred PVD drain step coverage (October 15, 2026)

The final Recipe represents Pd drain **evaporation**, not Pd ALD. The source does not
report a deposition angle or sidewall coverage fraction at the 26 nm Ti/Pd/Ti
back-gate step. The earlier ideal-directional Kernel model left a 10 nm-wide
HfO₂ wall column uncoated by the Pd, making all 14 CNTFET-to-digital-RRAM Pd
connections _electrically discontinuous_ even though their mask footprints
overlapped and the RRAM vertical stack was correct.

**October 16 exact-sidewall regression:** The initial 72-point path sampler
could jump over the 10 nm HfO₂ wall. Independent decoding of the first
post-PVD project showed that **12 of 14** gate-edge sites still lacked Pd
although the sparse samples passed. The fault was a merged XY geometry
owner whose broad bounding box masked its disjoint 10 nm strips. The
acceptance test now checks all 14 physical gate-edge positions at 5 nm
inside the gate, 5 nm into the sidewall, and 15 nm beyond the edge.
The masked strips are classified separately by effective material-band
width, and each requires the 11.25 nm Pd surrogate plus more than 10 nm
physical Z overlap to both adjacent metal sections. A green generic
path-sampling test alone is **not** sufficient evidence.

The opt-in `pvd-step` coverage mode is an explicitly **inferred
finite-angular-spread approximation**: normal horizontal surfaces receive the
source-reported 45 nm nominal Pd film, while eligible narrow HfO₂ wall
columns receive a sidewall-cap bridge equal to **25% of the nominal deposited
thickness (11.25 nm)**. Only wall columns no wider than the specified
fractional thickness are eligible. This is a geometric connectivity surrogate,
**not** a measurement of evaporated Pd step coverage, a claim that Pd grows by
ALD, or a predicted TEM morphology. In particular, the narrow cap is a
2.5D occupancy approximation rather than a resolved deposition-angle solver.

The local reconstruction must validate an unbroken overlapping Pd Z interval
through every CNTFET's gate-edge crossing, with **more than 10 nm of common
metal Z height** at each sampled lateral transition, in addition to the
existing mask, nano-film, native 45 nm Al₂O₃ ALD and recipe/history contracts.
This is an explicit ideal-contact acceptance requirement for the surrogate:
a 45 nm Pd layer stepping down across a 26 nm gate has at most 19 nm Z
overlap between the two full horizontal films. The earlier browser demand
for more than 25 nm was therefore geometrically impossible, even with
perfect sidewall coverage; the new 10 nm minimum remains below the modeled
11.25 nm wall bridge and is checked without skipping any sample. A green CI
proves internal model consistency under this documented hypothesis; it does
not prove the authors' unpublished contact-pad layout, original GDS, or
measured device connectivity.

## Native 45 nm ALD closure (October 15, 2026)

- The canonical `site/examples/m3d-lime-rram-cntfet.wafercad` was regenerated and committed from the real Kernel, rather than hand-modified. It contains **46 editable Recipe steps**, **47 process nodes**, **30 material layers** and **233 XY process regions**, with the eleven explicitly inferred Mask layers. The file's actual `recipe-step-42` deposits **45 nm Digital Al₂O₃ passivation with `coverage: conformal`**, followed by a selective **45 nm Pt-opening etch** at `recipe-step-43`. The old directional surrogate is no longer the current representation.
- The isolated, pre/post-ALD Kernel regression now produces a valid **physical 45 nm upper film and conformal sidewalls** (72 sidewall region segments at the ALD checkpoint), while asserting rollback integrity on rejection. The geometric fix is deliberately scoped to **bounded near-grid disconnected fragments during Conformal postcoat normalization**: deterministic region ownership partitioning is permitted only inside this context. Precoat ambiguity, extended seams and material overlaps above the existing tiny-grid bound continue to fail their explicit regression tests.
- The generator validates real Process stages, final contact topology, project serialization and Recipe/History round-trip; CI additionally checks the checked-in artifact byte-for-byte against its deterministic rebuild. Passing these checks establishes **internal geometric and persistence correctness**, not exact ALD corner morphology at TEM resolution, electrically proven ILVs, or original-author layout fidelity.
- The [October 15 native-ALD acceptance run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38700722241) passed the actual v2 browser Open, local Section capture, 3D visibility check, 46-step Recipe Run All, Section A–B preservation and exported-project round-trip. Browser-exported GDSII and OASIS independently passed KLayout Python 0.30.12 for all **11 inferred layers and 130 rectangles**; the checked-in Conformal artifact rebuilt byte-for-byte. The Section evidence used a 9 µm local span and **Z:X display magnification ×4.40**. Its capture and the automated 3D view still show a simplified, substrate-dominated depiction, so automated visibility is **not** a match to **main Fig. 2c–d / Supplementary Fig. 6a**. Human TEM-to-Section morphology review and adequate local 3D scientific framing remain **unpassed release gates**.

## Working branch and status

- Branch: `feat/m3d-rram-cntfet-lime-20261014`.
- Committed deliverables: source ledger, real Kernel builder and regression, eleven inferred mask layers, fully editable Recipe and matching History nodes with nine bookmarks, and the generated representative `.wafercad` asset.
- The regenerated native-ALD project passed isolated ALD rollback, deterministic Kernel rebuild, full v2 Chromium Run All/Export-Reopen, physical mask GDSII/OASIS plus external KLayout and Quality checks on [the October 15 green run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38700722241). Its CI evidence includes a local Section screenshot, a 3D overview and machine-readable validation results. **Paper-to-geometry morphology and usable local 3D visual presentation have not passed**; Draft PR [#226](https://github.com/Xiaolong-6/WaferCAD/pull/226) remains blocked on scientific/visual review rather than Kernel or persistence CI.
- Recipe **Rebuild Base → Run All** now retains a valid pre-existing physical Section A–B (including the paper-aligned local slice); the UI v2 and legacy Base controllers share this policy, while a manual Base change or an out-of-bounds Section still selects a centered default. Browser-level persistence is a required CI assertion.
- No proof of full array connectivity, original lithographic coordinates, device performance or electrical simulation is claimed.
