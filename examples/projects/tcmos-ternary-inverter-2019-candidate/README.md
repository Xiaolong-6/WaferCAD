## Mask approval gate: supplied vector source (2026-10-16)

**The user-provided `layout-complete.svg` is the sole Mask geometry reference.**
It is stored alongside this project. The visible layout is reconstructed
directly from its vertices and symbol coordinates (viewBox 1113×758,
mirror axis x=560) using `scripts/tcmos-svg-mask.mjs`. The SVG contains
four complete METAL1 polygons, four ACTIVE shapes, two POLY bars,
four LVT/HVT windows, and **218 square CNT geometries**:
**232 exact SVG polygons**. The File Mask now contains **only these eight
layers and 232 elements**. Five legacy process masks remain internal to
the old Recipe and are explicitly excluded from File Mask/GDS/OAS export.

The SVG paths supersede every previously inferred metal strap, image crop
measurement, and approximated CNT placement. The micrometre conversion
(80 source SVG units per illustrative µm) is a **display coordinate mapping**,
not a measured 130 nm foundry pitch.

**Acceptance update (2026-10-17):** The user approved the SVG Mask. Process
steps now capture separate SVG-derived Draw Mask geometry without exporting
process-only well/source-drain/silicide layers. Real Chromium Run All completes
23/23 with 26 material slabs and zero XY mismatch; both device-local
Section/3D captures, History and Recovery were checked. The PR remains Draft
and is not a Welcome example or a calibrated PN/BTBT simulator. Final
merge/deployment still requires separate user approval.

# T-CMOS 130 nm ternary inverter — paper-derived reconstruction

Status: **candidate generator, not yet a shipped Welcome Example**.

- Source: J. W. Jeong et al., "Tunnelling-based ternary metal–oxide–semiconductor technology," _Nature Electronics_ **2**, 307–312 (2019), DOI: https://doi.org/10.1038/s41928-019-0272-8.
- Evidence: paper Fig. 1a–b, Methods (pp. 311–312); Supplementary Fig. 1 and physical model note.
- Implementation: scripts/build-tcmos-inverter-example.mjs
- Regression: site/tests/tcmos-inverter-reconstruction.test.mjs
- Figure-level provenance and visual acceptance: [FIG1_ACCEPTANCE.md](FIG1_ACCEPTANCE.md)
- Native 4×4 array, including a **23-step verified Recipe, 23 History nodes and actual Recovery Restore**: [ARRAY_4X4.md](ARRAY_4X4.md) and [committed `.wafercad`](tcmos-inverter-4x4-replayed.wafercad). The 56 × 32 µm array remains illustrative, not a foundry die map.

## Intended reconstruction and provenance

Reconstruct a representative 130 nm T-CMOS inverter on silicon, with ACTIVE/STI, NWELL/PWELL, HVTP/HVTN, POLY, source/drain annotations, CNT and METAL1. Retain an exportable 8-layer SVG-authoritative File Mask (including two reference-only LVT windows), complete Recipe, History nodes, stage bookmarks and a final geometry model.

The key published mechanism is the **highly doped body-to-drain tunnel junction**, obtained using a modified HVT body-implant mask. The Methods specify BF2+ for the nMOS device and As+ for the pMOS device, plus RTA; calibrated depth, energy, dose, mask coordinates and full GDS are unavailable.

