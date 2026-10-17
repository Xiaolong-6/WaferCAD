# 4×4 T-CMOS array inspection prototype (2026-10-17)

The authoritative unit is the user-approved `layout-complete.svg` (8 File Mask
layers / 232 shapes / 218 contacts). This **illustrative geometry scaling**
stage tiles the unchanged original layout at a **14 × 8 µm illustrative
pitch** into **4 rows × 4 columns = 16 cells**; the 4×4 patch occupies
**56 × 32 µm**. Pitch and extent are design choices, not foundry die-map
metrology. The scientific reference is Jeong et al., Nature Electronics
(2019), DOI 10.1038/s41928-019-0272-8.

- One canonical vector-2.5d model template, 16 native translations and a
  translated 3,712-element File Mask. No wafer reticle, pads, scribe lanes,
  pad fanout, VDD/GND buses or cross-cell electrical functionality is invented.
- The original cell's STI/oxide/POLY/silicide/W/METAL1 layers, well markers,
  and material ownership remain in the instanced geometry. The ILD is
  **visible by default** to avoid a misleading floating interconnect.
- Original qualitative dopant XY intent is translated across all 16 cell
  centres; it remains non-calibrated and proves no junction/BTBT conduction.
- The generated `test-results/tcmos/tcmos-inverter-4x4-ARRAY-PROTOTYPE.wafercad`
  is **inspection-only**. Its original 1×1 Recipe and History are deliberately
  absent because they do not replay the 16-cell process. The approved 1×1
  project retains its complete 23-step Recipe, snapshots and two branches.
- Kernel, schema, storage and real Chromium Mask/3D/Section evidence must
  pass before promoting this experiment. 8×8 and a die-patch are future
  gated scopes; do not call this a real wafer map.

**Connectivity caveat:** The original SVG shows a gap between the external
VDD/GND leads and the inner body-tie U-shaped rail. This prototype preserves
the gap and keeps the 16 cells independent. Physical ohmic well contact and
electrical continuity are NOT validated.
