# Examples and Modeling Limits

[Home](Home) · [Recipe Code Tutorial](Recipe-Code-Tutorial) · [Process Operations](Process-Operations)

## Welcome example catalog

The current **Welcome** catalog presents **nine editable device/application families** across literature and fabrication examples. Its source of truth is [`site/bundled-examples.js`](https://github.com/Xiaolong-6/WaferCAD/blob/main/site/bundled-examples.js); the cards link to full `.wafercad` projects, including their History, Variants, Mask state and inspection views. Click a project's **title or description** on Welcome to open it. The preview offers Main/Mask/3D/Section inspection of a curated state, not the complete process replay.

| Welcome project                                                                                                                                                | What you can inspect                                                                                                                                                                                   | Literature and provenance                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**Photodetectors with nanopatterns**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=photodetector-literature)                          | Black-Si Fig. 1a and Ge Fig. 15 in one family project; branched process histories and final/QA or A/B structures                                                                                       | Setälä _et al._, _ACS Photonics_ (2023), [DOI](https://doi.org/10.1021/acsphotonics.2c01984); Liu _et al._, _Light: Science & Applications_ (2025), [DOI](https://doi.org/10.1038/s41377-024-01670-4); [Ge thesis Fig. 15](https://urn.fi/URN:ISBN:978-952-64-2900-7) |
| [**PERC solar cells with point contacts**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=perc-point-contact-solar-cell)                 | Silicon texturing, junction/passivation annotations, local rear contact openings and metallization; source-order and patterned-contact alternatives                                                    | Blakers _et al._, _Applied Physics Letters_ (1989), [DOI](https://doi.org/10.1063/1.101596)                                                                                                                                                                           |
| [**Fully textured perovskite–silicon tandems**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=fully-textured-perovskite-silicon-tandem) | Double-sided pyramid texture, SHJ bottom cell, conformal perovskite top-cell layers, ALD SnO₂, IZO and surrogate Ag grid; nc-Si:H / ITO branches                                                       | Sahli _et al._, _Nature Materials_ (2018), [DOI](https://doi.org/10.1038/s41563-018-0115-4)                                                                                                                                                                           |
| [**Suspended silica microdisks**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=suspended-silica-microdisk)                             | Published Continuous Circular XeF₂ M08 (36 µm XY/Z assumed), M09 record-only and 9 History nodes; archived 72-band variant remains available in the repository; historical lightweight Welcome preview | Basiri-Esfahani _et al._, _Nature Communications_ (2019), [DOI](https://doi.org/10.1038/s41467-018-08038-4)                                                                                                                                                           |
| [**Self-powered heterogeneous M3D circuits**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=m3d-selfpowered-heterogeneous-ic)           | 27 stage bookmarks (S00–S26) and 36 History nodes: Si photovoltaic supply tier, WSe₂/MoS₂ logic, graphene sensing, vias and encapsulation                                                              | Ghosh _et al._, _Nature Electronics_ (2026), [DOI](https://doi.org/10.1038/s41928-026-01624-1)                                                                                                                                                                        |
| [**MoS₂ computer with four-level BEOL interconnect**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=magic-1000-mos2-beol)               | Representative M4–M1 Al wiring, four W via tiers, ILD/CMP, W gates, HfO₂, transferred MoS₂ and local D/E-mode FET pair                                                                                 | Fan _et al._, _Nature Electronics_ (2026), [DOI](https://doi.org/10.1038/s41928-026-01641-0). Mask coordinates and ILD overfill are inferred; ~0.5 µm CMP clearance follows Methods.                                                                                  |
| [**Three-tier silicon junctionless transistors**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=three-tier-silicon-jlfets)              | Three stacked transistor tiers, conformal HfO₂ gates, contacts, ILD, transfer and CMP assumptions; 625-site wafer project with 40 saved History Steps                                                  | Lam _et al._, _Nature_ (2026), [DOI](https://doi.org/10.1038/s41586-026-10496-6)                                                                                                                                                                                      |
| [**TiO₂ achromatic metalens · four meta-atoms**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=tio2-metalens-four-unit)                 | 4,725-site illustrative array with four meta-atom families, matching Mask and nine-step compiled History; cover previews four units                                                                    | Wang _et al._, _Nature Communications_ (2021), [DOI](https://doi.org/10.1038/s41467-021-25797-9). Unit sizes and site placement are illustrative; the article does not publish the optimized 4,725-site GDS.                                                          |
| [**Tunnelling-based T-CMOS inverter**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=tcmos-ternary-inverter-130nm)                      | Approved 1×1 source-vector Mask (218 CNT), full 23-step Recipe and T-CMOS/conventional History; 4×4 global routing is a separate engineering candidate                                                 | Jeong _et al._, _Nature Electronics_ (2019), [DOI](https://doi.org/10.1038/s41928-019-0272-8)                                                                                                                                                                         |

These nine entries are registered in the shipped Welcome catalog. Other research reconstructions or development fixtures in `examples/projects/` are not necessarily Welcome examples. When a new example is actually added to `BUNDLED_EXAMPLES`, update this catalog and keep the documented title and project ID synchronized. The repository's Welcome example tests validate the promoted project files.

## 1. Photodetectors with nanopatterns

![Actual WaferCAD 3D preview of the photodetector example, including reconstructed passivation and patterned regions](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/photodetector-literature-three.webp)

_A WaferCAD 3D preview, not experimental microscopy. Open this photodetector project to compare Black-Si/Ge History branches, Mask states, and Section cross-sections._

![Photodetector Section screenshot from the accepted Windows visual baseline](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/tests/visual-baselines/windows-chromium/photodetector-section.png)

_Section screenshot from a reproducible browser visual reference (2026-10-05); device geometry and visual results can evolve after later Kernel changes._

**Black-Si photodiode — Setälä 2023, Fig. 1a**

- Silicon Base, **double-sided 650 nm thermal SiO₂ geometry surrogate** with a dedicated Back oxide strip before rear P implantation, front SiO₂ patterning, schematic ICP-RIE Black-Si morphology, front B/rear P Implant markers, thermal/clean process records, conformal Al₂O₃ passivation and Al contacts. Oxidation and back oxide removal are reconstructed geometry assumptions, not a thermal reaction or measured backside sequence.
- A **FINAL** Variant protects the active ALD and selectively removes blanket Al; the **QA** Variant intentionally illustrates nonselective overetch and is **not** a fabrication recommendation.
- Morphology relief, inferred masks and some lateral dimensions are **illustrative reconstructions**. Implantation is a depth annotation; drive-in and forming-gas anneals are metadata records.

**Ge photodetector — Liu 2025; thesis Fig. 15**

- Ge Base, a temporary SiNₓ implantation mask, B/P contact Implant annotations, temporary Al₂O₃ etch mask, nanostructured Ge etch and cleaning records.
- **A**: front Al₂O₃ coverage; **B**: inactive-area SiO₂/Al₂O₃. Induced p-inversion and n-accumulation use **Electrical Region** annotations.
- Ge-hosted Electrical Region marks may be placed in the saved geometric sequence ahead of the physically causative passivation deposition to preserve their material host. Read the annotations as **anticipated** zones, not prematurely induced physical states.

For detailed assumptions, source differences, and the reconstruction acceptance scope see [Photodetector kernel rebuild notes](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/examples/PHOTODETECTOR_RECONSTRUCTION_V2_2026-10-08.md).

## 2. PERC solar cells with point contacts

![Actual WaferCAD PERC solar cell 3D preview with point-contact geometry](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/perc-point-contact-solar-cell-three.webp)

_A WaferCAD 3D preview of the PERC reconstruction. Inspect its patterned rear contacts and the source-order versus alternate GDS-based History branches._

The PERC family demonstrates front/back processing and locally patterned rear contacts. A symmetric 110 nm conformal SiO₂ passivation uses one atomic Both Deposit with distinct paired Front/Back material IDs; front and rear contact windows retain different GDS masks (`4|0` / `5|0`). Inspect the source-order fabrication Variant and the alternative GDS-patterned-contact Variant to understand which geometry comes from a mask and which parts are structural simplifications. Doping/diffusion regions are represented schematically: **photovoltaic conversion efficiency is not calculated**.

## 3. Fully textured perovskite–silicon tandems

![Actual WaferCAD 3D preview of the reconstructed textured perovskite-silicon tandem](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/fully-textured-perovskite-silicon-tandem-three.webp)

_A WaferCAD 3D preview of the textured tandem; the visible pyramids are appearance metadata and must not be interpreted as a simulated etch profile._

This project illustrates two-sided silicon pyramid texture and a multilayer tandem stack. The Front/Back 4.5 µm texturing is one Both Etch with independent seeds (2018/2019) and preserved per-face texture profile IDs; the asymmetric junction doped films remain separate. The saved Variants compare an nc-Si:H recombination-junction construction with an ITO control. The 3D and Section views are useful for inspecting conformal materials across the ideal texture and the surrogate front Ag fingers.

**Interpretation limit:** Pyramid morphology is renderer metadata; the geometry Kernel still processes the ideal 2.5D material interfaces. The project is not a resolved nanoscale ALD/perovskite growth prediction.

## 4. Suspended silica microdisks

![Actual WaferCAD 3D preview of suspended silica microdisk and support pedestal](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/suspended-silica-microdisk-three.webp)

_The saved static 3D thumbnail represents the current **Continuous circular
XeF₂ release** geometry; the interactive Welcome card intentionally keeps
the older lightweight 2.5D preview. These are different models, not
interchangeable acceptance screenshots._

Opening this example loads the complete Continuous-release project:
`suspended-silica-microdisks-continuous.wafercad`. Its M08 Step uses a
continuous circular undercut from the original inverted Mask; M09 is a
record-only Step. Inspect Main, Section and 3D for the true released void
and central pedestal. The older **eight-band** and **72-band adaptive**
reconstructions remain historical or separate experimental fixtures;
their original region/History counts and image evidence do **not** describe
the current published project.

**Scientific boundary:** Basiri-Esfahani et al. report a spoked disk with
148 µm outer radius, 82 µm inner radius and approximately 1.8 µm thermally
grown silica. The **36 µm lateral and vertical release reach** is an
illustrative WaferCAD assumption, not a measured XeF₂ front. The cited
Fig. 2a SEM depicts a similar disk, not an independently calibrated
same-device comparison. Continuous geometry is not predictive of release
kinetics, mechanical dynamics, optical modes or acoustic sensitivity.
The previous 72-band Chromium evidence does not certify the new Continuous
M08 project; original-paper overlay and full normal-origin acceptance
remain open as recorded in the
[scientific evidence register](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/evidence/SCIENCE_FIGURE_EVIDENCE_2026-10-16.md).

## 5. Self-powered heterogeneous M3D circuits

![Actual WaferCAD 3D preview of the reconstructed heterogeneous M3D device stack](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/m3d-selfpowered-heterogeneous-ic-three.webp)

_A WaferCAD 3D preview of the M3D stack. Inspect saved fabrication stages and inferred interconnect mask routes rather than assuming this is the authors' exact layout._

The kernel-reconstructed literature example includes the silicon photovoltaic power tier, WSe₂/MoS₂ logic, graphene sensor, vias, conformal Al₂O₃ encapsulation and selective sensing windows. The full editable project contains **36 History nodes** and **27 stage bookmarks (S00–S26)**.

**Modeling and persistence boundary:** The source paper does not supply original layout polygons for every route; reconstructed masks are inferred, and 2D-material film thicknesses are visualization surrogates. Exact material interfaces require **lossless** `.wafercad` persistence; quantizing to the compact 0.1 nm grid is unsafe and should automatically fall back to lossless storage. A fresh `Rebuild Base first → Run All` completed all 35 operations on the desktop-audited product revision, with actual Kernel length requests and final export checked. The [desktop audit](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/archive/PRE_MAIN_DESKTOP_AUDIT_2026-10-08.md) also records 36-node History, 27 bookmarks, Border/Opacity and lossless import/export checks. This is geometric replay evidence for that revision and environment, not fabrication validation.

## 6. MoS₂ computer with four-level BEOL interconnect

![Actual WaferCAD 3D preview of the paper-derived MAGIC-1000 representative local stack](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/magic-1000-mos2-beol-three.webp)

_3D preview from the shipped MAGIC-1000 representative-cell project; routing is inferred from published information. This is a WaferCAD rendering, not an author's device micrograph._

![Actual WaferCAD Section of the same MAGIC-1000 local stack, showing buried interconnect levels and upper FETs](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/magic-1000-mos2-beol-section.webp)

_Section inspection of the reconstructed 2.5D material stack. Compare its layer sequence with the paper's Fig. 1e, **not** unpublished mask coordinates. The grey horizontal Z-break is a display transformation, not a material void._

This local Figure 1-inspired reconstruction demonstrates a paper-derived 300 nm SiO₂ isolation and four prefabricated aluminium interconnect levels (M4–M1), each with patterned 10/20/250/20/10 nm Ti/TiN/Al/TiN/Ti films. Interlevel dielectric overfill, CMP, W vias, a planarized 400 nm W gate, conformal 10 nm HfO₂ and transferred monolayer MoS₂ are built with the live Process Kernel. Sb 20 nm/Au 40 nm contacts and local D-mode AlOx complete a two-transistor representative cell.

**Scientific limit:** No full-chip 1,433-transistor GDS or precise routing geometry was published. The local masks, ~0.5 µm CMP clearance from Methods, 2 µm illustrative handle thickness, 0.7 nm display MoS₂ and 10 nm AlOx surrogate are identified assumptions. Anneal, HfO₂ gate-access lithography and threshold-tuning information are documented as non-geometric Record steps. The Electrical Region annotation does not simulate doping or threshold voltage.

## 7. Three-tier silicon junctionless transistors

![Actual WaferCAD 3D preview of one representative three-tier junctionless transistor site](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/three-tier-silicon-jlfets-three.webp)

_A WaferCAD single-device 3D preview. Opening the associated project loads the 625-site array; the cover alone is not evidence of full-array processing._

The Welcome preview uses a **single-site source** for responsive inspection. Opening the project loads the **625-site full-wafer array**, containing three stacked silicon transistor tiers and **40 stored History Steps**. Deposition, conformal gate dielectrics, inter-tier transfer and CMP are represented with documented geometric assumptions.

**Important acceptance distinction:** A 625-site file with a saved 40-Step process history is not, by itself, proof that every operation was recomputed on the full wafer by `Run All`. The [desktop audit](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/archive/PRE_MAIN_DESKTOP_AUDIT_2026-10-08.md) records a fresh 40/40-step Recipe rebuild on the 625-site production project with final export and actual Kernel length checks. Check the exact revision and the distinct native-replay/Recipe acceptance scope when reproducibility is a requirement. Do not silently equate a single-site replay or full-wafer assembly with freshly verified full-wafer native replay.

## 8. TiO₂ achromatic metalens · four meta-atoms

![Actual WaferCAD Mask view of the illustrative 4,725-site TiO₂ metalens array showing its patterned mask geometry](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/screenshots/2026-10-24/metalens-array-mask.png)

_Real Chromium **Mask** view of WaferCAD's illustrative 4,725-site TiO₂ array, source main@90fb16836eec, 1440 × 960. It shows the reconstructed mask footprint, **not** an original paper GDS/OAS layout or optical phase simulation. The screenshot does not verify per-site material convergence._

![Actual WaferCAD Chromium 3D render of the illustrative 4,725-site TiO₂ metalens array](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/tio2-metalens-four-unit-three.webp)

_This is a real WaferCAD 3D renderer screenshot of the illustrative full array, not the paper's unpublished original GDS. The four-unit interactive preview remains lightweight._

The editable example opens with **10 History nodes**, **6 saved fabrication checkpoints** and a **nine-operation Recipe**. Starting from the documented glass display substrate, it deposits **13 nm ITO**, **1,500 nm TiO₂**, **200 nm PMMA**, develops the meta-atom Mask openings, deposits **30 nm Cr**, applies **Lift-off**, etches TiO₂ through the complementary Cr mask, then strips Cr. The remaining cross-sections include a circle, square, annular ring, and ring-plus-central-disk. Use Main, Section and 3D to inspect the canonical geometry and the deliberately empty ring holes.

**Source boundary:** The paper provides the device aperture (30 µm), approximate 4,725 TiO₂ structures, 1.5 µm height, fabrication sequence and geometry families; it does **not** provide all optimized site coordinates/sizes. Opening the example loads the complete **4,725-site GRID array**, its matching Mask, nine Recipe steps, ten compiled History nodes and six checkpoints. The cover shows the complete illustrative 4,725-site array; the interactive preview shows four representative units. Both XY layouts are illustrative. The earlier golden-angle GDS/CSV remains a separate layout; neither is an optical phase or efficiency reproduction. The [four-unit process project](https://xiaolong-6.github.io/WaferCAD/examples/tio2-metalens-four-unit-process.wafercad) can be rebuilt from a new Base. Full-array stored stages are compiled from processed local templates. Separately, a real Chromium **9/9 Run All from rebuilt Base** has now passed on the complete array, with exported Mask, Recipe, instance roles and XY/Z material occupancy checked within the documented 0.1 nm storage quantization. This is a geometry/process-replay result, **not** an optical design or fabrication validation. See [reconstruction provenance](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/examples/TIO2_METALENS_RECONSTRUCTION_2026-10-09.md).

## 9. Tunnelling-based T-CMOS inverter

![Actual WaferCAD Chromium 3D render of the reconstructed T-CMOS inverter](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/site/examples/thumbnails/tcmos-ternary-inverter-130nm-three.webp)

_Real WaferCAD 3D renderer screenshot of the reconstructed inverter; the source-vector Mask remains illustrative and is not a foundry GDS._

The promoted 1×1 project contains 8 original File Mask groups, 232 vector polygons (218 CNT), a reproducible **23-step Recipe** and independent T-CMOS/conventional CMOS History variants. Verify the actual model in Section/3D, select File Mask to inspect the source layout, and distinguish the paper's 130 nm process-node label from a measured gate length.

The native 4×4 Recipe replay and the **illustrative** post-Recipe M2–M4 fanout are separate developer projects. The latter passes geometric 19-net / 156-Via checks, but has no original post-Recipe routing History; Welcome does not misrepresent it as native replay. See [Develop WaferCAD with AI](Develop-WaferCAD-with-AI) and [PR #225](https://github.com/Xiaolong-6/WaferCAD/pull/225).

## How to explore or reproduce an example

1. Open the [WaferCAD Welcome page](https://xiaolong-6.github.io/WaferCAD/), then click the **example title or description**. Preview tabs are for inspection, not editing the complete project.
2. In the workspace, review **Base**, **Mask** sources/Cell/Layer, any Mask ROI, the **History** sequence, and all named **Variants** or Snapshots.
3. Use **Section** to examine real exposed/covered geometry and **3D** to understand morphology and layer overlap. Inspect each step's scientific assumptions.
4. To test reproducibility, start from the intended Base, confirm captured Masks, replay all intended steps with the **current Kernel**, and compare intermediate and final states. A saved History can be restorable without having been freshly replayed on every geometry scale.
5. **Export** the `.wafercad` file, re-import and verify states, and separately export the required Masks using GDS/OAS/SVG. Check ROI, Cells and Layers when exporting.
6. To author a new flow, use the [Recipe Code Tutorial](Recipe-Code-Tutorial) or [Using WaferCAD with AI](AI-Assisted-Workflows).

## What WaferCAD computes

WaferCAD evaluates **mask-conditioned 2.5D material geometry** from XY vector domains and Z stacks. It supports real buried interfaces, through-voids, conformal walls, idealized planarization, and geometric undercut/release. Main, Section and 3D consume shared geometry facts.

## What WaferCAD does not compute

WaferCAD does not predict ALD/sputter transport, etch rates, implantation dose/energy/depth profiles, activation, electrical fields, carrier motion, device I–V, photovoltaic conversion efficiency, optical responsivity or mechanical stability. Rough/Pyramid are **render-only** surface morphologies. Implant and Electrical Region are user-defined annotations; Anneal/Clean Record steps store metadata without chemically changing materials.

**Provenance matters:** distinguish source-reported dimensions and steps from inferred masks, reconstructed geometry, idealized transfer/CMP and display-only textures. Use WaferCAD for structural reasoning, process teaching and mask-aware geometry inspection, and validated physics tools or measurements for performance claims.

## Optional research geometry: not required for Welcome projects

The eight Welcome examples deliberately use **lightweight process geometry**
and display-only Roughness/pyramidal relief where appropriate. Rendering a
pyramid does not imply that the full 3D facets participated in Boolean Process
operations; that is an intentional performance trade-off, **not** a defect or
reason to rebuild the examples.

Optional research is collected under [`site/experimental/`](https://github.com/Xiaolong-6/WaferCAD/tree/main/site/experimental):

- **Physical Si/SiO₂ facets (#297):** a precise point-material oracle,
  expensive closed surface tessellation and a restricted Both-face SiO₂
  Conformal operation. Not a default project mode; unsupported process and
  normal editable imports must reject rather than produce false geometry.
- **Microdisk adaptive release (#298):** a separate saved 72-band Variant,
  preserving the published eight-band source project and its History.
  The 36 µm release radius is assumed, not author-measured.

Neither research path validates unpublished author masks, device-identical SEM,
full-wafer manufacturing fidelity, or optoelectronic predictive performance.
Default Examples, Roughness, and normal History/Recovery behavior do not require
migration to these research structures.
