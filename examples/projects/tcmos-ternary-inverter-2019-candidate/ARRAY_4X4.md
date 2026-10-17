# T-CMOS 4×4 native Recipe and History acceptance (2026-10-17)

The sole source for the exported File Mask remains the user-approved
`layout-complete.svg`: 8 source layer groups, 232 polygons and 218 CNT
contacts **per cell**. The 4×4 patch translates the unchanged SVG into
**16 sites** at an illustrative **14 × 8 µm pitch** over **56 × 32 µm**,
for **3,712 exported mask polygons**, including **3,488 CNTs**. These
dimensions and placements are demonstrative CAD choices, not recovered
foundry reticle/die specifications.

## Three distinct, explicitly scoped outputs

- **1×1 source**:
  `tcmos-ternary-inverter-130nm.wafercad`. Approved original File Mask,
  23-step Recipe, and independently restorable T-CMOS and conventional
  CMOS History Variants.
- **4×4 structure-only inspection**:
  `test-results/tcmos/tcmos-inverter-4x4-ARRAY-PROTOTYPE.wafercad`.
  One physical template + 16 native instances; its single-cell Recipe
  and History are deliberately absent, never deceptively copied.
- **4×4 validated Recipe/History**:
  [`tcmos-inverter-4x4-replayed.wafercad`](tcmos-inverter-4x4-replayed.wafercad).
  This committed file comes directly from real Chromium **new Base →
  Run All 23/23 → Export**, contains **23 actual History nodes**, and
  was bytewise verified against the exported Git Blob
  `994fafc0b509eb593d12b565e72a5628735bf897`.
  A separate generator,
  `scripts/build-tcmos-array-recipe-experiment.mjs`, creates the
  pre-replay candidate for repeatable independent testing.

The original 218-shape CNT **Draw Mask** is reused in each native
instance's local process frame for the two CNT operations. Other private
process windows are precisely tiled. This prevents redundant large
Draw Masks and avoids re-quantizing source File Mask vertices.
The complete **3,712-polygon File Mask remains unchanged** by Recipe
capture, and both GDS and OAS binary round trips retain eight layer
groups and all polygons.

## Actual browser and scientific evidence

- [Scoped Chromium + 26 Node scientific contracts, run 39017758653](https://github.com/Xiaolong-6/WaferCAD/actions/runs/39017758653):
  Recipe 23/23, expanded 16-cell material comparison in **26 Z
  intervals**, 8 materials, maximum **0 µm²** XY mismatch; GDS/OAS
  binary parsing confirms **3,712 polygons**.
- [Final Chromium Save/Recovery, run 39018054248](https://github.com/Xiaolong-6/WaferCAD/actions/runs/39018054248):
  deliberately change project name, restore the saved checkpoint, then
  verify **all 16 native instances**, 26 material intervals, and
  qualitative dopant record semantics with **0 µm²** mismatch.
- [Screenshots, exported 4×4 project and JSON record](https://github.com/Xiaolong-6/WaferCAD/actions/runs/39018054248/artifacts/12096020375).
  The real Chromium screenshot after Run All and the after-Recovery
  screenshot show repeated physical stacks. Earlier separate Main/Mask,
  3D and Section visual captures are retained in
  [run 39008666718](https://github.com/Xiaolong-6/WaferCAD/actions/runs/39008666718/artifacts/12091638844).

All 16 source-cell regions, implants and **qualitative** dopant markers
are represented. Interlayer SiO₂ is visible by default so METAL1 and W
contacts do not appear suspended. A real-material/geometry result is
not evidence for a calibrated ion implantation profile or measured
electrical transfer curve.

## Scientific provenance and remaining gates

The source-approved SVG's VDD and GND polygons each form one continuous
metal shape joining source metal to the corresponding U-shaped body-tie
contact array. Earlier **legacy raster rectangles** had split each of those
rails into two islands, but that audit does not describe the approved SVG.
The 1×1 four-net Metal1 topology and all 218 CNT footprints are independently
checked. The model intentionally **does not** invent cross-cell routing,
pad frames, wafer die/reticle layout, or verified ohmic well contacts. No measured dopant concentration,
junction depth, BTBT current or ternary VTC is claimed.

The 4×4 structural/process/History/Recovery gate is accepted; an **8×8**
array or die/wafer patch remains a separately reviewed scaling scope.
PR #225 remains **Draft**, Welcome registration and Main merge are
**not authorized**. Final integration alignment and release Quality
checks must be completed before requesting merge approval.
