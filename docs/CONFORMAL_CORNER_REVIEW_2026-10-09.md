# Conformal corner continuity review — 2026-10-09

## Revision and ownership

- Repository: `Xiaolong-6/WaferCAD`
- Source baseline: `main` at `21b231869275b5fa075756ea79118054a41abdd0`
- Working branch: `fix/conformal-corner-connectivity-20261009`
- Status: candidate branch only; **not merged to main**.

## Reported problem and finding

The Process panel and Wiki previously composed their Conformal Deposit / Extend after-images from independent rectangles. Both images left the upper corner touching the sidewall at a single 2D point (a line in 3D). The illustration therefore implied a mechanically/topologically disconnected film.

The diagrams are generated from `site/process-guide-svg.js`, not authored independently. Both after-images now use **one continuous filled cross-section path**, with the sidewall reaching the top of the newly extended material and the bottom film. The tracked SVGs were updated from the same source. Rectangular corners are deliberate schematic simplifications, not a calibrated ALD rounding model.

## Kernel audit

The canonical `site/model.js` Conformal coating path is shared by Deposit and Extend:

1. `conformalSourcePatchesBeforeCoating()` records physical exposed surfaces before adding material, excluding artificial mask edges as source walls.
2. `splitByArea(... addLayerToSurface ...)` coats horizontal faces by the physical thickness.
3. `conformalBoundaryBands()` constructs a lateral band whose width follows coating thickness, and `conformalWallTargets()` selects genuine material/void walls.
4. `conformalSidewallStack()` spans the adjacent lower surface to the newly grown top height. Extend reuses the original layer ID; `normalizeStack()` merges adjacent same-layer Z intervals.
5. `materialSolidsFromTopology()` unions the same material by physical Z slab. `ownedMaterialSurfacesFromTopology()` derives shared/exterior surfaces for 3D; `sectionSlicesFromTopology()` consumes the same canonical intervals.

This code supports **finite shared faces** at the ideal step corner. No Kernel mutation was needed for the reported **schematic** defect. This is a source review, not a claim that arbitrary complex geometry or exported meshes are watertight.

## New regression coverage

- `site/tests/process-guide.test.mjs`: both Conformal schematic profiles must be single connected filled paths, and the existing check keeps all Wiki assets synchronized with the panel.
- `site/tests/conformal-process.test.mjs`: both wafer faces, explicit top/wall/bottom same-material intervals and positive shared Z height, a single finite-width upper-corner 3D material slab, Section sidewall continuity, and no internal same-layer 3D wall at the upper join (while retaining the true outer wall).

## Validation and next gates

Implementation and source inspection were performed through the GitHub connector. No local checkout, Node execution or Chromium environment was available to this session; **do not report the added assertions as passed until they run**.

Required reproducible commands in a checkout:

```sh
npm ci
node --test site/tests/process-guide.test.mjs site/tests/conformal-process.test.mjs site/tests/process-topology.test.mjs
npm run docs:check
npm run check
```

For final scientific/visual acceptance also run `npm run test:ui:process` against a locally served app and visually inspect Section/3D Front and Back with Border on/off. Check exported GLB mesh edge incidence explicitly before claiming global watertightness. Do not replace accepted visual baselines without user approval.

## Merge decision

Keep the branch separate until automatic tests finish and any failing corner assertions are diagnosed. If a genuine Kernel seam is exposed, fix that specific topology contract with a failing reproduction first; avoid speculative geometry changes merely to match the illustration.