| Feature      | Source-supported information                                                           | Geometric reconstruction choice                                                                                                |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Inverter     | Fig. 1a/b complementary CMOS topology                                                  | Illustrative 14 x 8 µm local field with separate POLY gates and four isolated METAL1 nets VDD/VOUT/GND/VIN                     |
| Process      | Commercial 130 nm and 90 nm CMOS foundries                                             | 130 nm process node only; **the 0.48125 µm schematic POLY stroke is image-proportional**, not measured gate length             |
| ACTIVE/STI   | Si(100) and shallow trench isolation                                                   | 2 µm display handle, 230 nm trench, 280 nm oxide fill and ideal CMP                                                            |
| HVTN/HVTP    | As+ pMOS / BF2+ nMOS body implants (paper Fig. 1b uses HVTN on left and HVTP on right) | Illustrative 80–240 nm buried marker; not a concentration profile                                                              |
| Gate         | SiO2 in 130 nm flow; patterned POLY                                                    | 5 nm SiO2 selectively depicted under POLY; 200 nm Poly                                                                         |
| Source/drain | LDD/HDD, silicide and self-aligned processing                                          | 80/180 nm Implant markers, 25 nm silicide geometry; spacers/RTA recorded only                                                  |
| Contacts     | CNT and METAL1 standard foundry layers                                                 | Two U-shaped well-tie contact arrays, independent gate contacts and four isolated METAL1 nets; 450 nm ILD/200 nm Al surrogates |

**Scientific limitation:** The optional Implant startDepth defines a geometrically buried interval while retaining a reference to the original exposed surface. The illustrative 80–240 nm HVT intervals are explicitly inferred and **not** concentration distributions or tunnel-junction thicknesses. No calibrated BTBT or dopant physics is computed. The electrical curves in Figs. 1d/3 and SI equations S1–S4 are out of scope for the geometric Kernel.

**Supplementary-model distinction:** The physical-model discussion preceding Supplementary Fig. 1 estimates an effective junction thickness `Tj` of **75 nm for boron in T-nMOS** and **30 nm for arsenic in T-pMOS** from the implant-spread standard deviation, for use in a tunnelling-current area estimate. Neither number specifies an HVT mask width or a measured start/end depth. The candidate's **80–240 nm band (160 nm thick)** is therefore **not** the paper's `Tj`. An unannotated upper 0–80 nm slice means **concentration unmodelled**, not proven undoped silicon. The Section colour band is a qualitative high-doping intent only.

## Figure 1b topology review (2026-10-14)

The paper's **left** device is pMOS in n-well, framed by the **LVTN/HVTN** optional masks; the **right** device is nMOS in p-well, framed by **LVTP/HVTP**. The earlier candidate accidentally swapped HVTN and HVTP. The masks now use the source's actual names while retaining the correct **As+ pMOS** and **BF2+ nMOS** species from Methods.

Both cells have compact horizontal ACTIVE diffusion bars crossed by an **image-proportional 0.48125 µm POLY band**, and surrounding contact-dense U-shaped well/body ties. This local layout approximates Fig. 1b's _topology and silhouette_; it does not digitize a released foundry GDS. Because the paper does not provide a measured gate length for this local layout, or exact cell, mask, contact pitch, gate oxide or implant-depth dimensions, **all such sizes including the 0.48125 µm schematic POLY stripe are illustrative**. LVTN/LVTP shapes are retained for visual comparison only and are **not executed as LVT doping steps** in the T-CMOS Recipe. The same project now carries a second **Conventional CMOS / LVT channel** Variant, forked from the common well-formation Step. Each branch stores an independent full Recipe and restorable post-fork History. The 80 nm comparison implant depth is explicitly assumed.

**Tilt clarification:** Neither Methods nor Supplementary Fig. 1 specifies a beam incidence angle. The arrows in Supplementary Fig. 1 indicate the implantation direction, not a measurable off-normal tilt. The paper does **not** establish a 0° angle. The reconstructed Recipe uses **0° as an assumed, neutral geometric baseline**, not as a documented foundry implantation condition. WaferCAD supports a separate nonzero tilt control, but a genuine directional process comparison should be labelled an _illustrative variant_, never as the published recipe. At 130 nm feature scale a small true tilt-induced lateral displacement may be invisible at full 14 µm field-of-view; zoom and quantitative model checks are needed.

**Body-tie modelling caveat:** Fig. 1b shows the U-shaped contact pattern, but not a complete set of physical under-contact active regions, dopant implants or well tie process steps. The additional U-shaped ACTIVE diffusion and Metal1 are inferred body-tie regions. Fig.1b does not draw a continuous metal path from the outside supply leg to the U-shaped body rail, so these islands are deliberately kept separate and electrical continuity is unverified. In this simplified Kernel flow, the tap doping chemistry and physically correct metal/silicide interface are _not simulated_.

