# Offline Visual Kernel (P0)

The read-only visual kernel is a developer tool. It **does not start WaferCAD**, navigate to `localhost`, require `file://` access in Chromium or change project / History state.

## Run from a complete WaferCAD checkout

```sh
npm ci
node scripts/offline-visual-kernel.mjs --project site/examples/photodetector-literature-examples.wafercad --view main --output test-results/offline-main
node scripts/offline-visual-kernel.mjs --project site/examples/photodetector-literature-examples.wafercad --view section --scale physical --output test-results/offline-section
# Minimal real process Kernel smoke without a project file:
node scripts/offline-visual-kernel.mjs --fixture step --view section --output test-results/offline-step
# SVG and provenance only, when Chromium is unavailable:
node scripts/offline-visual-kernel.mjs --fixture step --view main --svg-only
```

Outputs: `main.svg`/`section.svg`/`mask.svg`, matching PNG (unless `--svg-only`) and `*.evidence.json`. The PNG rasterizer uses **Chromium on `about:blank`** with inline SVG; it never opens application URLs, and requires a locally available Playwright Chromium executable (override via `WAFERCAD_CHROMIUM`). Input `.wafercad` is parsed using the existing `readProjectFile` migration and validation. Geometry comes only from production `surfaceGroups` and `sectionSlices`, and `--fixture step` uses the production process benchmark. No custom scientific slice/topology algorithm is introduced.

The metadata records the exact input SHA-256, checkout commit, view, physical bounds, XY/Z pixel calibration and rendering limitations. `--scale auto` uses independent X/Z scaling, and `--scale physical` fixes a true 1:1 physical X:Z ratio. No Z break is applied. The exported SVG shows visible materials but is **not** a native renderer screenshot. This P0 does **not** reproduce rough surface tessellation, annotations, Mask, native WebGL transparency/borders or full UI interactions. Do not use it to close native renderer or real-browser visual acceptance requirements.

## Validation

Focused pure presentation checks: `node --test site/tests/offline-visual-svg.test.mjs`. Full integration should run `--fixture step` plus an actual bundled `.wafercad` against the exact branch checkout and inspect the PNG, exported evidence, and scientific geometry. A simulated fixture cannot prove the real file reader or production topology path. Keep CI and release gates separate; local images are developer inspection artifacts until reviewed and approved.

## Isolated UI Shell capture

```sh
node scripts/offline-ui-capture.mjs --component navigation --width 390 --height 844 --mobile edit --output test-results/offline-ui
node scripts/offline-ui-capture.mjs --component topbar --width 1440 --height 960 --output test-results/offline-ui
```

The UI exporter reads the **actual CSS links from `site/app.html`**, executes the real v2 native icon/component/registry/overlay/Shell modules directly in an `about:blank` Chromium document, and captures a specific component rather than navigating to the app. It records a SHA-256 for each source file. Shell adapters intentionally contain no mocked project, geometry, or business content. Supported targets are `navigation`, `topbar`, and `viewbar`; hidden targets fail rather than returning fake results. This establishes real **shell/component CSS inspection only**. It cannot confirm live domain contents, application startup, runtime interactions, real WebGL render, or scientific geometry.

## Offscreen 3D geometry preview

```sh
# Requires the pinned Three.js package plus Python VTK (no browser/WebGL):
node scripts/offline-three-capture.mjs --fixture step --output test-results/offline-three --z-exaggeration 3
node scripts/offline-three-capture.mjs --project site/examples/photodetector-literature-examples.wafercad --output test-results/offline-three --z-exaggeration 8
# Canonical owned triangle mesh and JSON metadata without VTK:
node scripts/offline-three-capture.mjs --fixture step --mesh-only
```

Uses the production `buildRenderSurfacePlan()` owned caps and sidewalls and the production `triangulatePolygon(THREE, polygon)` for cap topology. Open sidewalls form two triangles per quad; buried material interfaces are explicitly excluded from the opaque exterior preview. This does **not** reconstruct rough/pyramid displacement or Three.js material/shader/transparent border compositing. The optional Python VTK rasterizer is a separate offline image backend and must never be labeled a native Three.js image. Z exaggeration is presentation-only and recorded alongside source SHA and material counts. Fail explicitly on invalid caps, impossible sidewall spans and excessive triangle budgets. It must not mutate the project.

Focused read-only triangle conversion tests: `node --test site/tests/offline-three-mesh.test.mjs`. VTK is **not** added to the locked production dependency set; only the optional offline 3D PNG path requires it. The scientific source and WebGL renderer remain unchanged.

