# Examples and Modeling Limits

[Home](Home) · [Recipe Code Tutorial](Recipe-Code-Tutorial) · [Process Operations](Process-Operations)

## Welcome example catalog

The **Welcome** screen presents **five editable device/application families**, not five individual papers. The current source of truth is [`site/bundled-examples.js`](https://github.com/Xiaolong-6/WaferCAD/blob/main/site/bundled-examples.js); the cards link to full `.wafercad` projects, including their History, Variants, Mask state and inspection views. Click a project's **title or description** on Welcome to open it. The preview offers Main/Mask/3D/Section inspection of a curated state, not the complete process replay.

| Welcome project | What you can inspect | Literature and provenance |
| --- | --- | --- |
| [**Photodetectors with nanopatterns**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=photodetector-literature) | Black-Si Fig. 1a and Ge Fig. 15 in one family project; branched process histories and final/QA or A/B structures | Setälä *et al.*, *ACS Photonics* (2023), [DOI](https://doi.org/10.1021/acsphotonics.2c01984); Liu *et al.*, *Light: Science & Applications* (2025), [DOI](https://doi.org/10.1038/s41377-024-01670-4) |
| [**PERC solar cells with point contacts**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=perc-point-contact-solar-cell) | Silicon texturing, junction/passivation annotations, local rear contact openings and metallization; source-order and patterned-contact alternatives | Blakers *et al.*, *Applied Physics Letters* (1989), [DOI](https://doi.org/10.1063/1.101596) |
| [**Fully textured perovskite–silicon tandems**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=fully-textured-perovskite-silicon-tandem) | Double-sided pyramid texture, SHJ bottom cell, conformal perovskite top-cell layers, ALD SnO₂, IZO and surrogate Ag grid; nc-Si:H / ITO branches | Sahli *et al.*, *Nature Materials* (2018), [DOI](https://doi.org/10.1038/s41563-018-0115-4) |
| [**Suspended silica microdisks**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=suspended-silica-microdisk) | Geometrically released annular air gap, silica disk and surviving central Si support pedestal | Basiri-Esfahani *et al.*, *Nature Communications* (2019), [DOI](https://doi.org/10.1038/s41467-018-08038-4) |
| [**Three-tier silicon junctionless transistors**](https://xiaolong-6.github.io/WaferCAD/app.html?start=example&example=three-tier-silicon-jlfets) | Three stacked transistor tiers, conformal HfO₂ gates, contacts, ILD, transfer and CMP assumptions; 625-site wafer project with 40 saved History Steps | Lam *et al.*, *Nature* (2026), [DOI](https://doi.org/10.1038/s41586-026-10496-6) |

These five entries are **the catalog on `feat/process-recipe-v1`**. Other research reconstructions or development fixtures in `examples/projects/` are not necessarily Welcome examples. When a new example is actually added to `BUNDLED_EXAMPLES`, update this catalog and keep the documented title and project ID synchronized. The repository's Welcome example tests validate the promoted project files.

## 1. Photodetectors with nanopatterns

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

The PERC family demonstrates front/back processing and locally patterned rear contacts. Inspect the source-order fabrication Variant and the alternative GDS-patterned-contact Variant to understand which geometry comes from a mask and which parts are structural simplifications. Doping/diffusion regions are represented schematically: **photovoltaic conversion efficiency is not calculated**.

## 3. Fully textured perovskite–silicon tandems

This project illustrates two-sided silicon pyramid texture and a multilayer tandem stack. The saved Variants compare an nc-Si:H recombination-junction construction with an ITO control. The 3D and Section views are useful for inspecting conformal materials across the ideal texture and the surrogate front Ag fingers.

**Interpretation limit:** Pyramid morphology is renderer metadata; the geometry Kernel still processes the ideal 2.5D material interfaces. The project is not a resolved nanoscale ALD/perovskite growth prediction.

## 4. Suspended silica microdisks

Use Main, Section and 3D to inspect the actual canonical void and supported disk. This example is most useful for explaining isotropic/undercut release and the difference between an open cavity and a hidden or painted surface. It does not simulate release chemistry, device motion, optical modes or acoustic sensitivity.

## 5. Three-tier silicon junctionless transistors

The Welcome preview uses a **single-site source** for responsive inspection. Opening the project loads the **625-site full-wafer array**, containing three stacked silicon transistor tiers and **40 stored History Steps**. Deposition, conformal gate dielectrics, inter-tier transfer and CMP are represented with documented geometric assumptions.

**Important acceptance distinction:** A 625-site file with a saved 40-Step process history is not, by itself, proof that every operation was recomputed on the full wafer by `Run All`. Check the relevant full replay/acceptance report when reproducibility is a requirement. Do not silently equate a single-site replay or full-wafer assembly with freshly verified full-wafer native replay.

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
