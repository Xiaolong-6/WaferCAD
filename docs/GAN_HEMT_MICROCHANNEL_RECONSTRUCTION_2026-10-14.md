# GaN HEMT with four-level direct microchannel cooling (Lian et al., 2022)

## Scope and literature source

- Paper: T. Lian et al., _Thermal property evaluation of a 2.5D integration method with device level microchannel direct cooling for a high-power GaN HEMT device_, _Microsystems & Nanoengineering_ **8**, 119 (2022).
- DOI: https://doi.org/10.1038/s41378-022-00462-3
- Main figures: article Fig. 1 (chip and interposer design) and Fig. 2(a–i) (DRIE, wafer bonding, oxidation, metallization and assembly).
- Supplement: Fig. S-1 (HEMT gate/source/drain and backside grounds), Fig. S-5 (GSG pads and gold-wire bonding).

This is a geometry-first reconstruction of stepped coolant voids and a representative integrated HEMT. It is not original device GDS, a calibrated fabrication flow or an ANSYS thermal/CFD reproduction.

## Directly reported dimensions

| Quantity                             | Publication                                        | Usage                                                           |
| ------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------- |
| Starting interposer wafers           | Two 400 µm double-side-polished Si wafers          | Source fabrication recorded; structural surrogate below         |
| Front/back DRIE                      | 200 µm each side                                   | Lower cavity depth 200 µm                                       |
| Interposer final thickness           | ~800 µm                                            | 400 µm Base + four 100 µm bridge tiers                          |
| Microchannel footprint bottom/top    | 700 × 900 µm / 380 × 760 µm                        | Bottom opening; top channel envelope                            |
| Straight top channel width / spacing | 30 / 30 µm (paper main text)                       | Six illustrative 30 µm channels, 30 µm apart                    |
| HEMT chip dimensions                 | 1120 × 878.5 × 100 µm                              | XY chip footprint; SiC 99 µm + GaN 1 µm as structural surrogate |
| HEMT active region                   | 303 × 393 µm                                       | Mask dimension                                                  |
| Gate fingers                         | Ten, each 0.5 µm gate length and 300 µm gate width | Ten 0.5 × 300 µm mask rectangles                                |
| Interposer Ti/Cu                     | 200 nm / 500 nm; followed by Au                    | Native idealized Ti/Cu conformal geometry; Au routing unmodeled |
| Water and measured operating point   | 3 mL/min; ~7.5 V, 0.8 A; 93.8 °C maximum           | Metadata only, never predicted                                  |

The abstract uses "pitch" for the 30 µm microchannel parameter while the main design text specifies width/spacing. We use separate 30 µm width and 30 µm spacing (60 µm centerline period) and disclose this interpretation.

**Top-footprint audit:** the published 380 × 760 µm region and the generated 330 × 760 µm six-stripe Mask have different lateral extents. Only the top stripe length and stated stripe width/spacing are directly instantiated. The additional nominal 25 µm shoulders on each side are not photolithographically patterned top openings. This unresolved footprint interpretation is part of the scientific acceptance gate, not a dimensional-parity pass.

## Geometrical assumptions and limits