## Scope: externally calculated device results are visualization inputs

WaferCAD is a **process reconstruction and structure visualization** product. We do
not implement PN/BTBT transport physics, Poisson equations, numerical dopant
activation or a semiconductor device simulator. Existing Implant depth/tilt and
qualitative polarity are annotations supplied or chosen by the user.

If another tool or paper provides **numerical PN/BTBT results**, a separate
display-only visualization importer may show them over the correct Main/Section/3D
coordinates, with original units, source, device bias and dataset identity.
A scalar (e.g. reported Tj or current) can be labeled or plotted; it **must not**
be transformed into a fabricated 3D junction contour. Spatial rendering requires
spatial input data or explicitly user-provided geometry. Importing external data
must not rewrite materials, process history or the original `.wafercad` model.

Generic external profile import/rendering is **not shipped by PR #225**; it is
tracked as a potential independent visualization task only when an actual
external dataset and desired presentation are defined.

### Fig. 1b mask redraw (2026-10-16)

The updated layout follows the supplied paper image's **visual topology** rather than
treating the old 14 × 8 µm illustrative Mask as foundry data:

- Each compact horizontal ACTIVE island has a central 0.48125 µm _schematic-proportional_
  vertical POLY gate, a source and a drain, and a separately connected U-shaped
  body-tie diffusion/contact rail below the transistor.
- The tallest **inverted U-shaped METAL1** bridge connects both POLY gate
  contacts (**VIN**). A shorter nested upper inverted-U bridge connects the two
  inner drain contacts (**VOUT**). The outer source leads and lower U rail connect
  source pads to the **VDD/GND** labels. The original image leaves a
  24–25 px white gap between each outside supply leg and inner U-shaped
  body metal. This gap is preserved: it is **not** bridged to satisfy an
  invented connectivity constraint.
- The mask contains **218 CNT polygons**: four 3×3 source/drain matrices, two POLY
  terminals, and **87 contact sites per U-shaped well-tie** (3 × 19 along the
  horizontal bottom plus five rows × three columns on each side). These pitches, widths, and even
  the figure's apparent number of CNT symbols are illustrative.
- HVTN (left)/HVTP (right) frame the relevant ACTIVE/gate regions. LVTN/LVTP
  are reference outline masks only and are not executed as T-CMOS LVT steps.
- **8 layers and 232 layout polygons (SVG File Mask)** export through the same File Mask as
  GDS/OAS. The canonical .wafercad, full process History, both Variants,
  recipe replay, and browser screenshots all derive from this same Mask.

The authoritative alignment uses the user-provided 1113×758 vector SVG, origin (560,480), and a single 80 SVG-units/illustrative-µm display conversion. Earlier 713×498 raster boxes and their 54 px/µm mapping are superseded. The Recipe's private process masks are captured on the project's existing 0.1 nm persistence grid; the original File Mask SVG vertices remain unchanged. No unreported
micrometre dimensions, alignment accuracy, foundry design rules or physical
PN/BTBT solution are inferred from the schematic. The historical 80-element
candidate is superseded by the revised saved model. Each source/drain terminal now has a 3×3 CNT matrix traced to the figure.
Contact widths and pitches are illustrative; the source does not provide a GDS.

## Shared Base and two process Variants

- **Main / T-CMOS:** 0° As+ donor HVTN marker for pMOS and BF2+ acceptor HVTP marker for nMOS, illustrated as a buried 80–240 nm interval.
- **Conventional CMOS:** reference-only LVTN/LVTP channel masks (80 nm display interval), branched after identical Si Base, STI, complementary wells and Well formation/drive-in. The comparison has no T-CMOS HVT body region.
- Both Variant heads contain a full Recipe from Base and independently restorable History nodes; no second Welcome Example or invented electrical curve is required. Source does not provide numerical energy/dose or calibrated junction profiles.

## Qualitative Dopant Region Kernel contract