## File / Draw Mask offline inspection

```sh
node scripts/offline-visual-kernel.mjs --project site/examples/perc-solar-cells-point-contacts.wafercad --view mask --output test-results/offline-mask-file
node scripts/offline-visual-kernel.mjs --project site/examples/perc-solar-cells-point-contacts.wafercad --view mask --mask-source draw --mask-opacity 0.75 --output test-results/offline-mask-draw
```

The renderer uses native `maskLocalToWorld()` for File coordinates,
`drawShapeGeometry()` for individual Draw rings/polygons and
`maskRoiWorldGeometry()` for the optional Mask ROI. It preserves their
separate coordinate spaces (only File coordinates use the saved alignment).
The outline reference comes from native `surfaceGroups()` for the selected
front/back face and is a dashed overlay, **never** fabricated as Mask geometry.
Selected `layer|datatype` File elements retain the shared native palette;
non-selected elements remain visible but subdued. Native polygon holes are
rendered using SVG `fill-rule=evenodd`. The output is a diagram for Mask
inspection, not the actual Canvas rasterizer, touch interaction or GDS export.

The offline File renderer currently uses the stored flattened
`layout.elements/linework` and saved `selectedLayerKeys`, **not an independently
recomputed cell-hierarchy filter**. Verify active Cell and imported hierarchical
semantics with the real Mask UI before treating the file capture as acceptance.
Empty Masks are explicitly reported as zero source elements rather than showing
fabricated patterns. Very large masks may exceed offline SVG performance.

Focused checks: `node --test site/tests/offline-mask-svg.test.mjs`.
A synthetic File/Draw sample rendered to two PNGs using an in-memory Chromium
SVG is a smoke test only, not an end-to-end `.wafercad` validation.

## Portable ChatGPT source package (no localhost, CI, or remote browser)

From a **full WaferCAD checkout** containing the target PR's exact HEAD,
build the portable source archive once:

```sh
python3 scripts/offline-package.py --output test-results/wafercad-offline-source.zip
python3 scripts/offline-package.py --verify test-results/wafercad-offline-source.zip
```

The ZIP contains actual `site/` code and `.wafercad` example assets, the
minimum offline `scripts/` entrypoints, the pinned `node_modules/three`,
`node_modules/playwright` and `node_modules/playwright-core` sources, plus a
cryptographic manifest recording each file SHA-256, original Git HEAD and
whether any uncommitted source was present at packaging time. It refuses
symlinks, missing required files and excessive size. It never modifies WaferCAD
or calls GitHub Actions. Before opening a supplied package, **verify** its
paths, count, size and per-file SHA-256 hashes with `--verify`; a self-contained
manifest proves internal consistency, not independent GitHub authenticity.

After downloading the archive into the ChatGPT execution environment, extract
it into an isolated folder, then run the existing offline commands there:

```sh
# In the extracted folder, with Node and an existing Chromium executable:
node scripts/offline-visual-kernel.mjs --project site/examples/perc-solar-cells-point-contacts.wafercad --view mask --output output/mask
node scripts/offline-visual-kernel.mjs --project site/examples/photodetector-literature-examples.wafercad --view section --scale physical --output output/section
node scripts/offline-three-capture.mjs --project site/examples/photodetector-literature-examples.wafercad --mesh-only --output output/three
node scripts/offline-ui-capture.mjs --component navigation --width 390 --height 844 --output output/ui
```

The first two commands can use an existing system Chromium via
`WAFERCAD_CHROMIUM` to rasterize SVG; `--svg-only` needs no browser. The 3D
PNG path additionally requires locally installed Python VTK; `--mesh-only`
does not. If the receiving environment lacks Chromium or WebGL, it **must not**
claim real browser acceptance. The source revision in evidence is taken from
the package's `offline-source-manifest.json` when present, otherwise from Git,
with `dirtyAtPackaging` explicitly retained. A mutable or locally edited bundle
must never be represented as an immutable published SHA.

Acceptance remains scoped: independently rendered scientific structures and
standalone native Shell controls do **not** establish production Three.js pixel
correctness, full UI interaction, layout synchronization or Recovery safety.
Those still require real-app Chromium and scientific/release gates before merge.

Focused local package tests, without CI:

```sh
python3 scripts/offline-package.test.py
node --test site/tests/offline-source-revision.test.mjs
```