1. Interposer XY 6000 × 5000 µm is a representative viewing field inferred from the published photographs and scale markers, not a separately reported precision dimension.
2. True direct bonding of two separately patterned 400 µm wafers is unavailable as one current Kernel operation. The construction begins with a 400 µm HR Si base, etches a 700 × 900 µm lower cavity 200 µm deep, then adds four 100 µm Si flat bridges with etched openings. This creates canonical Z voids and an 800 µm final interposer. It is a **single-model surrogate**, not the reported manufacturing sequence.
3. Intermediate transition masks 600 × 860 and 480 × 820 µm are inferred. The supplied article gives only the top 380 × 760 and bottom 700 × 900 µm dimensions numerically.
4. Six parallel top channels and their exact positions are inferred. Only 30 µm width/spacing and alignment with gate fingers are reported. Six 30 µm-wide strips with five 30 µm solid ribs span **330 µm**, while the paper gives a **380 µm** overall top microchannel footprint. The remaining **50 µm**, represented by nominal 25 µm solid margins on both lateral edges, is a _geometric interpretation_, not a measured original-mask feature; the Mask layer 13 itself spans 330 × 760 µm, not a continuously etched 380 × 760 µm rectangle. Do not describe the modeled top etch as an exact 380 µm opening. Original GDS and the exact channel count are unavailable. **Fig. 1(c) / Fig. 2(h) show symmetric curved inlet/outlet diversion structures**, and the Example now includes a separate top-cap DRIE step using Mask 22: twelve rounded diversion branches (six on each end), plus two central 110 × 50 µm collection throats at Y = ±425 µm. Each branch is a 24 µm-wide piecewise curve with a nested U-shaped return bend around the collecting throat, spanning approximately Y = ±355 to ±478 µm for the outer channels. The inside lanes take shorter arcs. The source contours are inferred, and the geometry is mirrored at both ends. The coordinates and curve geometry are explicitly **inferred**, not the authors' GDS. The published figure has its inlet/outlet horizontally; the Example is rotated 90° in XY so flow is along Y.
5. Two 100 × 60 µm **rear coolant inlet/outlet** apertures, at inferred Y = ±1450 µm, are opened from Back through the remaining 200 µm substrate into the continuous lower chamber. Two inferred 110 × 1100 µm bottom feeder trenches (Mask 23) connect these remote ports at Y = ±1450 µm to the reported-size central bottom cavity by **edge contact at Y = ±450 µm** (no overlapping second etch into the lower Si); the corridor coordinates are engineering assumptions, not paper dimensions. They represent the bottom ports in article Fig. 2(i); sizes and placement are inferred. This makes a real interconnected empty coolant domain, but pressure loss and the packaging manifold are not modeled.
6. Four 70 × 70 µm square through-bores approximate TSV locations. Two native conformal processes now produce idealized **200 nm Ti** and **500 nm Cu** seed films along each TSV wall. Mask 25 covers a 90 × 90 µm local window to include the exposed Si rim and the empty bore. Both thicknesses match the article's stated Ti/Cu films, but uniform coverage through an 800 µm-deep via is an **idealization**. The generator also builds an **inferred 35 µm conformal Cu electrofill surrogate** with real Cu-filled cores. The 35 µm value is a geometric closure amount for 70 µm square holes, not a reported plating thickness. A following idealized Cu-targeted directional etch removes the artificial 35 µm cap overburden from the top surface, leaving the Cu-filled columns up to approximately Z = 600.7 µm. This is a geometrical CMP surrogate without abrasive/polish chemistry, surface roughness, or planarization nonuniformity. Actual electroplating kinetics, void-free material quality, oxide insulation, NiPaAu, Au routing and electrical conductivity are **not** simulated.
7. A 5 µm AuSn perimeter support film is illustrative and supports a 99 µm SiC bridge over the open channel. Solder geometry is not reported in the sources.
8. The Fig. 1(a) upper device now includes a **25 nm AlGaN barrier** above the inferred 1 µm GaN buffer and a **150 nm SiN isolation/passivation frame** outside the 303 × 393 µm active window (Mask 24). **Neither AlGaN nor SiN thickness is given in the source**, so both are physically scaled illustrative assumptions, not measured reconstruction. The 2DEG is recorded as an _electronic interface_, not invented as a separate solid material. Gate/source/drain metals (0.2 µm) and GSG pads are schematic; complete Au routing between GSG pads, TSV columns and device contacts is not modeled. Ohmic contacts and device transport remain unverified.
9. Gold wire loops, polymer sealing, aluminum manifold, flow, heat transfer and device electrical performance are out of scope. **The coolant remains a true void, not a solid film**.
10. **Electrical paths are physically distinct in the article:** Fig. 2(f) electrically connects the HEMT to two independently soldered GSG Pad _chips_ via Au wire bonds. The Cu-plated interposer TSVs provide a separately described vertical/ground interconnect function. Fig. 1(a), Fig. 2 and the supplementary figures also depict or describe backside HEMT via/metallization. The current project has only 2D Au GSG _footprints_ on the interposer, top HEMT contact patches, and four idealized Cu-filled TSVs; it has no independent GSG dies, fabricated HEMT-to-GSG curved wires, through-HEMT backside via, complete TSV-to-surface metal net, or electrical continuity solver. A direct GSG-pad-to-TSV Au trace must **not** be invented as a paper requirement. Neither local Au pad occupancy nor filled Cu TSV material alone establishes circuit continuity.
11. **Oxidation/metallization order:** the paper specifies direct Si–Si bonding, external-surface thermal SiO₂ insulation, double-sided 200 nm Ti / 500 nm Cu sputtering, Au plating and NiPaAu on TSVs (Fig. 2(c,d)). The source does not give a calibrated thermal oxide thickness, Au plating profile or exact wire-bond loop coordinates. The current idealized TSV Ti/Cu/Cu-fill only partially represents metallization and omits the full oxide, Au, NiPaAu and electrical isolation interfaces; those must not be implicitly represented by colors or material names.