Implant operations may now optionally create a separate `model.dopantRegions` record, with `polarity=donor|acceptor`, `role=body|channel|source-drain`, host material ID, original XY process mask, depth interval and provenance. The default historical Implant remains a visual annotation without dopant semantics. `resolveQualitativeDopantRegion` clips each intent against surviving semiconductor material on demand, including later etch voids, and a polarity-overlap diagnostic can identify **candidate regions for further junction examination**. It does not solve a concentration distribution, junction depletion width, activation, lateral straggle, tilt-implant transport or BTBT current. The display and the physical material Kernel remain unchanged.

The T-CMOS HVT, p/n LDD and p/n HDD Implant steps now write these qualitative records; the Conventional CMOS LVT branch writes channel records instead. Both are tested through Recipe, Project schema and persistence. Precise bulk N-well and P-well concentration fields are not available: their existing Electrical Region annotations remain schematic.

## Body–source/drain scientific junction audit (2026-10-15)

The existing `findDopantPolarityOverlaps` detects **co-occupancy of opposite-polarity qualitative annotations**, not a physical PN junction surface. The source and drain share the same LDD/HDD mask/record; labels below are derived from the reconstructed POLY gate and METAL1 VDD/VOUT/GND contact placement. The new terminal-qualified diagnostic partitions that overlap into the inferred Source and Drain footprints **without assigning carrier concentration, diffusion, activation, net polarity, a depletion boundary or BTBT current**.

For this _illustrative_ Fig. 1b redrawing, HVT and HDD intersect over **0.82–0.92 µm Z** (100 nm). In both pMOS (HVTN donor / p+ HDD acceptor) and nMOS (HVTP acceptor / n+ HDD donor), the pMOS Source/Drain intersections are each **0.6864 µm²**; nMOS Drain is **0.6708 µm²** and Source **0.7020 µm²**. This is structural annotation overlap only, not a predicted PN junction.

Both source and drain overlaps are nonzero. A nonzero overlap **must not** be interpreted as a physically resolved body–drain interface or tunnelling hot spot.

The inferred U-shaped body ties connect the pMOS n-well to VDD and the nMOS p-well to GND using Si/W/Metal1 interfaces. At the sampled contact centers, the correct schematic well is present, but **no separate n+ or p+ surface-contact dopant intent exists**. The generator records this in `validation.bodyTieContactEvidence`; `ohmicContactValidated` remains false even if a future qualitative contact marker is introduced. Carrier concentration, activation, contact resistivity and source-supported tie geometry cannot be established from the available article. No speculative foundry implant step is added.

A separate material-clipped 3D audit compares the HVT donor/acceptor body intents with the schematic n-/p-well Electrical Region markers. Each transistor currently contains **0.282048 µm³** of body annotation inside its matching well; outside the matching well under STI is **0.028808 µm³** (pMOS) and **0.029112 µm³** (nMOS), in residual silicon beneath STI. This is **not proof of physical implant penetration**: mask layout, ion range in STI SiO₂ and well activation are not supplied by the paper. The model retains its original masks and stored history; the audit records the discrepancy rather than silently redefining a new foundry process or claiming a measurable PN boundary. The schematic n-/p-wells are `electricalRegions`, with no corresponding calibrated `dopantRegions` well concentrations. WaferCAD does not solve junction physics; quantitative PN/BTBT acceptance is outside the project scope. The per-device terminal measurements are reproduced by focused scientific tests and the generator's independent `validation.json` report; the generated project's material/Recipe geometry is unchanged.

## Geometry build order

1. Create the Si(100) Base. Etch Si in the inverse of ACTIVE, exposing a real trench.
2. Deposit the illustrative STI oxide fill and planarize to original Si top Z. Assert that Si survives in ACTIVE and oxide occupies STI.
3. Place NWELL/PWELL electrical annotations and buried HVT Implant interval markers; record foundry well/activation as non-geometric steps.
4. Represent 5 nm gate oxide directly beneath the two POLY footprints (geometric surrogate; foundry blanket oxidation/strip sequence unavailable), then define separate image-proportional 0.48125 µm POLY bands. Connect VIN through gate contacts and overhead METAL1.
5. Open simplified source/drain Si windows; annotate LDD/HDD; record spacer and RTA operations.
6. Pattern silicide surrogate, deposit ILD, etch CNT openings including U-shaped well-body tie arrays, fill with W, pattern four separate METAL1 nets (VDD, VOUT, GND, VIN).

