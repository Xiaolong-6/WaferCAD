# Photodetector border and 3D Z follow-up — 2026-10-05

The user's screenshot was from deployed `952d654`, with a restored local Photodetector workspace, a quarter-sector Main ROI and an A–B span of 5800 µm. Both requested fix branches were already ancestors of that deployment. The remaining defects were missed rendering cases, not missing merges.

## Corrected contracts

- 3D Implant inspection faces belong only to edges overlapping the actual ROI perimeter, including partial edges and ROI holes. A host-region partition or buried annotation perimeter must not become an opaque cut face. A fragment already contained within the ROI can still touch a real inspection boundary.
- Implant depth is measured from its original `sourceZ` over its original `thickness`, on both faces. Host-layer clipping and later Etch never restart the fade on an individual fragment. Section and 3D retain this reference, including rough caps and clipped sidewalls.
- Section Border unions displayed outlines per Implant across host-layer/depth fragments. True external outlines, steps and holes remain; bookkeeping edges disappear.
- 3D still follows Section's collapse limits, but retained top and bottom pieces meet at one display plane. Only Section retains the axis-break marker. A physical cavity outside the hidden interval retains its own width. Canonical model Z, saved process geometry and material GLB remain physical.
- Review screenshots wait for visible 3D to finish detailed rough-mesh refinement, rather than treating two animation frames as completion.

The earlier Section merge covered touching equal-depth bands. It did not cover outlines across different clipped depths or 3D ROI edge ownership. The earlier Z-collapse work deliberately left a small display gap; the user clarified that the gap itself was unwanted in 3D.

## Validation and reproduction

Environment: Windows, Node 24.16.0, Playwright 1.55.0 / Chromium 140.0.7339.16 (build 1187), local Three 0.179.1, real WebGL via SwiftShader. Serve `site/` on port 4173 and set `WAFERCAD_THREE_DIR` to `node_modules/three`.

- `npm run check`: lint, formatting and 316 Node tests pass, none skipped.
- `npm run test:ui:geometry`: Process geometry and interaction pass, including canonical GLB/morphology and view controls.
- `npm run test:ui:review`: bundled examples and responsive product review pass (109 layout captures and 17 renderer captures).
- `npm run test:ui:visual` with `WAFERCAD_VISUAL_BASELINE_DIR=tests/visual-baselines/windows-chromium`: all five previously approved references pass; no references were replaced.
- Renderer regression: 17 captures pass. Three additions cover partial-Etch Implant gradient/Border continuity, Photodetector quarter-ROI Overview, and its stable low-angle 3D view.
- The partial-Etch row probe requires all RGB channel ranges across the internal partition to be at most 2. Serving the old `952d654` Canvas renderer as a negative control produces `[5, 11, 2]`, so the assertion detects the old defect.
- An additional old-fixture probe loads `git show d216bb9:site/examples/photodetector-literature-examples.wafercad` with ROI `{type:'sector', c:[0,0], r:3400, startDeg:0, endDeg:90}` and A/B `[-2900,0]` / `[2900,0]`. Its stable 3D reports gap `0` and no page errors. This verifies display behavior on saved older geometry without rewriting its material.

Local ignored artifacts are under `test-results/product-review/renderer/` and `test-results/photodetector-debug/`. Their existence is supporting evidence; the committed renderer cases and geometry contracts are the reproducible handoff. Approved Windows visual references have not been replaced. Linux Chromium pixel stability remains unverified.

Separate remaining engineering findings are recorded on the project audit branch.
