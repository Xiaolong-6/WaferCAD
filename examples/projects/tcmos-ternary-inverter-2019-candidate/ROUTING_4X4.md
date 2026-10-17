# T-CMOS 4×4 — separate illustrative M2/M3/M4 routing variant

**Development status:** independent draft design; **not** part of the paper-approved mask, native Recipe, restored History or the committed unconnected 4×4 project. Neither full metal-process replay nor real Chromium / 3D material-stack acceptance has been completed.

## Source provenance and what is unchanged

The approved 'layout-complete.svg' is read directly by 'scripts/tcmos-svg-mask.mjs'. It contains **8 SVG File Mask groups / 232 polygons / 218 CNT sites per device**. The verified original 4×4 remains **3,712 exact source File Mask polygons / 3,488 CNT sites**, 16 instances on the illustrative 14 × 8 µm pitch. Its 23-step Recipe, recovered History, geometry and projects are not modified by this overlay. Nothing in the supplied paper claims that this route is a measured 130 nm foundry layout.

Generator: 'scripts/build-tcmos-array-interconnect.mjs'. Targeted tests: 'site/tests/tcmos-array-interconnect.test.mjs'. The overlay is a **separate engineering manifest and SVG visualization**, not an M2/M3/M4 material deposition in WaferCAD's 2.5D model.

## Circuit intent — 19 distinct electrical nets, not four

| Net | M1 landing (cell-local µm) | Interconnect | Export |
| --- | --- | --- | --- |
| VDD | (-6, 1.7) | Four vertical M3 column trunks, horizontal M4 y=7.4 | One shared M4 supply |
| GND | (6, 1.7) | Four vertical M3 column trunks, horizontal M4 y=9.0 | One shared M4 ground |
| VIN | (0, 2.85) | Four vertical M3 column trunks, horizontal M4 y=8.2 | One shared M4 input |
| VOUT/r/c | (1.5, 1.7) | Local M3 escape to x=3.3 relative to that site | **16 separate** accessible M3 output pads |

M1 polygon owners are **VIN, VOUT, VDD, GND** in the exact four-polygon order of the approved source SVG. Coordinates are verified against the complete polygon, never assigned by the obsolete raster METAL1 rectangles. Every M1 landing includes a 0.24 × 0.24 µm illustrative VIA12 square centered inside its source polygon. A second 0.24 × 0.24 µm VIA23 lands the same isolated M2 pad on its M3 trunk or output trace. Three horizontal M4 lines are joined to the three sets of four column trunks by twelve VIA34 squares; **no VIA34 is put at an M4 crossing with a different M3 net**.

VOUT is deliberately **not** connected in common: shorting the 16 inverter outputs would not be an electrically neutral layout decision. A future selector/multiplexer or per-column acquisition design would require a new explicit circuit definition.

## Planned geometrical design rules (not foundry rules)

- M2 landing pad: 0.64 µm square; M3 line/trunk and M4 strap width: 0.42 µm.
- Each VIA12, VIA23, VIA34: 0.24 µm square; nominal enclosing metal margin at least 0.08 µm on all sides.
- Distinct nets within the same metal plane must have at least 0.20 µm 2D clearance.
- M3 VOUT traces escape from 1.5 to 3.3 µm cell-local x, separated from VIN x=0 and GND x=6 vertical trunks.
- The three M4 y positions (7.4, 8.2, 9.0 µm) lie inside the 56 × 32 µm demonstration field and are physically on a **higher** metal plane than the orthogonal M3 trunk crossings.

All numbers above are **explicit design assumptions** and must be treated as uncalibrated until a technology stack/PDK is supplied. The actual dielectric, VIA metal, barrier, lithography enclosure, EM/IR drop, contact resistance and current densities are not established.

## First-pass independent topology gate

Run:

    node --test site/tests/tcmos-array-interconnect.test.mjs
    node scripts/build-tcmos-array-interconnect.mjs

The generator outputs 'test-results/tcmos/tcmos-4x4-routing-overlay.json' and '.svg'. This SVG is an overlay of actual source-SVG M1 polygons, new M2/M3/M4 rectangles and vias; it is **not** a screenshot from the WaferCAD Workstation.

Expected structural invariants:

- 64 original M1 polygon owners (4 × 16), 64 M2 pads, 44 M3 rectangles, three M4 bus rectangles.
- 64 VIA12 + 64 VIA23 + 12 VIA34 = 140 complete interlayer landing connections.
- Exactly **19 connected components** after lateral in-layer and specified vertical VIA edges: VDD, GND, VIN, plus 16 distinct VOUT/r/c nets.
- Every VIA12 square is wholly enclosed by exactly one approved M1 polygon; every VIA has exactly one correct metal owner above and below; no short/open circuit under the specified routing graph.
- Negative tests inject a cross-net M3 bridge, wrong via ownership, and broken vertical trunk; all must fail rather than weakening the scientific checks.

## Required next gates before acceptance

1. Implement physical M2/VIA12/M3/VIA23/M4/VIA34 materials on the real 4×4 model **without replacing** the source-approved File Mask or falsifying the existing 23-step Recipe/History. Prefer an explicit post-Recipe route stage and ensure true per-layer Z interfaces and dielectric ownership.
2. Re-run source Mask GDS/OAS exact round-trip on the untouched source and **separately export** the supplemental routed mask stack with unique documented layer numbers and datatype. Prove there is no source-net short, missed via or non-Manhattan sliver.
3. Run real local Chromium Main / Mask / 3D / Section snapshots for the routed variant, inspect M2–M4 alignment, section Via pillars and substrate contact, independently compare the unconnected original. Do not accept a standalone overlay SVG in place of these screenshots.
4. Perform focused save/reopen, History/Recovery, Recipe scientific invariants, strict material slabs and unit tests; only after actual visuals pass, run necessary Targeted CI then full final Quality / release checks.

**No Merge to Main or Welcome publication without explicit user approval.** This route is not a claim of measured electrical VTC, BTBT, ohmic body-tie, electrical parasitics or foundry DRC.