Each patterned Recipe step captures its File Mask and layer/datatype; the STI step retains explicit inverse-mask semantics.

## Separate tilt diagnostic (not the paper)

To verify that the Kernel and Section viewer can represent a nonzero Implant tilt, run:

`node scripts/build-tcmos-inverter-example.mjs --tilt-demo`

This writes `test-results/tcmos/tcmos-tilt-demo-18deg-NOT-PAPER.wafercad`. Only the two HVT body annotation operations acquire an _assumed_ 18° angle, and the Section path is shortened to 1.5 µm over the pMOS gate. The vertical 80–240 nm interval then projects approximately 52 nm of lateral shift across the displayed band (`tan(18°) × 160 nm`). This auxiliary diagnostic is intentionally marked **NOT REPORTED IN PAPER** and must never be registered as a published literature reconstruction. The default generated project and committed fixture use tilt = 0°.

## Default inspection state

The final candidate now stores `Interlayer SiO2.visible = true` and a global 3D opacity of **0.55**. This keeps the real dielectric supporting METAL1 and W contacts visible in the initial 3D view, avoiding a misleading suspended-metal appearance. The geometric ILD and all process thicknesses are unchanged, including in History/Recovery. For an isolated internal-contact inspection, hide the ILD explicitly using the material legend; that is a view preference, not an etched void. The 5 nm gate dielectric remains confined to the two POLY footprints rather than an incorrect all-field film.

A saved project-specific 3D camera targets the transistor pair from an oblique, closer vantage point. This camera is part of the example file, not a global renderer default. Section A–B now traverses the SVG-aligned cross-device channel at y=-1.2 µm. For an individual schematic POLY band, users still need to zoom into Section or adjust A–B; the published Fig. 1a is an illustrative 3D sketch, and no original foundry GDS or exact depth profile is available. Visual matching is _qualitative_.

## Display-only local 3D cutaway evidence

The opt-in 3D **Cutaway** mode requires a Main ROI. It increases the displayed Z aspect ratio and contrast of the ROI boundary's surviving buried Implant annotation; it intentionally flattens the _display alpha gradient_ of the cut face, without changing the qualitative annotation interval, stored materials or Recipe. Dark cut-face lines delineate that illustrative interval; they are not measured junction boundaries. The underlying scientific profile is **not** calibrated, and the displayed band must not be interpreted as a measured tunnel junction thickness. The full-marker and HVT-only captures are retained for comparison; inspection derivatives are not published as device files.

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
**Stage acceptance (2026-10-17):** The SVG File Mask (8 layers, 232 shapes) has
user visual approval. The separate process masks are SVG-derived and do not
appear in GDS/OAS. The Chromium Run All passes 23/23, strict 26-slab
material parity, independent pMOS/nMOS local Sections and ROI 3D cutaways,
and Save/Recovery. The committed project has been regenerated; exact-head
CI must still be evaluated after documentation cleanup. No Welcome or Main
merge has been approved, and no PN/BTBT physics is claimed.

Scientific visual evidence was captured in real Chromium: the local pMOS Section and nMOS Section show the gate, body and HVT/HDD annotations, with corresponding focused 3D views. Include a wide-field context image for each crop, the exact Section endpoints and view/visibility settings, a legend identifying inferred geometry versus source-supported features, and a comparison with paper Fig. 1a/b and Supplementary Fig. 1. Expanded full-field screenshots alone cannot establish 130 nm junction correspondence. Do not present the 80–240 nm display band as a measured junction thickness or imply a calibrated dopant concentration/BTBT current. Keep this PR Draft, and do not add to Welcome or merge until current-head CI and these evidence gates are satisfied.
