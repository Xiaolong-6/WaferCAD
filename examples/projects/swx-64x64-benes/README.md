# Hu et al. 64x64 Benes array — active reconstruction scope

**Primary PR #228 acceptance target:** 64 inputs × 64 outputs, 11 stages × 32 2×2 elementary
MEMS switches (**352**) with **1824** interstage waveguide crossings. Source:
Hu et al., *Nature Communications* 16, 331 (2025), Supplementary Section 12 / Fig. S16.

The first `hu-2025-benes-64x64-topology.wafercad` is a **real importable WaferCAD Mask
inspection project**, not an SEM-equivalent fabricated array. It contains 352 stage-cell
silhouette placeholders, 640 straight endpoint-to-endpoint routing paths, and 1824 counted
crossing **markers**. Its 5 µm base Si handle is a display proxy; the full 352-device Si,
BOX release and electrode process are **not yet constructed**.

- Layer 90: 352 **diagnostic** switch footprints, not actual MEMS geometry.
- Layer 91: 704 within-switch segments plus 640 straight stage-to-stage lines. Straight
  diagonals are **not** physically verified Euler bends and must not be manufactured.
- Layer 92: 1824 **position counters**, not four-fold symmetric fabricated MMI crossings.
- Stage pairing bits: 0,1,2,3,4,5,4,3,2,1,0. Each transition's inversion count is exactly
  16,48,112,240,496,496,240,112,48,16, yielding the paper's 1824 crossings.
- Supplement S16 source: 1.2 µm wide shuffle guides with 150 nm partial Si etch to avoid
  HF undercut; Euler S-bends; varying-width MMI arms, 5.74 µm long, with 13 published
  width values encoded in `scripts/swx-benes64-network.mjs`.
- Stage pitch 900 µm, lane pitch 76 µm, nominal inspection field 10,000 × 5,300 µm
  are **illustrative placement parameters** and not extracted author GDS coordinates.

**Gates before claiming actual full-array structural reconstruction:**
replace placeholders with validated actual 2×2 MEMS geometry by hierarchical repeated Cells;
route all stage links with source-constrained continuous ridge waveguides and Euler bends;
place and Boolean-check all 1824 actual MMI crossings using the 13 source widths;
implement material-specific 150 nm ridge vs 220 nm MEMS full-etch and locally selective BOX
release; load full Mask and physically reconstructed 3D/Section in Chromium; independently
check GDS/OAS and source micrographs; require manual visual approval.

The previously developed single-SWX compact candidate remains a **subcomponent** under
`examples/projects/swx-photonic-mems-candidate/`. Neither it nor this initial array Mask
may be presented as author GDS or merged to Main without explicit approval.
