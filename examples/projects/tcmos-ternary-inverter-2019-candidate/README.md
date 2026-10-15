# T-CMOS 130 nm ternary inverter — paper-derived reconstruction

Status: **candidate generator, not yet a shipped Welcome Example**.

- Source: J. W. Jeong et al., "Tunnelling-based ternary metal–oxide–semiconductor technology," _Nature Electronics_ **2**, 307–312 (2019), DOI: https://doi.org/10.1038/s41928-019-0272-8.
- Evidence: paper Fig. 1a–b, Methods (pp. 311–312); Supplementary Fig. 1 and physical model note.
- Implementation: scripts/build-tcmos-inverter-example.mjs
- Regression: site/tests/tcmos-inverter-reconstruction.test.mjs

## Intended reconstruction and provenance

Reconstruct a representative 130 nm T-CMOS inverter on silicon, with ACTIVE/STI, NWELL/PWELL, HVTP/HVTN, POLY, source/drain annotations, CNT and METAL1. Retain an exportable 13-layer File Mask (including two reference-only LVT windows), complete Recipe, History nodes, stage bookmarks and a final geometry model.

The key published mechanism is the **highly doped body-to-drain tunnel junction**, obtained using a modified HVT body-implant mask. The Methods specify BF2+ for the nMOS device and As+ for the pMOS device, plus RTA; calibrated depth, energy, dose, mask coordinates and full GDS are unavailable.

| Feature      | Source-supported information                                                           | Geometric reconstruction choice                                                                                                |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Inverter     | Fig. 1a/b complementary CMOS topology                                                  | Illustrative 14 x 8 µm local field with separate POLY gates and four isolated METAL1 nets VDD/VOUT/GND/VIN                     |
| Process      | Commercial 130 nm and 90 nm CMOS foundries                                             | Candidate chooses 130 nm and gate L=0.13 µm                                                                                    |
| ACTIVE/STI   | Si(100) and shallow trench isolation                                                   | 2 µm display handle, 230 nm trench, 280 nm oxide fill and ideal CMP                                                            |
| HVTN/HVTP    | As+ pMOS / BF2+ nMOS body implants (paper Fig. 1b uses HVTN on left and HVTP on right) | Illustrative 80–240 nm buried marker; not a concentration profile                                                              |
| Gate         | SiO2 in 130 nm flow; patterned POLY                                                    | 5 nm SiO2 selectively depicted under POLY; 200 nm Poly                                                                         |
| Source/drain | LDD/HDD, silicide and self-aligned processing                                          | 80/180 nm Implant markers, 25 nm silicide geometry; spacers/RTA recorded only                                                  |
| Contacts     | CNT and METAL1 standard foundry layers                                                 | Two U-shaped well-tie contact arrays, independent gate contacts and four isolated METAL1 nets; 450 nm ILD/200 nm Al surrogates |

**Scientific limitation:** The optional Implant startDepth defines a geometrically buried interval while retaining a reference to the original exposed surface. The illustrative 80–240 nm HVT intervals are explicitly inferred and **not** concentration distributions or tunnel-junction thicknesses. No calibrated BTBT or dopant physics is computed. The electrical curves in Figs. 1d/3 and SI equations S1–S4 are out of scope for the geometric Kernel.

**Supplementary-model distinction:** The physical-model discussion preceding Supplementary Fig. 1 estimates an effective junction thickness `Tj` of **75 nm for boron in T-nMOS** and **30 nm for arsenic in T-pMOS** from the implant-spread standard deviation, for use in a tunnelling-current area estimate. Neither number specifies an HVT mask width or a measured start/end depth. The candidate's **80–240 nm band (160 nm thick)** is therefore **not** the paper's `Tj`. An unannotated upper 0–80 nm slice means **concentration unmodelled**, not proven undoped silicon. The Section colour band is a qualitative high-doping intent only.

## Figure 1b topology review (2026-10-14)

