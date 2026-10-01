# Product interaction and visual regression

## Review scope

The product regression covers Main, Mask, 3D, Section, all five tool tabs, KLayout transform/hierarchy GDS and compressed OASIS imports, snapshots, and process benchmark projects.

Primary viewports are 1440 × 900, 1000 × 800, and 390 × 844. The phone context also uses device pixel ratio 2 and real Chromium touch events. Breakpoint checks cover widths 600, 601, 900, and 901.

## Interaction contract

- A–B opens explicit coordinate controls. They stay open until manually collapsed.
- Drag A/B enters editing; Done exits it. Existing endpoints become labeled independent DOM handles, 32 CSS pixels for a mouse and 44 for a coarse pointer.
- Dragging off-center preserves the pointer offset. Pointer capture continues outside the canvas. Cancellation restores the pre-drag coordinates; Escape cancels the current drag, or exits edit mode if no drag is active.
- Arrow keys on a focused endpoint move it by one screen pixel; Shift moves ten. The active Front/Back coordinate transform applies to both keyboard and pointer input.
- Collapse ends endpoint editing. Opening a project or restoring a snapshot also locks the endpoints.
- ROI handles remain 10 CSS pixels at every zoom, with separate mouse/touch hit ranges. Resizing preserves the grab offset, and a circle can cross its fixed opposite corner.
- Reference changes preserve ROI geometry. Numeric A/B and ROI inputs retain full values when nm/µm/mm display units change.

## Layout and renderer changes

On desktop landscape widths above 900 px, the five workspace panels are arranged as **Mask / 3D / Function** on the first row and **Main / Section** on the second row. Their existing grid proportions are preserved: each first-row panel occupies one third, Main occupies one third of the second row, and Section occupies the remaining two thirds.

At widths up to 900 px, A–B coordinates dock below Main so they cannot cover the endpoints. The established three-row narrow layout remains unchanged: Tools/3D, Main/Mask, Section.

Narrow tool headers wrap deliberately; mobile base fields use full input rows, all five mobile tabs remain visible in two rows, and the legend header wraps its controls. The ROI popover has a bounded scroll area. Plan-axis tick spacing responds to the available screen width and actual label width.

Canvas ResizeObservers redraw after panel layout changes. This prevents stretched Mask/Section images when opening the mobile coordinate controls. 3D Fit uses the camera aspect ratio, field of view and bounding radius to keep the full model inside the panel.

## Reproduce the review

Install development dependencies, then the browser review dependencies:

```bash
npm ci
npm install --no-save --package-lock=false playwright@1.55.0 three@0.179.1
npx playwright install chromium
python3 -m http.server 4173 --directory site
```

In another terminal:

```bash
WAFERCAD_THREE_DIR="$PWD/node_modules/three" node scripts/product-regression.mjs
```

The local Three.js package serves the same pinned CDN module URLs during the test; it changes no application source or import map. This makes the test repeatable while exercising actual WebGL. The separate UI smoke retains a test for the CDN-unavailable fallback.

Open `test-results/product-review/index.html` to inspect screenshots and reopen a generated `.wafercad` fixture in WaferCAD. Assertions cover actual coordinate changes, touch dragging, cancellation, Back mirroring, unit conversions, snapshot restoration, ROI dimensions, header and ROI/opacity popover containment, minimum canvas sizes, backing-buffer dimensions, and absence of page errors.

CI uploads this review with the tested static application as an artifact. Screenshots require human inspection: passing DOM assertions alone does not establish visual quality. This suite is not a large-layout performance benchmark.

## Completed review, 2026-09-30

The final local run passed Quality (71 tests plus the self-test), the original UI smoke including CDN failure, and the product regression with 94 captures and no page errors. All capture groups were visually inspected, with full-size inspection of the A/B, mobile controls, ROI, and scientific comparison cases.

Visual findings fixed during the review were covered endpoints, clipped header controls, cramped mobile base inputs and tabs, clipped ROI/opacity popovers, canvas stretching after layout changes, overlapping/clipped axis labels, and an undersized 3D camera fit. Process checks additionally identified rounded Z grouping in the 3D renderer; exact interval grouping now preserves distinct surfaces. A reported Section screenshot also exposed artificial vertical lines inside continuous substrate and coating. Main and Section now draw unioned visible contours; 3D builds each material boundary without internal prism faces or edges. Actual substrate pixels are checked across former seams, with geometry tests preserving true interfaces, steps, holes and disconnected islands.

Representative final captures:

- [Wide A/B editing](review/ab-wide.png)
- [Phone A/B editing](review/ab-phone.png)
- [Phone nm-scale ROI editor](review/roi-phone.png)
- [Front Conformal trench](review/trench-front.png)
- [Back Conformal island, viewed from below](review/island-back.png)

The CI artifact contains the full gallery, 12 reopenable Direct/Conformal/Etch fixtures, and `preview/`. To run the tested preview after downloading the artifact, serve that directory with `python3 -m http.server 8000 --directory preview`, then open `http://localhost:8000`. The preview footer identifies the tested commit.