## Screenshot audit: visual semantics versus physical topology

The initial four-view review showed a dominant outer Si slab, colored staircase
tiers, and vertical tubular shapes at four remote TSV sites.

- **Si material identity:** the 400 µm substrate and four surrogate 100 µm Si
  bridge tiers retain **five distinct Layer IDs** for History/Recipe inspection,
  but all five share the same material color. Colored slices formerly implied
  multiple chemical materials where the construction assumes only Si.
- **TSV interpretation:** each of the four through-bores now has a physical,
  _idealized Cu-filled core_, native Ti/Cu conformal seed sidewalls and
  surrounding Si. Multiple XY and Z measurements confirm the metal occupies
  the entire intended via column. This is geometry-level continuity only.
  Real stepped TSV dimensions, copper electroplating, electrical contacts,
  NiPaAu, oxide isolation and measured conductivity remain **unverified**.
- **SiC/water boundary:** water is not modeled as a material. In the
  representative channel center, the SiC bottom is at Z = 605 µm, above a
  5 µm AuSn-support-defined fluid stand-off. A material occupancy test verifies
  an empty volume immediately beneath that SiC bottom surface. The fluid is
  exposed to the _SiC substrate backside_, not directly to the GaN epitaxy.
- **Inspection only:** the saved 3D cutaway ROI is X = 0…650 µm and Y = −1650…1650 µm,
  so its X=0 boundary exposes both separated backside ports and the
  stepped coolant core in a longitudinal Section along X = 30 µm.
  The separate final **06 Integrated GaN HEMT** Bookmark clears ROI and
  selects Y = 950 µm to inspect both off-axis electrical TSV bores.
  These are **different physical section planes**: Fig. 1(a) is a composite
  schematic, not a single literal slice of the authors' layout. Clipping is
  display-only and does not alter the mask or Kernel geometry.

These assertions establish solid/void occupancy only; they do not prove
manufacturable sidewall profiles, bonded-wafer hermeticity, hydraulic flow
through the assembled package, or electrical continuity.

Every inferred element must remain labeled as an assumption; do not promote it to source-derived geometry.

## Diversion manifold topology verification

The manifold was reconstructed from the _layout topology_ shown in Fig. 1(c) and the curved fan-out appearance photographed in Fig. 2(h). The new Mask **22** is a separate process-editable layer, containing six curved branches at the inlet, six at the outlet, and one central collecting throat per side. The current generator and reconstruction contract expect **30 Recipe operations**, **31 History nodes** and **16 mask layers** (including the later TSV metal-fill and HEMT processes). Straight-channel width and spacing remain the paper-reported 30 µm/30 µm; branch width, path bends and two throat footprints are inferred because the original mask file was not published.

A structural connectivity invariant interpolates points along real 3D _empty space_: it follows each of the two Back DRIE ports through the stepped lower chambers into its top-cap throat, then follows all six curved arms into the corresponding straight channel. All 12 side-to-channel paths must be free of material, and neighboring Si ribs must remain solid. This is stronger than testing that the inlet/outlet bores or masks merely overlap in 2D.

**Limit:** No Navier–Stokes, pressure-drop, velocity-field, laminar-flow distribution, etch tolerance, or wafer-bond seal is simulated. Correct geometrical connectivity does not establish equal per-channel flow. The exact number, curvature and width of the real paper's internal diversion tracks are uncertain and must be revisited if original author GDS becomes available.

### Inspecting both manifolds without chip occlusion