The paper's **left** device is pMOS in n-well, framed by the **LVTN/HVTN** optional masks; the **right** device is nMOS in p-well, framed by **LVTP/HVTP**. The earlier candidate accidentally swapped HVTN and HVTP. The masks now use the source's actual names while retaining the correct **As+ pMOS** and **BF2+ nMOS** species from Methods.

Both cells have compact horizontal ACTIVE diffusion bars crossed by a vertical 130 nm POLY gate, and surrounding contact-dense U-shaped well/body ties. This local layout approximates Fig. 1b's _topology and silhouette_; it does not digitize a released foundry GDS. Because the paper does not specify exact cell, mask, contact pitch, gate oxide or implant-depth dimensions, all non-node sizes remain **illustrative**. LVTN/LVTP shapes are retained for visual comparison only and are **not executed as LVT doping steps** in the T-CMOS Recipe. The same project now carries a second **Conventional CMOS / LVT channel** Variant, forked from the common well-formation Step. Each branch stores an independent full Recipe and restorable post-fork History. The 80 nm comparison implant depth is explicitly assumed.

**Tilt clarification:** Neither Methods nor Supplementary Fig. 1 specifies a beam incidence angle. The arrows in Supplementary Fig. 1 indicate the implantation direction, not a measurable off-normal tilt. The paper does **not** establish a 0° angle. The reconstructed Recipe uses **0° as an assumed, neutral geometric baseline**, not as a documented foundry implantation condition. WaferCAD supports a separate nonzero tilt control, but a genuine directional process comparison should be labelled an _illustrative variant_, never as the published recipe. At 130 nm feature scale a small true tilt-induced lateral displacement may be invisible at full 14 µm field-of-view; zoom and quantitative model checks are needed.

**Body-tie modelling caveat:** Fig. 1b shows the U-shaped contact pattern, but not a complete set of physical under-contact active regions, dopant implants or well tie process steps. The additional U-shaped ACTIVE diffusion and connected Metal1 are geometrical reconstructions inferred to represent electrical well ties. In this simplified Kernel flow, the tap doping chemistry and physically correct metal/silicide interface are _not simulated_.

## Shared Base and two process Variants

- **Main / T-CMOS:** 0° As+ donor HVTN marker for pMOS and BF2+ acceptor HVTP marker for nMOS, illustrated as a buried 80–240 nm interval.
- **Conventional CMOS:** reference-only LVTN/LVTP channel masks (80 nm display interval), branched after identical Si Base, STI, complementary wells and Well formation/drive-in. The comparison has no T-CMOS HVT body region.
- Both Variant heads contain a full Recipe from Base and independently restorable History nodes; no second Welcome Example or invented electrical curve is required. Source does not provide numerical energy/dose or calibrated junction profiles.

## Qualitative Dopant Region Kernel contract

Implant operations may now optionally create a separate `model.dopantRegions` record, with `polarity=donor|acceptor`, `role=body|channel|source-drain`, host material ID, original XY process mask, depth interval and provenance. The default historical Implant remains a visual annotation without dopant semantics. `resolveQualitativeDopantRegion` clips each intent against surviving semiconductor material on demand, including later etch voids, and a polarity-overlap diagnostic can identify **candidate regions for further junction examination**. It does not solve a concentration distribution, junction depletion width, activation, lateral straggle, tilt-implant transport or BTBT current. The display and the physical material Kernel remain unchanged.

The T-CMOS HVT, p/n LDD and p/n HDD Implant steps now write these qualitative records; the Conventional CMOS LVT branch writes channel records instead. Both are tested through Recipe, Project schema and persistence. Precise bulk N-well and P-well concentration fields are not available: their existing Electrical Region annotations remain schematic.

## Geometry build order

