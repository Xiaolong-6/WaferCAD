# Fig. 1a/1b scientific and visual acceptance — T-CMOS candidate

**Status: qualified qualitative structure only; physical tunnel-junction reproduction NOT accepted.** This is a source-traceability and real-browser evidence record, not an electronic-device simulation.

## Sources and evidence

- Literature: Jeong et al., *Nature Electronics* (2019), [DOI 10.1038/s41928-019-0272-8](https://doi.org/10.1038/s41928-019-0272-8), especially Fig. 1a–b, Methods and Supplementary Fig. 1.
- Real Chromium acceptance: [run 38744110625](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38744110625), [browser artifact 11978041932](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38744110625/artifacts/11978041932). Includes `browser-acceptance.json`, unmodified candidate, local-inspection derivatives and original PNG evidence.
- Targeted Kernel/Recipe/storage and Chromium Run All on previous exact head `32373ce`: pass; Quality: pass. Later heads must be verified independently. The evidence is from the **existing CI Chromium run**, not a new local browser run.

## Fig. 1a: source topology versus demonstrated model

| Criterion | Source | WaferCAD evidence and disposition |
| --- | --- | --- |
| Complementary topology | Left pMOS in n-well; right nMOS in p-well | Both modeled with corresponding well markers: **qualitative pass**. |
| Source / Drain / Gate | Two MOS structures; common VIN gates, joined VOUT drains, VDD / GND sources | Two distinct POLY geometries, silicon/silicide/W/Metal1 interfaces and net isolation checked: **topology pass**. |
| Body-tie contacts | Inverter bias requires connection to body/well | Inferred U-shaped body ties with Si/W/Metal1; n+/p+ contact implant and ohmic behavior **not validated**. |
| Enhanced body doping | HVTN As+ on pMOS; HVTP BF2+ on nMOS | Qualitative material-clipped body intervals visible in both local Sections and ROI cutaways. 80–240 nm model interval is **assumed**. |
| Body–drain junction | Highly doped PN interface and BTBT at the body-to-drain junction | Both HVT–HDD source and drain annotations co-occupy volumes. Neither depletion boundary, electrical PN interface, carrier profile nor BTBT is solved: **fail for physical-junction acceptance**. |
| Energy bands / ternary VTC | Bias-specific BTBT band diagrams and electronic output | Not produced by Kernel; **out of scope**, not a simulated result. |

The paper reports **commercial 130 nm and 90 nm CMOS foundry processes**. It does **not** provide a measured physical gate length for this depicted local cell. The candidate chooses `GATE_LENGTH_UM=0.13`; this is a geometry assumption, **not source-confirmed measured L**, despite sharing the 130 nm node number.

## Fig. 1b: Mask/layout correspondence

| Criterion | Browser / model evidence | Disposition |
| --- | --- | --- |
| ACTIVE / STI and complementary wells | Full Section and 3D show both side-by-side MOS structures | Qualitative topology pass. |
| LVTN / LVTP and HVTN / HVTP labels | Left HVTN pMOS / right HVTP nMOS correct; LVTN/LVTP are reference-only masks, not T-CMOS process doping | Naming and branch intent pass. |
| Two POLY gates and contacts | Model assigns 0.13 µm assumed gate widths and separate CNT contacts | Model-internal geometry pass, **not foundry-dimension pass**. |
| VDD, VOUT, GND, VIN | Four separate METAL1 net footprints; VOUT joins both drains, VIN both gates | Model-internal topology pass. |
| Polygon counts and serialization | GDS and OAS both export 13 layers, 80 elements | Geometry interoperability pass. |
| Exact physical layout dimensions | Paper does not disclose the complete foundry GDS or mask coordinates | Unverifiable; candidate is a reconstructed layout, **not a digitized foundry mask**. |

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
- In illustrative geometry each pMOS and nMOS body/HDD annotation co-occupies Source area 1.287 µm² and Drain area 1.703 µm², Z=0.82–0.92 µm; **co-occupancy is not a PN junction**.
- HVT annotation material clipped to matching schematic Well: 0.51584 µm³; residual silicon below STI outside matching Well: 0.01364 µm³, per device. Actual oxide stopping power/implant penetration is unknown.
- Both Well ties geometrically contact Si/W/Metal1 with appropriate schematic well polarity; n+/p+ contact doping is missing and ohmic conduction not established.
- Candidate is immutable across these diagnostic-only refinements. The alternate 18° tilt demonstration is explicitly NOT PAPER.

## Acceptance decision and next stage

**Accept as a qualified, clearly labeled illustrative structural T-CMOS example** for further candidate review, with complete Recipe, two process Variants and the above image evidence. **Do not approve it as a quantitatively reproduced body–drain tunnelling junction** or as verified BTBT / ternary-transfer simulation.

Unresolved science requires foundry implant energy, dose, activation and diffusion details or an explicitly approximate semiconductor model before true PN-surface extraction, contact resistivity or BTBT calculation. Those are separate Kernel/semiconductor-model milestones and must not be simulated by shaded annotations or arbitrary dimensions.

Keep PR #225 Draft and out of Welcome pending explicit release/merge approval. This record alone does not authorize Main merge.