The first History bookmark, **01 Four-level open microchannels / 800 um Si with diversion**, represents the fluid network before AuSn supports and the HEMT are attached. It saves a dedicated full-channel 3D crop (X ±500 µm, Y ±520 µm), an elevated oblique camera, and a longitudinal Section along X = 30 µm (inside a central channel). This permits inspection of both inlet/outlet ends while leaving the final integrated project's default XY cross-section and chip-present 3D cutaway unchanged. To inspect it in the Workstation, open **History**, find the top-cap manifold etch Step (History labels it by the Si target and 100 µm etch depth), expand its Bookmark group, and use the existing **More actions → Restore bookmark** menu on **01 Four-level open microchannels**. Then inspect **3D** and **Section**. The restored view uses its saved ROI, camera, and Section without editing the physical Recipe. The dedicated browser test now captures this pre-assembly 3D view separately from the final device view.

### Inspecting the upper HEMT instead of mistaking the full-scale Section for a device cross-section

The **05 HEMT active AlGaN/SiN and ten gate fingers** Bookmark restores a local chip ROI, an X-directed Section crossing the gate/source/drain region and a camera focused on the HEMT. The saved default Section still runs along the _coolant flow_ to show the lower inlet and outlet. These are intentionally separate inspection planes.

The actual 25 nm AlGaN and 150 nm SiN films occupy physically small Z intervals compared with the 800 µm interposer and 100 µm die. At device-wide scale they can remain subpixel: a bright outline or artificially thick stripe must not be advertised as their true material thickness. SiN is an inferred peripheral frame, not a full process-calibrated isolation recipe; 2DEG density and electrostatics remain outside the model.

## Section Z display contract

The initial screenshot audit exposed a presentation hazard: the Workstation's
default automatic Z-break hides the _middle_ of a device, which for this article
contains the four distinct cooling-channel tiers. This example therefore saves
`sectionCollapse: { top: 0, bottom: -150, enabled: false }`, so the complete
Z stack is visible by default. The user can enable a manual Z-break for the
bulk Si afterward. The real Chromium visual acceptance asserts that Section
collapse is initially disabled; simply checking a nonblank canvas is
insufficient for a scientific reconstruction.

## Build and validation commands

    node scripts/build-gan-hemt-microchannel-example.mjs
    node --test site/tests/gan-hemt-microchannel-reconstruction.test.mjs
    node scripts/build-gan-hemt-microchannel-example.mjs --write-repo

The default build writes the candidate project under test-results/gan-microchannel, together with a validation report. The --write-repo switch updates site/examples; the candidate is already registered in the feature-branch Welcome catalog. Registration does not imply scientific approval or production deployment.

The dedicated test checks real four-level cavity Z gaps, two separated remote backside ports and lower feeder routes, source-reported gate/chip masks, idealized Ti/Cu-lined and Cu-filled TSV columns, Save/Reload, and GDSII/OASIS export. The generator also validates the live model after each process, the project schema, and Recipe preflight.

## Verification and release boundary

The following checks have **historical, commit-specific evidence**, including the original geometry run `38580570948` at `86dd56d` and later TSV-focused science run [38738607990](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38738607990) for the Cu-filled surrogate. They do **not** establish current-HEAD CI or final paper-level visual acceptance:

- [x] Full Kernel build and model-schema validation without process errors.
- [x] Project Save/Reload and Recipe Run All from Base; identical final material
      occupancy for 11 materials and 12 Z slabs (maximum mismatched XY area: 0 µm²).
- [x] Canonical four-level empty cavities and remote backside ports, four idealized Ti/Cu-lined and Cu-filled TSV columns, open coolant paths and exposed SiC backside checked against material occupancy and void-connectivity invariants in the relevant focused runs.
- [x] Editable Mask and History preserved; GDSII/OASIS export and source/inferred
      dimensions checked in dedicated tests.
- [x] Real Chromium Main, Mask, 3D and Section screenshots, visual readout and
      thumbnail/Preview integrity checked in a **read-only** CI pipeline.
- [x] Welcome registration and Pages source-to-staged asset inclusion verified by
      the published staging rules and browser/catalog checks.
- [x] Source metadata and assumed geometry separated in the project and docs;
      experimental thermal/flow measurements are never claimed as WaferCAD predictions.

### Explicitly out of scope or unverified

- [x] **Inferred structural fan-outs:** a two-ended curved diversion network with 12 branches, two throats and all six channel connections is modeled. No original GDS is available.
- [ ] **Original hydraulic mask and uniformity:** precise author diversion contours, pressure drop, turbulence/laminar regime and uniformity of parallel-channel flow remain **unverified**.
- [ ] **Native wafer assembly:** two independently etched 400 µm Si wafers cannot
      yet be aligned and directly bonded as a single Kernel process step.
