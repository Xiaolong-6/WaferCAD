# Process geometry benchmarks

These benchmarks verify the current geometric contract. They do not validate a deposition or etching process against experimental data.

## Coordinates and model scope

XY is stored in µm. Z is relative. The model consists of non-overlapping XY regions with ordered material intervals in Z. It represents vertical steps and trenches, without arbitrary overhangs or a full solid surface solver.

Direct adds the requested Z amount on the local exposed face inside the operation footprint. Grow requires the target material to be exposed on that face.

Conformal first applies the same vertical change, then buffers each pre-operation source patch in XY. A sidewall band fills from the adjacent local surface to the source surface plus the requested amount on Front, or the source surface minus the amount on Back. Higher source patches take precedence. The band is clipped to the base boundary and may extend outside the selected mask footprint.

The XY buffer uses the **same numeric amount** as relative Z: an amount of 1 means 1 relative Z unit and a 1 µm lateral buffer. There is no physical XY/Z thickness calibration. The 3D renderer separately scales relative Z by `max(base width, base height) / 100`; neither Section nor canonical geometry applies this visual scale. Consequently, a displayed sidewall width cannot be interpreted as a measured normal film thickness.

Etch removes material vertically from the active face, crossing layer boundaries as necessary. It is not material-selective and has no lateral or conformal mode.

## Analytic fixtures

All fixtures use a 20 × 20 µm rectangular base, Z thickness 10 (`−5 … +5`), a feature height/depth of 2, a coating amount of 1, and a Section from `(−9, 0)` to `(9, 0)`.

| Fixture         | Initial feature                         | Direct coating at probe | Conformal coating at probe | Front probe |
| --------------- | --------------------------------------- | ----------------------- | -------------------------- | ----------- |
| Step            | Left half raised to Z = 7               | Z = 5 … 6               | Z = 5 … 8                  | `(0.5, 0)`  |
| Trench          | Central 4 µm strip etched to Z = 3      | Z = 3 … 4               | Z = 3 … 6                  | `(1.5, 0)`  |
| Isolated island | Central 4 × 4 µm island raised to Z = 7 | Z = 5 … 6               | Z = 5 … 8                  | `(2.5, 0)`  |

Back fixtures mirror these intervals about Z = 0. Tests also check the upper face, far field, both island side directions, and the rounded corner outside the buffer.

The Direct blanket volume is 400 µm² × relative Z in each fixture. Expected Conformal volumes are:

- Step: 440, from a 1 × 20 µm sidewall strip with 2 extra Z units.
- Trench: 480, from two such strips.
- Island: `400 + 2 × (16 + π)`, within 0.05 of the polygonal circular-buffer approximation.

Tests etch 1.5 units through a 2 × 2 µm area and verify a volume reduction of 6, including removal across material interfaces. Browser review projects additionally show a 6 × 8 µm etched area in the 3D and Section views.

## Permanent verification

`site/tests/process-benchmarks.test.mjs` checks both faces, material intervals, non-overlapping region partitions, stack ordering, coating volumes, etch volume, exposed-target Grow, ROI render-only behavior, and independent Section/3D interval agreement.

`site/model-view-geometry.js` derives Section slices and 3D extrusion groups from the canonical model. Exact Z values form group identities; the former eight-decimal grouping could combine distinct Z intervals. Adjacent polygons with the same material and Z interval are unioned before extrusion to avoid artificial internal seams.

`scripts/product-regression.mjs` opens the generated projects through the real project-file input, renders them with Chromium and Three.js, and saves Front/Back, Direct/Conformal, and Etch screenshots. The report includes reopenable `.wafercad` fixtures.

## Boundaries locked by tests

- A completely through-etched void has no adjacent region stack to extend. Current Conformal does not create freestanding sidewall material in that empty XY region. A regression explicitly preserves this limitation.
- Rounded XY corners are polygonal buffer approximations. Z corners remain piecewise vertical/horizontal, without a normal-offset surface solution.
- There is no simulation of transport, shadowing, sticking probability, aspect-ratio-dependent coverage, pinch-off, undercuts, or material-selective etch.
- XY display-unit changes convert inputs and labels only. They do not recalibrate Z, rescale geometry, or change process results.

Changes to these boundaries require an explicit geometry-contract update and new benchmarks.
