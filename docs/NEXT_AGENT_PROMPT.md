# Suggested prompt for the next coding agent

Continue the attached WaferCAD MVP. Read `README.md`, `HANDOFF.md`, and `docs/ARCHITECTURE.md` before changing code.

The product is a wafer-state CAD editor, not TCAD. The core interaction is GDS layer-aware pattern imprint → select face → push/pull → linked 3D/top/A–B section → snapshot.

First, do not add new process physics. Run the existing application locally and visually QA the current MVP using **Demo layers**. Fix only defects that block the documented workflow.

Then install/use `gdstk` and test one non-confidential GDS with at least two different `(layer, datatype)` pairs. Verify that layers remain separate in the UI and that each layer can be imprinted independently.

Do not collapse GDS into a raster mask or merge layers.

Before replacing the current 2.5D geometry approach with a CAD/CSG kernel, explain the proposed dependency, benefit, drawback, and architectural consequence to the human and wait for approval.

After QA, report concisely:

- what works;
- bugs fixed;
- GDS layer test result;
- remaining limitations;
- the single smallest next capability you recommend.
