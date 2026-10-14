# GaN HEMT with four-level direct microchannel cooling (Lian et al., 2022)

## Scope and literature source

- Paper: T. Lian et al., *Thermal property evaluation of a 2.5D integration method with device level microchannel direct cooling for a high-power GaN HEMT device*, *Microsystems & Nanoengineering* **8**, 119 (2022).
- DOI: https://doi.org/10.1038/s41378-022-00462-3
- Main figures: article Fig. 1 (chip and interposer design) and Fig. 2(a–i) (DRIE, wafer bonding, oxidation, metallization and assembly).
- Supplement: Fig. S-1 (HEMT gate/source/drain and backside grounds), Fig. S-5 (GSG pads and gold-wire bonding).

This is a geometry-first reconstruction of stepped coolant voids and a representative integrated HEMT. It is not original device GDS, a calibrated fabrication flow or an ANSYS thermal/CFD reproduction.

## Directly reported dimensions

| Quantity | Publication | Usage |
| --- | --- | --- |
| Starting interposer wafers | Two 400 µm double-side-polished Si wafers | Source fabrication recorded; structural surrogate below |
| Front/back DRIE | 200 µm each side | Lower cavity depth 200 µm |
| Interposer final thickness | ~800 µm | 400 µm Base + four 100 µm bridge tiers |
| Microchannel footprint bottom/top | 700 × 900 µm / 380 × 760 µm | Bottom opening; top channel envelope |
| Straight top channel width / spacing | 30 / 30 µm (paper main text) | Six illustrative 30 µm channels, 30 µm apart |
| HEMT chip dimensions | 1120 × 878.5 × 100 µm | XY chip footprint; SiC 99 µm + GaN 1 µm |
| HEMT active region | 303 × 393 µm | Mask dimension |
| Gate fingers | Ten, each 0.5 µm gate length and 300 µm gate width | Ten 0.5 × 300 µm mask rectangles |
| Interposer Ti/Cu | 200 nm / 500 nm; followed by Au | Source Record step only |
| Water and measured operating point | 3 mL/min; ~7.5 V, 0.8 A; 93.8 °C maximum | Metadata only, never predicted |

The abstract uses "pitch" for the 30 µm microchannel parameter while the main design text specifies width/spacing. We use separate 30 µm width and 30 µm spacing (60 µm centerline period) and disclose this interpretation.

## Geometrical assumptions and limits

1. Interposer XY 6000 × 5000 µm is a representative viewing field inferred from the published photographs and scale markers, not a separately reported precision dimension.
2. True direct bonding of two separately patterned 400 µm wafers is unavailable as one current Kernel operation. The construction begins with a 400 µm HR Si base, etches a 700 × 900 µm lower cavity 200 µm deep, then adds four 100 µm Si flat bridges with etched openings. This creates canonical Z voids and an 800 µm final interposer. It is a **single-model surrogate**, not the reported manufacturing sequence.
3. Intermediate transition masks 600 × 860 and 480 × 820 µm are inferred. The supplied article gives only the top 380 × 760 and bottom 700 × 900 µm dimensions numerically.
4. Six parallel top channels and their exact positions are inferred. Only 30 µm width/spacing and alignment with gate fingers are reported. Original GDS and the exact channel count are unavailable.
5. Four 70 × 70 µm square through-bores approximate TSV locations. Real TSVs have stepped diameters and Cu/NiPaAu metallization; plating remains source metadata, not an electrically validated conductive structure.
6. A 5 µm AuSn perimeter support film is illustrative and supports a 99 µm SiC bridge over the open channel. Solder geometry is not reported in the sources.
7. Gate/source/drain metals (0.2 µm each), GSG pads and pad routing are schematic. AlGaN/SiN thicknesses are unreported and their layers are omitted from the solid model.
8. Gold wire loops, polymer sealing, aluminum manifold, flow, heat transfer and device electrical performance are out of scope. **The coolant remains a true void, not a solid film**.

Every inferred element must remain labeled as an assumption; do not promote it to source-derived geometry.

## Build and validation commands

    node scripts/build-gan-hemt-microchannel-example.mjs
    node --test site/tests/gan-hemt-microchannel-reconstruction.test.mjs
    node scripts/build-gan-hemt-microchannel-example.mjs --write-repo

The default build writes the candidate project under test-results/gan-microchannel, together with a validation report. The --write-repo switch writes the generated project to site/examples but does not register an untested Welcome card.

The dedicated test checks real four-level cavity Z gaps, source-reported gate/chip masks, open TSV bores, Save/Reload, and GDSII/OASIS export. The generator also validates the live model after each process, the project schema, and Recipe preflight.

## Acceptance criteria (pending)

- [ ] CI builds the generated WaferCAD project without Kernel errors.
- [ ] Final geometry survives Save/Reload and a fresh Recipe Run All from Base.
- [ ] Channel and inlet/outlet connectivity is demonstrated; remaining simplified ports are identified.
- [ ] Main, Mask, 3D and Section visual checks establish topology and usable rendering performance.
- [ ] Source/inference assumptions and History bookmarks are visible in project metadata.
- [ ] A generated .wafercad file and actual WaferCAD 3D preview are committed before a Welcome catalog entry.
- [ ] Independent review confirms there is no suggestion that thermal/flow measurements were simulated.

A full two-wafer Bond / Attach Structure Kernel operation would be reusable for MEMS and 2.5D packaging but should not be added as an isolated one-off for this example. The branch stays Draft until the model and product acceptance criteria are met.