1. Create the Si(100) Base. Etch Si in the inverse of ACTIVE, exposing a real trench.
2. Deposit the illustrative STI oxide fill and planarize to original Si top Z. Assert that Si survives in ACTIVE and oxide occupies STI.
3. Place NWELL/PWELL electrical annotations and buried HVT Implant interval markers; record foundry well/activation as non-geometric steps.
4. Represent 5 nm gate oxide directly beneath the two POLY footprints (geometric surrogate; foundry blanket oxidation/strip sequence unavailable), then define separate 130 nm POLY gates. Connect VIN through gate contacts and overhead METAL1.
5. Open simplified source/drain Si windows; annotate LDD/HDD; record spacer and RTA operations.
6. Pattern silicide surrogate, deposit ILD, etch CNT openings including U-shaped well-body tie arrays, fill with W, pattern four separate METAL1 nets (VDD, VOUT, GND, VIN).

Each patterned Recipe step captures its File Mask and layer/datatype; the STI step retains explicit inverse-mask semantics.

## Separate tilt diagnostic (not the paper)

To verify that the Kernel and Section viewer can represent a nonzero Implant tilt, run:

`node scripts/build-tcmos-inverter-example.mjs --tilt-demo`

This writes `test-results/tcmos/tcmos-tilt-demo-18deg-NOT-PAPER.wafercad`. Only the two HVT body annotation operations acquire an _assumed_ 18° angle, and the Section path is shortened to 1.5 µm over the pMOS gate. The vertical 80–240 nm interval then projects approximately 52 nm of lateral shift across the displayed band (`tan(18°) × 160 nm`). This auxiliary diagnostic is intentionally marked **NOT REPORTED IN PAPER** and must never be registered as a published literature reconstruction. The default generated project and committed fixture use tilt = 0°.

## Default inspection state

The final candidate stores `Interlayer SiO2.visible = false` as **display-only** metadata while retaining the complete dielectric volume in every physical process region. This removes the opaque blanket from Main/3D/Section without deleting oxide or altering process thickness. The originally blanket 5 nm gate dielectric has separately been corrected to the two POLY footprints, because the all-field oxide overlay was physically misleading and made the Main view appear uniformly colored. The original ILD can be restored with the material legend checkbox. Intermediate History steps preserve visible dielectric to show deposition/fill during process review; the last History head and final bookmark reflect the unobscured inspection preset.

A saved project-specific 3D camera targets the transistor pair from an oblique, closer vantage point. This camera is part of the example file, not a global renderer default. Section A–B remains the cross-device cut at y=0, tracing both MOSFET gate/channel stacks. For an individual 130 nm gate, users still need to zoom into Section or adjust A–B; the published Fig. 1a is an illustrative 3D sketch, and no original foundry GDS or exact depth profile is available. Visual matching is _qualitative_.

## Run and acceptance

- Generate and validate candidate: node scripts/build-tcmos-inverter-example.mjs
- Focused test: node --test site/tests/tcmos-inverter-reconstruction.test.mjs
- Generated file (uncommitted by default): test-results/tcmos/tcmos-ternary-inverter-130nm.wafercad
- Repository output (only after acceptance): node scripts/build-tcmos-inverter-example.mjs --write-repo

The generator includes per-step kernel/schema checks, Recipe preflight and a project storage round-trip. Separate release verification must include Run All from fresh Base, actual Section/Main/3D geometry, Mask GDS/OAS export, History replay and Save/Reload. Only afterward add the project to Welcome and generate its final-only preview and 3D thumbnail. A green Node generator alone is not a full literature-Example acceptance.

## Follow-up model boundary

Do not silently change existing Implant semantics. The buried-start Implant annotation is implemented through an opt-in startDepth parameter with the existing total depth as end. Older Implant records retain startDepth=0 semantics. Kernel, schema, Section/3D, Recipe, worker and project storage behavior need ongoing compatibility coverage.

## Handoff

Repository: Xiaolong-6/WaferCAD.
Branch: feat/tcmos-ternary-inverter-example-20261014.
Initial base: main at 223ba3374f773e8d45fa17b3abb37a2d76b73acd.
Current stage: 130 nm candidate passes generator, real v2 fresh-Base replay, GDS/OAS and storage acceptance at `9bde408`. Subsequent Main physical-dimensions regression is under CI. Manuscript Fig. 1a/b visual signoff and repository-wide red workflow ownership remain open; do not ship as Welcome Example.
