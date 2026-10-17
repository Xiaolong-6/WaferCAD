# M3D-LIME (Li et al., 2023): geometric reconstruction contract

**Source:** Y. Li et al., _Nature Communications_ **14**, 7140 (2023), DOI [10.1038/s41467-023-42981-1](https://doi.org/10.1038/s41467-023-42981-1).

**Builder:** `scripts/build-m3d-lime-example.mjs`; focus test: `node --test site/tests/m3d-lime-builder.test.mjs`.

**Scope:** first-pass, representative local **geometric** replay of a _fabricated M3D-LIME prototype_, not a transistor-level circuit simulator, original author GDS or a fully integrated/fully functional inference accelerator. Three functional tiers are required. The third tier contains both buffer and TCAM regions and **must not be counted as two separate tiers**.

## Experimental metal Match Line routing — NOT YET ACCEPTED (October 17, 2026)

**Source:** Li et al., *Nature Communications* 14, 7140 (2023), Fig. 3b and the TCAM discussion. The ten TCAM RRAM **Pt top electrodes** share the match line (ML); the four buffer RRAM contacts must **not** join ML. During pre-charge the separate CNTFET **source** is driven to 1 V and the **drain** supplies the ML node. All access-drain signal-line (SL), complementary SEL gates, bias and external-pads remain separate unmodeled nets.

The experimental routing branch introduces one inferred 0.4 µm-wide ML bus at Y=[-2,-1] µm, five inferred vertical trunks reaching the ten 2T2R Pt contacts, and a spur at X=[47,47.4] µm to a dedicated pre-charge **drain** contact opening at X=[47,47.4], Y=[-14.5,-13.5] µm. It retains all fourteen original Pt contact footprints, uses the **same sourced Ti 20 nm / Pd 120 nm interconnect deposition** (Mask 21) for the linked ML, and keeps the four sampled buffer contacts isolated. A distinct Mask 22 sequentially opens the 45 nm digital Al₂O₃ plus 10 nm HfO₂, 35 nm Al₂O₃ and inferred 10 nm Y₂O₃ at the drain. These mask XY coordinates, bus width, opening footprint and via etch assumptions are **illustrative**, not foundry GDS or measured dimensions.

Pre-change, actual source-generated project profiles were inspected at the RRAM top contact (Z=2.286 µm), routed oxide field (Z=2.160 µm) and capped pre-charge drain (Z=2.206 µm): these **126 nm and 46 nm elevation differences** make two-dimensional continuity checks insufficient. The source/test branch therefore requires (1) a single connected 10-RRAM ML planar conductor component; (2) four independent buffer stubs and isolation from the +1 V pre-charge source; (3) exact Pt→Ti→Pd and pre-charge drain Pd→Ti→Pd material adjacencies without interposed oxide; (4) greater than 10 nm overlapping Pd intervals throughout each physical routed trunk, bus and spur; (5) deterministic editable Recipe/History and real Chromium GDS/OAS KLayout + Section/3D evidence. **As written these are design/test requirements, not a statement that the new Kernel results have passed.** Do not merge this branch into PR #226 or claim a functional TCAM while these gates remain unverified.

This effort intentionally does **not** model measured CNTFET I–V, RRAM state switching, SL/SEL network, source-supply rails, original foundry wiring or the sense-amplifier function. A connected idealized three-dimensional material stack supports only a geometric-conductivity hypothesis, not fabricated device conductance or measured Hamming-distance timing.

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

For detailed source circuit topology see **main Fig. 1b–3** and **Supplementary Fig. 1, 4 and 6**. The 1k-bit CIM in Fig. 2 has 8 BL × 128 SL, and a 512-bit 1T1R buffer is stacked in the third tier alongside the fabricated 5 × 1 2T2R TCAM. The generator preserves these as _documented design context_, with **eight analog CIM sites, four digital buffer sites and five local 2T2R TCAM cells (ten CNTFETs)** explicitly materialized. The paper also describes a separate CNTFET **pre-charge transistor** for the 5 × 1 TCAM. In the pre-charge extension, the local geometry includes **15 CNTFETs: 10 TCAM access + 4 buffer + 1 inferred ML pre-charge device**, while digital RRAM remains confined to the original **14 access drains**. The transistor is not evidence of a complete ML supply/control circuit. It must never claim to materialize the full 1k+512-bit arrays or the complete fabricated TCAM peripheral circuit.

## Unpublished/assumed information

- The authors' precise GDS/OASIS, unit pitches, full M4 logic layout, pad shapes, local via XY alignment, metal routing, and full-chip placements are **not supplied** by the article or supplement. The exported layout is an illustrative geometric inference with eleven intentionally named Mask layers.
- The paper provides a structural TEM, but no complete transistor-by-transistor CMOS process stack. The 2 µm Si body is a visualization device; it is not a reported CMOS substrate thickness.
- The 130 nm foundry CMOS processing ends after M4 CMP with **already exposed W vias**. A 100 nm M4 dielectric and the local W via footprints are inferred to reproduce this _starting state_; the paper does not describe their film thickness or additional BEOL deposition. The only reported 400 nm SiO₂ deposition follows the patterned analog RRAM, before the W TE contacts.
- The modeled CIM-passivation and ILD CMP targets (Z = 1.28 and 2.05 µm relative to the illustrative silicon substrate midpoint) are geometric closure assumptions, **not** reported metrology.
- The nominal CNTFET 2 µm channel is the **edge-to-edge source/drain separation**; the 0.3 µm contact overlaps, 1.2 µm source width, and 1.8 µm drain/Pd BE landing width are inferred and intentionally separate from the source-reported dimensions. The gate polygon spans the full uncovered channel.
- Dense CNT nanotube film morphology and CNT/oxide electrostatics are not simulated. Thin CNT is represented as a contiguous 1 nm film solely for inspecting material ownership.
- Y oxidation chemistry and possible volume expansion are **not** simulated by the Process Kernel.
- CIM-to-buffer _electrical interlayer via connections_ are not geometrically proven. The paper's Fig. 1b itself omits these ILVs. Their fabrication is recorded, while local device examples remain physically distinguishable.
- The fabricated 5 × 1 2T2R TCAM includes a **pre-charge CNTFET** for the match line, explicitly described alongside Fig. 3b. The pre-charge extension adds a separate **fifteenth CNTFET** with the reported active channel dimensions but **inferred location and contact footprints**, outside the fourteen RRAM cells. Continuous ML/SL/SEL wiring, pre-charge gate control and its supply remain **unreconstructed**, so the extra physical transistor does not establish a working TCAM circuit.
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

The builder checks a 2 µm active source/drain gap and gate coverage for **14 access CNTFETs plus one inferred ML pre-charge CNTFET**. Digital-RRAM connectivity checks remain restricted to the **14 actual RRAM drain sites**. A paper-informed, locally framed 9 µm Section A–B now passes through one vertically aligned analog CIM cell and a CNTFET/digital RRAM. The 3D inspection ROI focuses that local cross-section (clear ROI to inspect the full 8-CIM/4-buffer/5-TCAM representative sample). The builder also verifies strict adjoining material interfaces across CMOS W→CIM TiN, CIM TiN→W→Al, and Pd drain→TaOₓ→Ta₂O₅→Pt→Ti→Pd. Their original routing polygons are still inferred. Browser project Open, actual Recipe `Run All`, and project Export/Reopen passed on the representative local device in the [M3D-LIME acceptance run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38532631408). The 3-tier Section regression now checks the actual physical Z thicknesses, including the 8 nm HfAlOₓ RSL, 20 nm TaOₓ reservoir, 10 nm Ta₂O₅ RSL, 10 nm Pt electrode and 1 nm CNT display surrogate. The separate v2 browser acceptance exports **all 11 inferred Mask layers (130 polygons)** using the real GDSII and OASIS workers; each file is re-parsed and checked for preserved layer IDs, polygon counts and nanometre-grid XY boundaries. The full exports intentionally differ from the three initially highlighted inspection layers. These checks prove internal format interoperability only, not correspondence with any author-supplied GDS. Next, inspect TEM-to-Section correspondence and local wiring continuity, and consider canonical array translation to reconstruct the complete 1Kb CIM / 512-bit Buffer only after bounding the runtime. A previous full-wafer Section with 210 µm XY span displayed Z exaggeration ×64.4; the default local Section reduces this presentation distortion without changing physical Z. Dedicated Section/3D TEM-to-geometry visual acceptance, accurate inferred routing, full-array replay and a real preview/thumbnail remain **unpassed publication gates**.

## Supplementary Fig. 6 structural topology audit (October 14, 2026)

Supplementary Fig. 6a shows the Ta₂O₅ RRAM pillar **laterally separated** from the CNTFET active channel, with an intervening Pd electrode/landing path. The original local mask polygons and exact lateral clearance are not disclosed. Earlier local reconstructions let the digital RRAM overlap 0.2 µm of the drawn CNT island in X; the updated representative layout moves it beyond the active CNT island and extends the inferred Pd drain/bottom-electrode landing to support the new footprint. The **0.45 µm lateral clearance** is an illustrative hypothesis, **not** a TEM-derived measurement. The lithographic masks and real Process Kernel must independently verify that TaOₓ/Ta₂O₅/Pt grows on Pd and cannot overlap the CNT island, without inserting a disconnected digital RRAM stack. Orientation in XY is not asserted to match the microscope image.

The physical structure is still a source-constrained local _illustration_, not an atomically or lithographically accurate reconstruction. The former gate-edge Pd gaps are now closed only in the uncalibrated `pvd-step` geometric surrogate. Empirically calibrated Pd coverage, the 1 nm CNT surrogate, Y₂O₃ oxidation expansion, inter-tier ILVs, original CMOS foundry FEOL and full-chip routing remain outside the demonstrated fidelity.

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

- The canonical `site/examples/m3d-lime-rram-cntfet.wafercad` was regenerated and committed from the real Kernel, rather than hand-modified. It contains **46 editable Recipe steps**, **47 process nodes**, **30 material layers** and **239 XY process regions**, with the eleven explicitly inferred Mask layers. The file's actual `recipe-step-42` deposits **45 nm Digital Al₂O₃ passivation with `coverage: conformal`**, followed by a selective **45 nm Pt-opening etch** at `recipe-step-43`. The old directional surrogate is no longer the current representation.
- The isolated, pre/post-ALD Kernel regression now produces a valid **physical 45 nm upper film and conformal sidewalls** (72 sidewall region segments at the ALD checkpoint), while asserting rollback integrity on rejection. The geometric fix is deliberately scoped to **bounded near-grid disconnected fragments during Conformal postcoat normalization**: deterministic region ownership partitioning is permitted only inside this context. Precoat ambiguity, extended seams and material overlaps above the existing tiny-grid bound continue to fail their explicit regression tests.
- The generator validates real Process stages, final contact topology, project serialization and Recipe/History round-trip; CI additionally checks the checked-in artifact byte-for-byte against its deterministic rebuild. Passing these checks establishes **internal geometric and persistence correctness**, not exact ALD corner morphology at TEM resolution, electrically proven ILVs, or original-author layout fidelity.
- The [October 15 native-ALD acceptance run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38700722241) passed the actual v2 browser Open, local Section capture, 3D visibility check, 46-step Recipe Run All, Section A–B preservation and exported-project round-trip. Browser-exported GDSII and OASIS independently passed KLayout Python 0.30.12 for all **11 inferred layers and 130 rectangles**; the checked-in Conformal artifact rebuilt byte-for-byte. The Section evidence used a 9 µm local span and **Z:X display magnification ×4.40**. Its capture and the automated 3D view still show a simplified, substrate-dominated depiction, so automated visibility is **not** a match to **main Fig. 2c–d / Supplementary Fig. 6a**. Human TEM-to-Section morphology review and adequate local 3D scientific framing remain **unpassed release gates**.

## Native desktop docking CI integration (October 16, 2026)

The M3D-LIME branch was brought up to date with Main's native desktop
Overview/Dock shell. The old `view:mask` and `view:three` browser actions
are not desktop navigation contracts in that shell. The tested four-file
Playwright adapter from [PR #288](https://github.com/Xiaolong-6/WaferCAD/pull/288)
was therefore incorporated into **this feature branch only**, with no merge
to Main. It checks real panel visibility in the desktop Overview and retains
the existing mobile/Single behavior. The original 1 µm² Mask process area,
0.125 µm film, 6400-instance renderer isolation, and M3D Welcome 36-step
History / reversible Border invariants remain mandatory. Previous targeted
CI on the adapter alone passed; final combined-HEAD acceptance is required
before calling the overall PR green.

The latest representative `.wafercad` retains 46 Recipe operations,
47 History process nodes and 30 material layers, with **239 final XY regions**
after the corrected, explicitly inferred 11.25 nm partial PVD bridge. All
14 modeled CNTFET gate-edge locations have a locally continuous Pd segment
under that hypothesis. This does not establish the paper's undisclosed PVD
angle, original GDS placement, electrical performance or TEM contour fidelity.

## Working branch and status

- Branch: `feat/m3d-rram-cntfet-lime-20261014`.
- Committed deliverables: source ledger, real Kernel builder and regression, eleven inferred mask layers, fully editable Recipe and matching History nodes with nine bookmarks, and the generated representative `.wafercad` asset.
- The regenerated native-ALD project passed isolated ALD rollback, deterministic Kernel rebuild, full v2 Chromium Run All/Export-Reopen, physical mask GDSII/OASIS plus external KLayout and Quality checks on [the October 15 green run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38700722241). Its CI evidence includes a local Section screenshot, a 3D overview and machine-readable validation results. **Paper-to-geometry morphology and usable local 3D visual presentation have not passed**; Draft PR [#226](https://github.com/Xiaolong-6/WaferCAD/pull/226) remains blocked on scientific/visual review rather than Kernel or persistence CI.
- Recipe **Rebuild Base → Run All** now retains a valid pre-existing physical Section A–B (including the paper-aligned local slice); the UI v2 and legacy Base controllers share this policy, while a manual Base change or an out-of-bounds Section still selects a centered default. Browser-level persistence is a required CI assertion.
- No proof of full array connectivity, original lithographic coordinates, device performance or electrical simulation is claimed.

## Published-Methods chronology and remaining geometric surrogates (October 17, 2026)

These process-order audit items are tracked independently of
the existing geometric, History and Chromium checks. The relevant source is
[Li et al. 2023, Methods, Fabrication of the M3D-LIME Chip](https://pmc.ncbi.nlm.nih.gov/articles/PMC10628152/).

- **CNTFET O₂ channel patterning order:** The paper wet-transfers and cleans
  the CNT, patterns Ti 1 nm / Pd 45 nm source/drain contacts, and **only then**
  lithographically patterns the CNT channel using O₂ plasma, before 10 nm Y
  deposition and oxidation. The current 46-step Builder combines PCz cleaning
  and O₂ patterning previously in `recipe-step-26`; this defect is corrected:
  step 26 records post-transfer PCz cleaning only, steps 27–30 form Ti/Pd
  contacts, and step 31 records **O₂ channel isolation followed by Y deposition
  and oxidation**. The CNT appears at its final Mask footprint immediately
  after transfer; an intermediate blanket film and physical O₂ removal remain
  **unmodeled**. Grouping these two consecutive non-geometric operations in
  one Record preserves the 46-step Recipe and History node count.
- **Analog CIM passivation CMP order:** The paper deposits 400 nm PECVD SiO₂,
  patterns F-RIE contact openings, fills the TE contacts with W, and then
  performs CMP. The Builder inserts an additional pre-via CMP at
  `Z = 1.28 µm (inferred)` **before** F-RIE contact opening and W via fill,
  followed by its post-W CMP. The early CMP is an **inferred geometric
  planarization surrogate**, not a source-reported intermediate operation.
  Either a corrected, replayable intermediate model must eliminate it, or its
  non-paper status must remain explicit; the final W/TE contact tests alone
  cannot validate the source ordering.

**Current-HEAD deterministic verification:** At feature HEAD `667ee5da` the
[M3D-LIME Kernel/Chromium/KLayout workflow](https://github.com/Xiaolong-6/WaferCAD/actions/runs/39017239342)
passes the real-Kernel fixture regeneration/equality check, source-derived
process-order and 14/14 Pd contact assertions, 46-step browser replay and
external Mask export inspection. Quality, Browser Regression and History/Recovery
also pass on that same HEAD. This closes the earlier **Recipe chronology and
serialized-asset synchronization** blocker, but it does **not** physically
model the pre-pattern blanket CNT film or O₂ etch, justify the pre-via CMP,
validate the inferred 25% Pd step coverage, supply the omitted TCAM pre-charge
transistor or electrical wiring, or establish source TEM/SEM morphology match. The isolated pre-charge extension is only accepted after its own regenerated fixture, real-Kernel intermediate geometry, browser and external KLayout checks pass.
Any subsequent Builder change must again regenerate the checked-in fixture from
the real Kernel and verify intermediate occupancy, Recipe/History, persistence,
rollback, all contacts and real Chromium/KLayout; an early-only Builder change
that desynchronizes serialized History remains unacceptable.

## Paper-figure visual evidence boundary (October 2026)

- **Fig. 1b — three-tier TEM, 1 µm scale bar.** The source shows CMOS,
  analog-CIM and CNTFET–digital-RRAM tiers in vertical sequence. Browser evidence:
  `three-tier-before-runall.png`, `section-local-before-runall.png`, and complete
  46-step replay. Foundry FEOL, dielectric interfaces and tier-2-to-3 ILVs
  cannot be inferred from this TEM; the source explicitly omits those ILVs.
- **Fig. 2c — analog RRAM TEM, 20 nm scale bar.** Source stack:
  TiN / HfAlOₓ (8 nm) / TaOₓ (45 nm) / TiN. Browser evidence:
  `section-analog-rram-nanoscale-canvas.png` plus the original panel capture,
  checked material IDs, Z thickness and physical X:Z scale; the Mask-edge transition
  is checked independently at its different X coordinate.
  Model boundaries are piecewise ideal rather than measured TEM contours.
- **Fig. 2d — digital RRAM TEM, 20 nm scale bar.** Source stack:
  Pd / TaOₓ (20 nm) / Ta₂O₅ (10 nm) / Pt. Browser evidence:
  `section-digital-rram-nanoscale-canvas.png` centered on the thickness probe
  and independent model XY/Z and Mask-edge probes.
  Idealized layer interfaces do not establish fabricated TEM contour fidelity.
- **Supplementary Fig. 6a — CNTFET beside digital RRAM.** The RRAM island
  is separated from the active CNT and lands on the Pd drain. Browser evidence:
  `section-cntfet-pd-gate-step-nanoscale-canvas.png`,
  `section-cntfet-digital-rram-bridge-canvas.png` and 14-site Pd continuity
  probes. The 0.45 µm lateral clearance, mask outlines and 25% Pd evaporation
  step-coverage fraction are uncalibrated assumptions.

Each thin-film image is centered on the **same physical X/Z sample** used to check
its nanometre film thickness. The independent Mask-edge check may lie outside
that magnified field of view and is not mistaken for a film-center capture.
The browser produces both full Section-panel evidence (including toolbar and true X:Z readout)
and native canvas-only screenshots with the **real Layers pane temporarily closed** to avoid
obscuring the nanoscale material interface. It restores the original Layers preference and
localStorage value before the saved model, ROI, Section, History and export checks.
These renders verify the **model-specific internal geometry**, not TEM-derived metrology,
actual metal continuity or an author-GDS match. The original paper images are accessible
through [Li et al. 2023](https://doi.org/10.1038/s41467-023-42981-1) and retain their
own independently reported scale bars.

## Pending local ML pre-charge extension (2026-10-17)

A separate **inferred** CNTFET is positioned at physical XY
`[44.0, -25.0]..[46.6, -5.0] µm`; gate/contacts reuse the sourced
10 nm Ti / 15 nm Pd / 1 nm Ti back gate, 10 nm HfO₂ dielectric, 1 nm CNT
visual surrogate and Ti/Pd source/drain Recipe operations. It is **not**
connected to a fifteenth Ta₂O₅ RRAM. The original article does not provide
its exact mask position or local control-wire GDS. No ML connection, pre-charge
bias or circuit function can be inferred from this geometry alone.

The pre-charge branch must demonstrate **11 mask layers, 134 rectangles**
(32 foundry/CIM, 60 CNT gate/channel/source/drain, 42 digital RRAM/
passivation/top contact), with 15 physical CNTFET gates and islands but only
14 RRAM stacks. Required regressions: actual Kernel regeneration into the
serialized project, snapshot History and 46-step Recipe equality, all 14
memory Pd/RRAM bridges, pre-charge gate/contact ownership, conformal coatings,
external GDS/OAS KLayout and real Chromium import/Run All/Section/3D. The
former **130-polygon** mask results are historical evidence from the
14-CNTFET fixture only. **Do not merge the unfinished extension until fixture
and visual acceptance are complete.**
