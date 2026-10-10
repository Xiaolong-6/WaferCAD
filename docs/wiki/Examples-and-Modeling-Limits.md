# Examples and Modeling Limits

[Home](Home) · [Recipe Code Tutorial](Recipe-Code-Tutorial) · [Process Operations](Process-Operations)

## Welcome example catalog

The **Welcome** screen presents **eight editable device/application families** across literature and fabrication examples. The current source of truth is [`site/bundled-examples.js`](https://github.com/Xiaolong-6/WaferCAD/blob/main/site/bundled-examples.js); the cards link to full `.wafercad` projects, including their History, Variants, Mask state and inspection views. Click a project's **title or description** on Welcome to open it. The preview offers Main/Mask/3D/Section inspection of a curated state, not the complete process replay.

| Welcome project                                                                                                                                                | What you can inspect                                                                                                                                  | Literature and provenance                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Photodetectors with nanopatterns**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=photodetector-literature)                          | Black-Si Fig. 1a and Ge Fig. 15 in one family project; branched process histories and final/QA or A/B structures                                      | Setälä _et al._, _ACS Photonics_ (2023), [DOI](https://doi.org/10.1021/acsphotonics.2c01984); Liu _et al._, _Light: Science & Applications_ (2025), [DOI](https://doi.org/10.1038/s41377-024-01670-4) |
| [**PERC solar cells with point contacts**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=perc-point-contact-solar-cell)                 | Silicon texturing, junction/passivation annotations, local rear contact openings and metallization; source-order and patterned-contact alternatives   | Blakers _et al._, _Applied Physics Letters_ (1989), [DOI](https://doi.org/10.1063/1.101596)                                                                                                           |
| [**Fully textured perovskite–silicon tandems**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=fully-textured-perovskite-silicon-tandem) | Double-sided pyramid texture, SHJ bottom cell, conformal perovskite top-cell layers, ALD SnO₂, IZO and surrogate Ag grid; nc-Si:H / ITO branches      | Sahli _et al._, _Nature Materials_ (2018), [DOI](https://doi.org/10.1038/s41563-018-0115-4)                                                                                                           |
| [**Suspended silica microdisks**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=suspended-silica-microdisk)                             | Geometrically released annular air gap, silica disk and surviving central Si support pedestal                                                         | Basiri-Esfahani _et al._, _Nature Communications_ (2019), [DOI](https://doi.org/10.1038/s41467-018-08038-4)                                                                                           |
| [**Self-powered heterogeneous M3D circuits**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=m3d-selfpowered-heterogeneous-ic)           | 27 stage bookmarks (S00–S26) and 36 History nodes: Si photovoltaic supply tier, WSe₂/MoS₂ logic, graphene sensing, vias and encapsulation             | Ghosh _et al._, _Nature Electronics_ (2026), [DOI](https://doi.org/10.1038/s41928-026-01624-1)                                                                                                        |
| [**MoS₂ computer with four-level BEOL interconnect**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=magic-1000-mos2-beol)               | Representative M4–M1 Al wiring, four W via tiers, ILD/CMP, W gates, HfO₂, transferred MoS₂ and local D/E-mode FET pair                                | Fan _et al._, _Nature Electronics_ (2026), [DOI](https://doi.org/10.1038/s41928-026-01641-0). Mask coordinates and ILD overfill are inferred; ~0.5 µm CMP clearance follows Methods.                  |
| [**Three-tier silicon junctionless transistors**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=three-tier-silicon-jlfets)              | Three stacked transistor tiers, conformal HfO₂ gates, contacts, ILD, transfer and CMP assumptions; 625-site wafer project with 40 saved History Steps | Lam _et al._, _Nature_ (2026), [DOI](https://doi.org/10.1038/s41586-026-10496-6)                                                                                                                      |

| [**TiO₂ achromatic metalens · four meta-atoms**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=tio2-metalens-four-unit) | 4,725-site illustrative array with four meta-atom families, matching Mask and nine-step compiled History; cover previews four units | Wang _et al._, _Nature Communications_ (2021), [DOI](https://doi.org/10.1038/s41467-021-25797-9). Unit sizes and site placement are illustrative; the article does not publish the optimized 4,725-site GDS. |

These eight entries match the Welcome catalog on this reconstruction branch; they become shipped examples after merging to main. Other research reconstructions or development fixtures in `examples/projects/` are not necessarily Welcome examples. When a new example is actually added to `BUNDLED_EXAMPLES`, update this catalog and keep the documented title and project ID synchronized. The repository's Welcome example tests validate the promoted project files.

## 1. Photodetectors with nanopatterns

![Shipped WaferCAD 3D example preview](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/photodetector-literature-three.webp)

_Preview image from the current Welcome example. Open the project and inspect individual History states, Section and Masks to evaluate the actual process sequence._

![Photodetector Section screenshot from the accepted Windows visual baseline](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/tests/visual-baselines/windows-chromium/photodetector-section.png)

_Section screenshot from a reproducible browser visual reference (2026-10-05); device geometry and visual results can evolve after later Kernel changes._

**Black-Si photodiode — Setälä 2023, Fig. 1a**

- Silicon Base, SiO₂ patterning, schematic ICP-RIE Black-Si morphology, front B/rear P Implant markers, thermal/clean process records, conformal Al₂O₃ passivation and Al contacts.
- A **FINAL** Variant protects the active ALD and selectively removes blanket Al; the **QA** Variant intentionally illustrates nonselective overetch and is **not** a fabrication recommendation.
- Morphology relief, inferred masks and some lateral dimensions are **illustrative reconstructions**. Implantation is a depth annotation; drive-in and forming-gas anneals are metadata records.

**Ge photodetector — Liu 2025; thesis Fig. 15**

- Ge Base, a temporary SiNₓ implantation mask, B/P contact Implant annotations, temporary Al₂O₃ etch mask, nanostructured Ge etch and cleaning records.
- **A**: front Al₂O₃ coverage; **B**: inactive-area SiO₂/Al₂O₃. Induced p-inversion and n-accumulation use **Electrical Region** annotations.
- Ge-hosted Electrical Region marks may be placed in the saved geometric sequence ahead of the physically causative passivation deposition to preserve their material host. Read the annotations as **anticipated** zones, not prematurely induced physical states.

For detailed assumptions, source differences, and the reconstruction acceptance scope see [Photodetector kernel rebuild notes](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/PHOTODETECTOR_RECONSTRUCTION_V2_2026-10-08.md).

## 2. PERC solar cells with point contacts

![Shipped WaferCAD 3D example preview](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/perc-point-contact-solar-cell-three.webp)

_Preview image from the current Welcome example. Open the project and inspect individual History states, Section and Masks to evaluate the actual process sequence._

The PERC family demonstrates front/back processing and locally patterned rear contacts. Inspect the source-order fabrication Variant and the alternative GDS-patterned-contact Variant to understand which geometry comes from a mask and which parts are structural simplifications. Doping/diffusion regions are represented schematically: **photovoltaic conversion efficiency is not calculated**.

## 3. Fully textured perovskite–silicon tandems

![Shipped WaferCAD 3D example preview](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/fully-textured-perovskite-silicon-tandem-three.webp)

_Preview image from the current Welcome example. Open the project and inspect individual History states, Section and Masks to evaluate the actual process sequence._

This project illustrates two-sided silicon pyramid texture and a multilayer tandem stack. The saved Variants compare an nc-Si:H recombination-junction construction with an ITO control. The 3D and Section views are useful for inspecting conformal materials across the ideal texture and the surrogate front Ag fingers.

**Interpretation limit:** Pyramid morphology is renderer metadata; the geometry Kernel still processes the ideal 2.5D material interfaces. The project is not a resolved nanoscale ALD/perovskite growth prediction.

## 4. Suspended silica microdisks

![Shipped WaferCAD 3D example preview](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/suspended-silica-microdisk-three.webp)

_Preview image from the current Welcome example. Open the project and inspect individual History states, Section and Masks to evaluate the actual process sequence._

Use Main, Section and 3D to inspect the actual canonical void and supported disk. This example is most useful for explaining isotropic/undercut release and the difference between an open cavity and a hidden or painted surface. It does not simulate release chemistry, device motion, optical modes or acoustic sensitivity.

## 5. Self-powered heterogeneous M3D circuits

![Shipped WaferCAD 3D example preview](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/m3d-selfpowered-heterogeneous-ic-three.webp)

_Preview image from the current Welcome example. Open the project and inspect individual History states, Section and Masks to evaluate the actual process sequence._

The kernel-reconstructed literature example includes the silicon photovoltaic power tier, WSe₂/MoS₂ logic, graphene sensor, vias, conformal Al₂O₃ encapsulation and selective sensing windows. The full editable project contains **36 History nodes** and **27 stage bookmarks (S00–S26)**.

**Modeling and persistence boundary:** The source paper does not supply original layout polygons for every route; reconstructed masks are inferred, and 2D-material film thicknesses are visualization surrogates. Exact material interfaces require **lossless** `.wafercad` persistence; quantizing to the compact 0.1 nm grid is unsafe and should automatically fall back to lossless storage. A fresh `Rebuild Base first → Run All` completed all 35 operations on the desktop-audited product revision, with actual Kernel length requests and final export checked. The [desktop audit](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/PRE_MAIN_DESKTOP_AUDIT_2026-10-08.md) also records 36-node History, 27 bookmarks, Border/Opacity and lossless import/export checks. This is geometric replay evidence for that revision and environment, not fabrication validation.

## 6. MoS₂ computer with four-level BEOL interconnect

![WaferCAD 3D preview of the paper-derived MAGIC-1000 local stack](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/magic-1000-mos2-beol-three.webp)

![Real WaferCAD Section screenshot showing four buried metal interconnect levels, vias and upper MoS2 FETs](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/magic-1000-mos2-beol-section.webp)

_Chromium-generated Section with a 2.5D reconstructed material stack; visually compare material sequence against the paper's Fig. 1e, not actual published mask coordinates. The grey horizontal break is the Section Z-collapse display control, not a material void._

_Real WaferCAD browser-rendered 3D preview, generated by the candidate branch acceptance workflow. It becomes available at the main URL upon merge; see the candidate [reconstruction README](https://github.com/Xiaolong-6/WaferCAD/blob/feat/magic-1000-mos2-beol-reconstruction/examples/projects/magic-1000-2026-candidate/README.md) before then._

This local Figure 1-inspired reconstruction demonstrates a paper-derived 300 nm SiO₂ isolation and four prefabricated aluminium interconnect levels (M4–M1), each with patterned 10/20/250/20/10 nm Ti/TiN/Al/TiN/Ti films. Interlevel dielectric overfill, CMP, W vias, a planarized 400 nm W gate, conformal 10 nm HfO₂ and transferred monolayer MoS₂ are built with the live Process Kernel. Sb 20 nm/Au 40 nm contacts and local D-mode AlOx complete a two-transistor representative cell.

**Scientific limit:** No full-chip 1,433-transistor GDS or precise routing geometry was published. The local masks, ~0.5 µm CMP clearance from Methods, 2 µm illustrative handle thickness, 0.7 nm display MoS₂ and 10 nm AlOx surrogate are identified assumptions. Anneal, HfO₂ gate-access lithography and threshold-tuning information are documented as non-geometric Record steps. The Electrical Region annotation does not simulate doping or threshold voltage.

## 7. Three-tier silicon junctionless transistors

![Shipped WaferCAD 3D example preview](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/three-tier-silicon-jlfets-three.webp)

_Preview image from the current Welcome example. Open the project and inspect individual History states, Section and Masks to evaluate the actual process sequence._

The Welcome preview uses a **single-site source** for responsive inspection. Opening the project loads the **625-site full-wafer array**, containing three stacked silicon transistor tiers and **40 stored History Steps**. Deposition, conformal gate dielectrics, inter-tier transfer and CMP are represented with documented geometric assumptions.

**Important acceptance distinction:** A 625-site file with a saved 40-Step process history is not, by itself, proof that every operation was recomputed on the full wafer by `Run All`. The [desktop audit](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/PRE_MAIN_DESKTOP_AUDIT_2026-10-08.md) records a fresh 40/40-step Recipe rebuild on the 625-site production project with final export and actual Kernel length checks. Check the exact revision and the distinct native-replay/Recipe acceptance scope when reproducibility is a requirement. Do not silently equate a single-site replay or full-wafer assembly with freshly verified full-wafer native replay.

## 8. TiO₂ achromatic metalens · four meta-atoms

![Schematic only: four illustrative TiO₂ meta-atom cross-sections; not an author GDS image](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/tio2-metalens-four-unit-schematic.svg)

_This is a deliberately labeled illustrative schematic, not a rendered 3D screenshot or the paper's actual GDS._

The editable example opens with **10 History nodes**, **6 saved fabrication checkpoints** and a **nine-operation Recipe**. Starting from the documented glass display substrate, it deposits **13 nm ITO**, **1,500 nm TiO₂**, **200 nm PMMA**, develops the meta-atom Mask openings, deposits **30 nm Cr**, applies **Lift-off**, etches TiO₂ through the complementary Cr mask, then strips Cr. The remaining cross-sections include a circle, square, annular ring, and ring-plus-central-disk. Use Main, Section and 3D to inspect the canonical geometry and the deliberately empty ring holes.

**Source boundary:** The paper provides the device aperture (30 µm), approximate 4,725 TiO₂ structures, 1.5 µm height, fabrication sequence and geometry families; it does **not** provide all optimized site coordinates/sizes. Opening the example loads the complete **4,725-site GRID array**, its matching Mask, nine Recipe steps, ten compiled History nodes and six checkpoints. The cover previews four representative units. Both XY layouts are illustrative. The earlier golden-angle GDS/CSV remains a separate layout; neither is an optical phase or efficiency reproduction. The [four-unit process project](https://xiaolong-6.github.io/WaferCAD/examples/tio2-metalens-four-unit-process.wafercad) can be rebuilt from a new Base. Full-array stages are compiled from processed local templates; interactive full-array Run all has **not** been certified. See [reconstruction provenance](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/TIO2_METALENS_RECONSTRUCTION_2026-10-09.md).

## How to explore or reproduce an example

1. Open the [WaferCAD Welcome page](https://xiaolong-6.github.io/WaferCAD/), then click the **example title or description**. Preview tabs are for inspection, not editing the complete project.
2. In the workspace, review **Base**, **Mask** sources/Cell/Layer, any Mask ROI, the **History** sequence, and all named **Variants** or Snapshots.
3. Use **Section** to examine real exposed/covered geometry and **3D** to understand morphology and layer overlap. Inspect each step's scientific assumptions.
4. To test reproducibility, start from the intended Base, confirm captured Masks, replay all intended steps with the **current Kernel**, and compare intermediate and final states. A saved History can be restorable without having been freshly replayed on every geometry scale.
5. **Export** the `.wafercad` file, re-import and verify states, and separately export the required Masks using GDS/OAS/SVG. Check ROI, Cells and Layers when exporting.
6. To author a new flow, use the [Recipe Code Tutorial](Recipe-Code-Tutorial) or [中文教程](Recipe-Code-Tutorial-zh-CN).

## What WaferCAD computes

WaferCAD evaluates **mask-conditioned 2.5D material geometry** from XY vector domains and Z stacks. It supports real buried interfaces, through-voids, conformal walls, idealized planarization, and geometric undercut/release. Main, Section and 3D consume shared geometry facts.

## What WaferCAD does not compute

WaferCAD does not predict ALD/sputter transport, etch rates, implantation dose/energy/depth profiles, activation, electrical fields, carrier motion, device I–V, photovoltaic conversion efficiency, optical responsivity or mechanical stability. Rough/Pyramid are **render-only** surface morphologies. Implant and Electrical Region are user-defined annotations; Anneal/Clean Record steps store metadata without chemically changing materials.

**Provenance matters:** distinguish source-reported dimensions and steps from inferred masks, reconstructed geometry, idealized transfer/CMP and display-only textures. Use WaferCAD for structural reasoning, process teaching and mask-aware geometry inspection, and validated physics tools or measurements for performance claims.
