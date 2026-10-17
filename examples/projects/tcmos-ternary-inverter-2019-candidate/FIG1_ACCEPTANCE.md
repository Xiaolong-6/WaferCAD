**Stage update (2026-10-17):** The user approved the vector SVG Mask. The exact
8-layer/232-element File Mask and GDS/OAS remain source-authoritative.
Five auxiliary well/source-drain/silicide windows are private, SVG-derived
per-step Draw Masks. The 23-step Recipe, Save/Recovery and 26-slab material
geometry parity have passed in real Chromium; the independent Mask-only
Chromium acceptance also passes. Section/3D ROI was re-centered on the
actual SVG transistor sites. Final exact-HEAD CI, Welcome and Main merge
are separate gates; no quantitative PN/BTBT claim is made.

# Fig. 1a/1b scientific and visual acceptance — T-CMOS candidate

**Scope: paper process flow, Mask/layout, and 3D/Section structural reconstruction only.** Qualified illustrative geometry is the acceptance target. Semiconductor-device physics is not part of WaferCAD or PR #225.

## Sources and evidence

- Literature: Jeong et al., _Nature Electronics_ (2019), [DOI 10.1038/s41928-019-0272-8](https://doi.org/10.1038/s41928-019-0272-8), especially Fig. 1a–b, Methods and Supplementary Fig. 1.
- Real Chromium acceptance: [run 38744110625](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38744110625), [browser artifact 11978041932](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38744110625/artifacts/11978041932). Includes `browser-acceptance.json`, unmodified candidate, local-inspection derivatives and original PNG evidence.
- SVG-aligned current-stage evidence: [Chromium Recipe, Section, ROI and Mask run 39004845657](https://github.com/Xiaolong-6/WaferCAD/actions/runs/39004845657), [Quality 39004845589](https://github.com/Xiaolong-6/WaferCAD/actions/runs/39004845589). These establish the reconstruction stage, not final merge authorization.

## Fig. 1a: source topology versus demonstrated model

| Criterion                  | Source                                                                      | WaferCAD evidence and disposition                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Complementary topology     | Left pMOS in n-well; right nMOS in p-well                                   | Both modeled with corresponding well markers: **qualitative pass**.                                                                                                                                          |
| Source / Drain / Gate      | Two MOS structures; common VIN gates, joined VOUT drains, VDD / GND sources | Two distinct POLY geometries, silicon/silicide/W/Metal1 interfaces and net isolation checked: **topology pass**.                                                                                             |
| Body-tie contacts          | Inverter bias requires connection to body/well                              | Inferred U-shaped body ties with Si/W/Metal1; n+/p+ contact implant and ohmic behavior **not validated**.                                                                                                    |
| Enhanced body doping       | HVTN As+ on pMOS; HVTP BF2+ on nMOS                                         | Qualitative material-clipped body intervals visible in both local Sections and ROI cutaways. 80–240 nm model interval is **assumed**.                                                                        |
| Body–drain region          | Paper attributes tunnelling to highly doped body/drain regions              | Material-clipped HVT/HDD **structural annotations** are visualized. External PN/BTBT simulation results may later be overlaid; no device-physics calculation or quantitative PN acceptance is required here. |
| Energy bands / ternary VTC | Bias-specific BTBT band diagrams and electronic output                      | Outside the PR #225 reconstruction scope; externally computed data can be displayed separately with source and units.                                                                                        |

The paper reports **commercial 130 nm and 90 nm CMOS foundry processes**. It does **not** provide a measured physical gate length for this depicted local cell. The candidate uses a **0.48125 µm illustrative POLY stripe** traced from the approved SVG (38.5/80 vector units); it is **not a source-confirmed physical gate length**, despite the paper's 130 nm technology-node label.

## Fig. 1b: Mask/layout correspondence

**Source-vector registration (2026-10-17):** The user-provided
`layout-complete.svg` has viewBox 1113×758, reference origin (560,480)
and 80 vector units per illustrative µm. It directly supplies all 232
visible polygons, including four complete METAL1 paths and 218 CNT sites.
No longer use the superseded 713×498 screenshot pixel-box reconstruction
or its old 0.44 µm POLY estimate. Source vectors are not foundry GDS or
physical mask metrology. The internal Recipe masks are deterministically
derived from SVG ACTIVE/POLY geometry and stored separately from File Mask.

**2026-10-16 redraw:** The revised Mask has distinct inverted-U VIN and VOUT
bridges above the devices, source-rail inverted U shapes on the outer edges,
and two U-shaped body-tie/CNT arrays underneath. The drawing tracks the
user-provided Fig. 1b schematic's relative geometry and colors. It is not
foundry layout metrology. Four named Metal1 groups remain mutually disjoint. Fig.1b leaves white
gaps between each outer VDD/GND supply leg and the inner U-shaped body
rail. Each drawn island is internally verified; a supply/body wire not
shown in the figure is not invented or claimed as physically connected. Every Source/Drain terminal now has a 3×3 CNT matrix. Remaining paper-vs-browser
style differences are the Mask UI's filled HVT/LVT windows rather than the
original illustration's outline-only labels.

| Criterion                            | Browser / model evidence                                                                                | Disposition                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| ACTIVE / STI and complementary wells | Full Section and 3D show both side-by-side MOS structures                                               | Qualitative topology pass.                                                                            |
| LVTN / LVTP and HVTN / HVTP labels   | Left HVTN pMOS / right HVTP nMOS correct; LVTN/LVTP are reference-only masks, not T-CMOS process doping | Naming and branch intent pass.                                                                        |
| Two POLY gates and contacts          | Model assigns 0.48125 µm SVG-derived illustrative POLY stripes and separate CNT contacts                  | Model-internal geometry pass, **not foundry-dimension pass**.                                         |
| VDD, VOUT, GND, VIN                  | Four separate METAL1 net footprints; VOUT joins both drains, VIN both gates                             | Model-internal topology pass.                                                                         |
| Polygon counts and serialization     | Fig. 1b redrawing now uses 8 layers and 232 SVG Mask elements                                              | File Mask generation and candidate browser export; latest committed-Head CI remains the release gate. |
| Exact physical layout dimensions     | Paper does not disclose the complete foundry GDS or mask coordinates                                    | Unverifiable; candidate is a reconstructed layout, **not a digitized foundry mask**.                  |

## Browser screenshots inspected

- `tcmos-fig1a-three-expanded.png`: full complementary-device 3D, electrode and substrate context.
- `tcmos-fig1a-section-expanded.png`: same two devices with section stack and annotations.
- `tcmos-fig1a-pmos-HVTN-local-section.png`: pMOS Section A=(-4.28, -1.2), B=(-2.16, -1.2) µm.
- `tcmos-fig1a-nmos-HVTP-local-section.png`: nMOS Section A=(2.16, -1.2), B=(4.28, -1.2) µm.
- `tcmos-fig1a-pmos-HVTN-HVT-ONLY-display-3d.png`: ROI=(-4.37, -1.85) to (-2.07, -0.25) µm.
- `tcmos-fig1a-nmos-HVTP-HVT-ONLY-display-3d.png`: ROI=(2.07, -1.85) to (4.37, -0.25) µm.

HVT-only PNGs isolate one annotation via real Section visibility toggles; full-marker captures remain available. Their display-only Z break [top=0.68, bottom=-0.8] µm alters presentation only. Do not infer a measured 80–240 nm dopant profile or thickness from pixel heights.

## Scientific and transaction checks

- Browser Run All from fresh Base: 23/23 steps. Material parity: 26 compared slabs, maximum XY mismatch area 0 µm²; Save/Reload and Recovery pass.
- In the revised geometry each pMOS and nMOS body/HDD annotation co-occupies Source and Drain areas of **0.7033125 µm² (pMOS/nMOS Source) and 0.6985075 µm² (pMOS/nMOS Drain)**, Z=0.82–0.92 µm within ACTIVE silicon; **co-occupancy is not a PN junction**.
- HVT annotation clipped to matching schematic Well: **0.2914 µm³** per polarity; residual silicon outside matching Well: **0.03144095 µm³** per polarity. Actual oxide stopping power/implant penetration is unknown.
- Both Well ties geometrically contact Si/W/Metal1 with appropriate schematic well polarity; n+/p+ contact doping is missing and ohmic conduction not established.
- Candidate File Mask SVG is immutable across these process-derived refinements. The alternate 18° tilt demonstration is explicitly NOT PAPER.

## External simulation visualization: product boundary

WaferCAD **does not solve PN junctions, Poisson, electric fields, BTBT or transistor currents**.
When somebody has already calculated results elsewhere, WaferCAD's role is to **import and
visualize supplied results** over its reconstructed geometry:

- Externally supplied scalar inputs (for example an effective junction thickness or a
  measured current at a stated bias) are shown as labeled parameters, legends or plots,
  with units and provenance. A scalar alone **cannot establish the 3D shape of a PN junction**.
- If the external tool supplies explicit coordinates and spatial profiles or contours
  (for example a PN boundary, a 2D concentration map or a current-density field),
  an independently developed visualization importer can map the supplied data to the
  WaferCAD coordinate frame and render it in Section/3D without changing the geometry.
- An imported result must retain its source, units, coordinate alignment, bias/state,
  and display-only status. Any interpolation is a display choice, **not a physical prediction**.
- No solver, concentration field generated from an Implant annotation, TCAD calibration
  requirement, or BTBT readiness gate is part of PR #225.

**Status:** the existing qualitative Implant/Section/3D visualization is implemented
and browser-tested. A generic external PN/BTBT field importer is **not implemented or
accepted** in this PR; it is a separately scoped future visualization feature if needed.

## Acceptance decision and next stage

**Accept as a qualified, clearly labeled illustrative process and 3D structural
reconstruction** with complete Recipe, two process Variants, traceable masks and
real-browser visual evidence. This PR does not require numerical PN/BTBT matching;
it must not present illustrative color bands as externally computed data.

Keep PR #225 Draft and out of Welcome pending explicit release/merge approval.
This record alone does not authorize Main merge.


## 2026-10-17 — 4×4 native array prototype acceptance

After explicit user approval to extend beyond one cell, an independent
**inspection-only** project was generated from the accepted SVG and
unit's final physical model. It contains 16 spatially distinct cells on
a **56 × 32 µm illustrative field**, one canonical physical model
template, 16 native array instances, and **3,712 File Mask polygons**
(8 SVG layer groups; 218 × 16 = 3,488 CNTs). The default ILD is visible.
The original 1×1 project retains its 23-step Recipe and historical
Variants. In a subsequent separate gate, native **4×4 23/23 Recipe,
23 actual History nodes, and actual Save → Recovery Restore passed**,
with 26 material Z intervals and **0 µm²** expanded XY difference.
All-cell electrical fanout, pad routing and 8×8/wafer layout are
**not accepted or claimed**.

Actual Chromium screenshot evidence: [PR #225 4×4 and 1×1 replay
artifact](https://github.com/Xiaolong-6/WaferCAD/actions/runs/39008666718/artifacts/12091638844).
It includes `tcmos-4x4-mask-chromium.png`,
`tcmos-4x4-three-chromium.png` and
`tcmos-4x4-section-chromium.png`, plus the browser acceptance JSON.
The 4×4 scientific test verifies all 16 Mask translations, native
instance ownership, lossless project storage and non-calibrated dopant
intent at every cell. Chromium visual inspection confirms visible oxide,
16 structures and coherent cross-row sections.

**Physical limitation:** the approved SVG has four independent Metal1
paths, with source/body tie joined in the same VDD and GND polygons.
The obsolete raster-island audit is not the actual SVG connectivity.
Ohmic body contact, PN/BTBT, full inter-cell
routing remain unverified; whole-array Recipe/History/Recovery geometry,
by contrast, has been separately verified. Electrical behavior cannot
be inferred from the wafer photograph; final Main merge and
Welcome registration remain unauthorized.

**4×4 exact browser evidence:** [run 39018054248](https://github.com/Xiaolong-6/WaferCAD/actions/runs/39018054248),
[artifact 12096020375](https://github.com/Xiaolong-6/WaferCAD/actions/runs/39018054248/artifacts/12096020375),
and the [committed verified project](tcmos-inverter-4x4-replayed.wafercad).
The final array reproduces **23/23 steps**, 8 materials, **26 physical
Z slabs with 0 µm² maximum XY mismatch**, 23 History nodes, and
Save → mutate → Recovery Restore with another 26-slab zero-difference
material check. GDS/OAS each retain 8 layer groups and 3,712 polygons.
