# T-CMOS 130 nm ternary inverter — paper-derived reconstruction

Status: **candidate generator, not yet a shipped Welcome Example**.

- Source: J. W. Jeong et al., "Tunnelling-based ternary metal–oxide–semiconductor technology," _Nature Electronics_ **2**, 307–312 (2019), DOI: https://doi.org/10.1038/s41928-019-0272-8.
- Evidence: paper Fig. 1a–b, Methods (pp. 311–312); Supplementary Fig. 1 and physical model note.
- Implementation: scripts/build-tcmos-inverter-example.mjs
- Regression: site/tests/tcmos-inverter-reconstruction.test.mjs

## Intended reconstruction and provenance

Reconstruct a representative 130 nm T-CMOS inverter on silicon, with ACTIVE/STI, NWELL/PWELL, HVTP/HVTN, POLY, source/drain annotations, CNT and METAL1. Retain an exportable 11-layer File Mask, complete Recipe, History nodes, stage bookmarks and a final geometry model.

The key published mechanism is the **highly doped body-to-drain tunnel junction**, obtained using a modified HVT body-implant mask. The Methods specify BF2+ for the nMOS device and As+ for the pMOS device, plus RTA; calibrated depth, energy, dose, mask coordinates and full GDS are unavailable.

| Feature      | Source-supported information                  | Geometric reconstruction choice                                               |
| ------------ | --------------------------------------------- | ----------------------------------------------------------------------------- |
| Inverter     | Fig. 1a/b complementary CMOS topology         | Illustrative 14 x 8 µm local field with POLY VIN and METAL1 VDD/VOUT/GND      |
| Process      | Commercial 130 nm and 90 nm CMOS foundries    | Candidate chooses 130 nm and gate L=0.13 µm                                   |
| ACTIVE/STI   | Si(100) and shallow trench isolation          | 2 µm display handle, 230 nm trench, 280 nm oxide fill and ideal CMP           |
| HVTP/HVTN    | BF2+/As+ high-energy, high-dose body implants | 180 nm empirical Implant markers; **not actual buried dopant profiles**       |
| Gate         | SiO2 in 130 nm flow; patterned POLY           | 5 nm SiO2; 200 nm Poly                                                        |
| Source/drain | LDD/HDD, silicide and self-aligned processing | 80/180 nm Implant markers, 25 nm silicide geometry; spacers/RTA recorded only |
| Contacts     | CNT and METAL1 standard foundry layers        | Four W plugs, 450 nm ILD and 200 nm patterned Al geometry                     |

**Scientific limitation:** The current WaferCAD Implant annotates from the exposed surface into the material. Retrograde body doping requires a buried peak. HVT markings therefore communicate mask coverage and a target zone only; do not interpret their color gradient as dopant concentration, buried depth, BTBT current or a calibrated junction. The electrical curves in Figs. 1d/3 and SI equations S1–S4 are out of scope for the geometric Kernel.

## Geometry build order

1. Create the Si(100) Base. Etch Si in the inverse of ACTIVE, exposing a real trench.
2. Deposit the illustrative STI oxide fill and planarize to original Si top Z. Assert that Si survives in ACTIVE and oxide occupies STI.
3. Place NWELL/PWELL electrical annotations and HVT body Implant markers; record foundry well/activation as non-geometric steps.
4. Deposit the gate dielectric and define 130 nm POLY gates, joined by a VIN conductor.
5. Open simplified source/drain Si windows; annotate LDD/HDD; record spacer and RTA operations.
6. Pattern silicide surrogate, deposit ILD, etch CNT openings, fill with W, pattern METAL1.

Each patterned Recipe step captures its File Mask and layer/datatype; the STI step retains explicit inverse-mask semantics.

## Run and acceptance

- Generate and validate candidate: node scripts/build-tcmos-inverter-example.mjs
- Focused test: node --test site/tests/tcmos-inverter-reconstruction.test.mjs
- Generated file (uncommitted by default): test-results/tcmos/tcmos-ternary-inverter-130nm.wafercad
- Repository output (only after acceptance): node scripts/build-tcmos-inverter-example.mjs --write-repo

The generator includes per-step kernel/schema checks, Recipe preflight and a project storage round-trip. Separate release verification must include Run All from fresh Base, actual Section/Main/3D geometry, Mask GDS/OAS export, History replay and Save/Reload. Only afterward add the project to Welcome and generate its final-only preview and 3D thumbnail. A green Node generator alone is not a full literature-Example acceptance.

## Follow-up model boundary

Do not silently change existing Implant semantics. A buried-depth start/end annotation could be implemented in a separately tested model/schema/render/persistence contract after this candidate demonstrates correct baseline geometry.

## Handoff

Repository: Xiaolong-6/WaferCAD.
Branch: feat/tcmos-ternary-inverter-example-20261014.
Initial base: main at 223ba3374f773e8d45fa17b3abb37a2d76b73acd.
Current stage: generator + focused tests, pending runtime acceptance and production fixture generation. Do not infer a generated fixture, successful CI or deployed example from the presence of this document.
