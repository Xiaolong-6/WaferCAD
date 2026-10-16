**Mask approval gate (2026-10-16):** The uploaded `layout-complete.svg` is the authoritative visual and polygon source. Eight SVG layers represent 232 precise paths/rectangles/CNT footprints, and the CAD File Mask exports exactly those 8 layers/232 shapes. The five old process-only mask layers remain internal to the Recipe and are excluded from File Mask/GDS/OAS. Earlier pixel/raster and Metal strap reconstructions are superseded. The process Recipe is not yet synchronized: its preflight currently reports missing auxiliary mask layers 2, 3, 7, 8 and 9, so Run All is not validated. The independent Mask-only Chromium and GDS/OAS export gate passes. **User Mask approval is pending; process and final PR acceptance are NOT passed.**

# Fig. 1a/1b scientific and visual acceptance — T-CMOS candidate

**Scope: paper process flow, Mask/layout, and 3D/Section structural reconstruction only.** Qualified illustrative geometry is the acceptance target. Semiconductor-device physics is not part of WaferCAD or PR #225.

## Sources and evidence

- Literature: Jeong et al., _Nature Electronics_ (2019), [DOI 10.1038/s41928-019-0272-8](https://doi.org/10.1038/s41928-019-0272-8), especially Fig. 1a–b, Methods and Supplementary Fig. 1.
- Real Chromium acceptance: [run 38744110625](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38744110625), [browser artifact 11978041932](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38744110625/artifacts/11978041932). Includes `browser-acceptance.json`, unmodified candidate, local-inspection derivatives and original PNG evidence.
- Last fully verified pre-cleanup Head `61da11e`: [T-CMOS targeted/Chromium](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38871820768), [Quality](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38871820753), [Mask](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38871820798), [full-array renderer](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38871820661), and [M3D Welcome](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38871820854) all passed. The cleanup Head requires its own targeted verification.

## Fig. 1a: source topology versus demonstrated model

| Criterion                  | Source                                                                      | WaferCAD evidence and disposition                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Complementary topology     | Left pMOS in n-well; right nMOS in p-well                                   | Both modeled with corresponding well markers: **qualitative pass**.                                                                                                                                          |
| Source / Drain / Gate      | Two MOS structures; common VIN gates, joined VOUT drains, VDD / GND sources | Two distinct POLY geometries, silicon/silicide/W/Metal1 interfaces and net isolation checked: **topology pass**.                                                                                             |
| Body-tie contacts          | Inverter bias requires connection to body/well                              | Inferred U-shaped body ties with Si/W/Metal1; n+/p+ contact implant and ohmic behavior **not validated**.                                                                                                    |
| Enhanced body doping       | HVTN As+ on pMOS; HVTP BF2+ on nMOS                                         | Qualitative material-clipped body intervals visible in both local Sections and ROI cutaways. 80–240 nm model interval is **assumed**.                                                                        |
| Body–drain region          | Paper attributes tunnelling to highly doped body/drain regions              | Material-clipped HVT/HDD **structural annotations** are visualized. External PN/BTBT simulation results may later be overlaid; no device-physics calculation or quantitative PN acceptance is required here. |
| Energy bands / ternary VTC | Bias-specific BTBT band diagrams and electronic output                      | Outside the PR #225 reconstruction scope; externally computed data can be displayed separately with source and units.                                                                                        |

The paper reports **commercial 130 nm and 90 nm CMOS foundry processes**. It does **not** provide a measured physical gate length for this depicted local cell. The candidate uses a **0.44 µm illustrative POLY band** traced from the image's 24-pixel drawn width; it is **not a source-confirmed physical gate length**, despite the paper's 130 nm technology-node label.

## Fig. 1b: Mask/layout correspondence

**Pixel registration evidence (2026-10-16):** The original user-provided Fig. 1b
is 713×498 px, SHA-256 prefix `f39c0b4562ab2eec`. Its x/y geometry is
measured and mapped by one transform: pixel origin (359,365), 54 pixels per
illustrative µm, coordinates snapped to 0.01 µm. Key measured rectangles are
ACTIVE-left (137,356)-(259,398), ACTIVE-right (460,356)-(582,398),
POLY-left (186,327)-(210,401), HVTN (133,307)-(266,409),
HVTP (455,306)-(588,409), VIN top (188,151)-(532,191), VOUT top
(237,208)-(483,248). Fig. 1b does not specify actual mask micrometres.
The overlay and exact-head real-Chromium screenshot are compared at identical
pixel registration, with no digitally painted CAD screenshot.

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
| Two POLY gates and contacts          | Model assigns 0.44 µm pixel-measured illustrative gate bands and separate CNT contacts                  | Model-internal geometry pass, **not foundry-dimension pass**.                                         |
| VDD, VOUT, GND, VIN                  | Four separate METAL1 net footprints; VOUT joins both drains, VIN both gates                             | Model-internal topology pass.                                                                         |
| Polygon counts and serialization     | Fig. 1b redrawing now uses 8 layers and 232 SVG Mask elements                                              | File Mask generation and candidate browser export; latest committed-Head CI remains the release gate. |
| Exact physical layout dimensions     | Paper does not disclose the complete foundry GDS or mask coordinates                                    | Unverifiable; candidate is a reconstructed layout, **not a digitized foundry mask**.                  |

## Browser screenshots inspected

- `tcmos-fig1a-three-expanded.png`: full complementary-device 3D, electrode and substrate context.
- `tcmos-fig1a-section-expanded.png`: same two devices with section stack and annotations.
- `tcmos-fig1a-pmos-HVTN-local-section.png`: pMOS Section A=(-3.65, 0), B=(-2.35, 0) µm.
- `tcmos-fig1a-nmos-HVTP-local-section.png`: nMOS Section A=(2.35, 0), B=(3.65, 0) µm.
- `tcmos-fig1a-pmos-HVTN-HVT-ONLY-display-3d.png`: ROI=(-3.85, 0) to (-2.15, 0.75) µm.
- `tcmos-fig1a-nmos-HVTP-HVT-ONLY-display-3d.png`: ROI=(2.15, 0) to (3.85, 0.75) µm.

HVT-only PNGs isolate one annotation via real Section visibility toggles; full-marker captures remain available. Their display-only Z break [top=0.68, bottom=-0.8] µm alters presentation only. Do not infer a measured 80–240 nm dopant profile or thickness from pixel heights.

## Scientific and transaction checks

- Browser Run All from fresh Base: 23/23 steps. Material parity: 26 compared slabs, maximum XY mismatch area 1.6653345369377348e-15 µm²; Save/Reload and Recovery pass.
- In the revised geometry each pMOS and nMOS body/HDD annotation co-occupies Source and Drain areas of **0.6864 µm² (pMOS Source/Drain), 0.6708 µm² (nMOS Drain), and 0.7020 µm² (nMOS Source)**, Z=0.82–0.92 µm within ACTIVE silicon; **co-occupancy is not a PN junction**.
- HVT annotation clipped to matching schematic Well: **0.282048 µm³**; residual silicon below STI outside matching Well: **0.028808 µm³** (pMOS), **0.029112 µm³** (nMOS). Actual oxide stopping power/implant penetration is unknown.
- Both Well ties geometrically contact Si/W/Metal1 with appropriate schematic well polarity; n+/p+ contact doping is missing and ohmic conduction not established.
- Candidate is immutable across these diagnostic-only refinements. The alternate 18° tilt demonstration is explicitly NOT PAPER.

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
