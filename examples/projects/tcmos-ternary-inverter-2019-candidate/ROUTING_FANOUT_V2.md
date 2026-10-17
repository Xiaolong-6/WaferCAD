# T-CMOS 4×4 separate physical M4 output fanout (v2)

This is an **illustrative post-Recipe multimetal prototype**, separate from the approved paper SVG, source 23-step Recipe and real 16-cell Recipe/History reconstruction.

The prior v1 implementation provided only local M3 output stubs and three closely grouped M4 buses. The user correctly rejected it as incomplete inter-cell metal connectivity.

## Implemented result

- VDD/VIN/GND shared metal trunks are joined by M4 perimeter straps at y=15.2, 14.4 and -15.4 µm.
- Every one of the 16 independent cell VOUTs receives its own genuine M3→W VIA34→M4 drop→M4 horizontal lane→right-perimeter M4 landing at x=27 µm.
- The four output lanes in each row have 1.2 µm pitch, remain isolated from each other and from all three global buses, and stay inside the 56 × 32 µm illustrative field.
- 19 connected nets: shared VIN/VDD/GND and 16 individually terminated VOUTs.
- The 0.7 µm terminal squares are **illustrative CAD electrical landings**, not measured or qualified probing/bonding pads.

## Hard scientific contracts and evidence

- 64 original M1 polygons and 3,712 immutable source File Mask polygons.
- Real flattened 2.5D solid project: 17 material layers, 518 physical regions, 156 vertical vias (64 VIA12, 64 VIA23, 28 VIA34).
- 44 real M3 rectangles, 51 M4 rectangles, 14 File Mask groups and 4,027 polygons.
- All 312 Via faces covered by correct named metal; all six Via/upper-metal layers have both missing and extra geometry area below the original 1e-12 µm² threshold. The locally generated exact candidate reports 0 µm² on all twelve checks.
- Negatives inject an open VOUT fanout, an output bridge, an interrupted bus and incorrect Via ownership; topology validation must reject each.
- The emitted `.wafercad` passes the real `readProjectFile()` and model/schema validation, and real headed Chromium + Three.js 0.179.1 Main/Mask/Section/3D was captured and visually inspected. 3D reached renderState=ready and renderPhase=complete.

This is a global flattened post-Recipe *engineering* model, not a new verified Recipe or History branch. Paper-supplied masks/semiconductor physics do not validate this custom interconnect design. No quantitative I–V/VTC, BTBT, ohmic contact, device parasitics, foundry DRC, wafer routing or packaging claim. No Main merge or Welcome release without owner approval.
