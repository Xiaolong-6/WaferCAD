# Process geometry benchmarks

These benchmarks verify the current geometric contract. They do not validate a deposition or etching process against experimental data.

## Coordinates and model scope

X, Y and Z are stored in µm. The model consists of non-overlapping XY regions with ordered physical material intervals in Z. It represents vertical steps and trenches, without arbitrary overhangs or a full solid surface solver.

Directional coverage adds the requested Z amount on the local exposed face inside the operation footprint. Extend requires the target material to be exposed on that face.

Conformal is evaluated in two stages. Stage 1 performs the same physical Z-thickness change as Directional coverage inside the selected Mask / Invert / Whole-face area. Stage 2 re-reads the newly exposed coating surface, finds its step boundaries, offsets those boundaries outward in XY by the same physical thickness, and fills the vertical interval back to the adjacent lower surface on Front (or higher surface on Back). The sidewall uses the same layer id as Stage 1, so normalization merges both pieces into one coating.

The lateral offset equals the physical Z thickness: Z = 1 µm produces a 1 µm XY normal offset. Section and 3D may exaggerate Z for visibility, but that display scaling is never fed back into process geometry.

Etch removes material vertically from the active face, crossing layer boundaries as necessary. It is not material-selective and has no lateral or conformal mode.

## Analytic fixtures

All fixtures use a 20 × 20 µm rectangular base, Z thickness 10 (`−5 … +5`), a feature height/depth of 2, a coating amount of 1, and a Section from `(−9, 0)` to `(9, 0)`.

| Fixture         | Initial feature                         | Directional coating at probe | Conformal coating at probe | Front probe |
| --------------- | --------------------------------------- | ----------------------- | -------------------------- | ----------- |
| Step            | Left half raised to Z = 7               | Z = 5 … 6               | Z = 5 … 8                  | `(0.1, 0)`  |
| Trench          | Central 4 µm strip etched to Z = 3      | Z = 3 … 4               | Z = 3 … 6                  | `(1.9, 0)`  |
| Isolated island | Central 4 × 4 µm island raised to Z = 7 | Z = 5 … 6               | Z = 5 … 8                  | `(2.1, 0)`  |

Back fixtures mirror these intervals about Z = 0. Tests also check the upper face, far field, both island side directions, and the rounded corner outside the buffer.

The Directional blanket volume is 400 µm² × Z thickness in each fixture. With Z = 1 µm, the lateral normal offset is also 1 µm. Expected Conformal volumes are:

- Step: 440.
- Trench: 480.
- Island: `400 + 2 × (16 + π)`, within 0.05 of the polygonal circular-buffer approximation.

A separate 100000 × 100000 µm regression verifies that the same Z = 1 µm still produces only a 1 µm XY offset on a wafer-scale model. This prevents the earlier failure mode where the renderer's Z exaggeration produced ~1000 µm-wide rings around ordinary mask openings.

A multi-opening wafer fixture also etches an array of circular openings through a blanket layer before applying Conformal. This protects the dense/repeated-mask path: boundary buffering must complete for many closed rings and must leave a sidewall coating around each opening. The fixture was added after repeated circular mask geometry exposed a polygon-clipping degeneracy in the former capsule-union buffer construction.

Tests etch 1.5 µm through a 2 × 2 µm area and verify a volume reduction of 6 µm³, including removal across material interfaces. Browser review projects additionally show a 6 × 8 µm etched area in the 3D and Section views.

## Permanent verification

`site/tests/process-benchmarks.test.mjs` checks both faces, material intervals, non-overlapping region partitions, stack ordering, coating volumes, etch volume, exposed-target Extend, ROI render-only behavior, and independent Section/3D interval agreement.

`site/model-view-geometry.js` derives Section slices and 3D extrusion groups from the canonical model. Exact Z values form group identities; the former eight-decimal grouping could combine distinct Z intervals. The renderer additionally sweeps exact Z slabs per material and unions the footprint at each interval. Horizontal faces come only from differences between adjacent footprints; border lines come from those faces and genuine side corners. This removes internal surfaces and prism edges even when adjacent columns have different Z intervals. Section unions rectangles by material, while Main unions patches by material and surface height, preserving actual steps and material interfaces.

`site/tests/material-boundaries.test.mjs` verifies partition-independent outlines, material identity throughout each cross-section, absence of internal 3D caps, coating volume, holes, separated islands, and render-only ROI clipping. The browser regression samples a continuous substrate row across former Section seams at each viewport/DPR.

`scripts/product-regression.mjs` opens the generated projects through the real project-file input, renders them with Chromium and Three.js, and saves Front/Back, Directional/Conformal, and Etch screenshots. The report includes reopenable `.wafercad` fixtures.

## Boundaries locked by tests

- A completely through-etched void has no adjacent region stack to extend. Current Conformal does not create freestanding sidewall material in that empty XY region. A regression explicitly preserves this limitation.
- Rounded XY corners are polygonal buffer approximations. Z corners remain piecewise vertical/horizontal, without a normal-offset surface solution.
- There is no simulation of transport, shadowing, sticking probability, aspect-ratio-dependent coverage, pinch-off, undercuts, or material-selective etch.
- XY display-unit changes convert inputs and labels only. They do not recalibrate Z, rescale geometry, or change process results.

Changes to these boundaries require an explicit geometry-contract update and new benchmarks.