- [ ] **Electrical, thermal and packaging validation:** idealized Cu-filled TSV geometry exists, but via-to-pad Au wiring, oxide isolation, real plating quality, electrical continuity, full Au wire bonds, hermetic seals, CFD, heat transfer and HEMT IV performance remain unverified or absent.
- [ ] **Author layout parity:** original GDS and several exact intermediate
      channel masks are unavailable. Do not label inferred patterns as originals.

### Figure-specific electrical geometry acceptance matrix

| Published structure/process                                           | Candidate geometry                                                                                | Scientific release gate                                                                                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Four-level connected Si microchannels and two backside ports          | Physical voids and inferred external feeders                                                      | Verify 3D void topology, each of six top paths and unobstructed coolant contact to SiC backside                                                     |
| Four electrical TSVs                                                  | Real idealized Ti/Cu seed walls and 35 µm conformal Cu closure in square holes                    | Verify XY/Z occupancy, seed-wall rings, planarity and top/bottom conductor termination; no conductivity claim                                       |
| High-temperature SiO₂ insulating layer after wafer bonding            | Not modeled                                                                                       | Preserve coolant openings and prove SiO₂ electrical isolation before claiming an insulated TSV                                                      |
| Ti/Cu, subsequent Au and NiPaAu interposer plating                    | Ti/Cu present only inside scoped representative TSV windows; complete outer metallization missing | Define paper-supported versus inferred dimensions, 3D termination and material continuity                                                           |
| HEMT backside via and backside attachment metal                       | Not modeled                                                                                       | Reproduce device-side contact through thinned SiC without falsely covering the active coolant surface                                               |
| Two independently mounted GSG Pad chips and Au HEMT-to-GSG wire bonds | Two deposited Au pad footprints only; curved bonds absent                                         | Model separate chips and actual wire geometry, and verify the intended HEMT ↔ GSG electrical path (distinct from TSV grounding)                     |
| Physical bond of two separately processed 400 µm Si wafers            | One interposer with four virtual bridge tiers                                                     | Depend on the native Bond work in PR #264; preserve wafer provenance, source masks and replay                                                       |
| Paper Fig. 1(a) visual correspondence                                 | Partial structural surrogate                                                                      | Independently inspect true coolant Section, transverse TSV Section and HEMT close-up; explicitly label inferred dimensions and different cut planes |

A visually continuous gold line or top-level schematic annotation is **not evidence of an electrical connection**. A claimed route needs material occupancy through intermediate XY/Z locations, a physically credible contact interface, replay fidelity and saved-project equivalence. A registered layer name is not sufficient.

### Current integration and evidence gate

- The branch remains **Draft**. GitHub's exact PR HEAD, mergeability and required CI checks must be re-verified after each documentation or asset update; a passed older focused run is never evidence that a new HEAD is green.
- Inspect **actual rendered Chromium evidence** independently for three physically different scales/cut planes: longitudinal coolant ports/manifold, transverse Cu-filled TSVs, and the locally magnified HEMT with a thickness legend. A combined Fig. 1(a)-style view must not imply a single co-planar cross-section or scale 25 nm / 150 nm films up to false thicknesses.
- A final paper comparison must explicitly note the absent wafer-to-wafer direct bond, missing Au/TSV-to-pad electrical routes, absent original GDS, inferred dimensions and no thermal/CFD/electrical validation. Passing geometry and replay checks alone does not close these scientific gates.
- Reconcile with contemporary Main in a controlled integration branch and run the necessary targeted scientific/visual checks before broader release Quality. Do not merge or deploy without explicit approval.

### Figure review

The real Section captures a four-level stepped opening under the SiC HEMT, consistent
with the principal **topological layout** in article Fig. 1a / Fig. 2g. The real
3D half-cutaway reveals the central channels. The reconstructed curved end
diversions follow the _topological pattern_ in Fig. 1(c) and Fig. 2(h) but
are not digitized exact original masks. Both views are structural checks,
not dimensional image-matching or a proof of complete flow equivalence.

Native two-wafer reconstruction needs independently processed wafer models plus a validated bond/attach operation; this example implements neither a real bonded interface nor a second independently modeled wafer. This candidate is suitable for
review **as a labeled geometric surrogate only**. No thermal or fluid-transport
simulation is implied.
