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

Outputs: `main.svg`/`section.svg`, matching PNG (unless `--svg-only`) and `*.evidence.json`. The PNG rasterizer uses **Chromium on `about:blank`** with inline SVG; it never opens application URLs, and requires a locally available Playwright Chromium executable (override via `WAFERCAD_CHROMIUM`). Input `.wafercad` is parsed using the existing `readProjectFile` migration and validation. Geometry comes only from production `surfaceGroups` and `sectionSlices`, and `--fixture step` uses the production process benchmark. No custom scientific slice/topology algorithm is introduced.

The metadata records the exact input SHA-256, checkout commit, view, physical bounds, XY/Z pixel calibration and rendering limitations. `--scale auto` uses independent X/Z scaling, and `--scale physical` fixes a true 1:1 physical X:Z ratio. No Z break is applied. The exported SVG shows visible materials but is **not** a native renderer screenshot. This P0 does **not** reproduce rough surface tessellation, annotations, Mask, native WebGL transparency/borders or full UI interactions. Do not use it to close native renderer or real-browser visual acceptance requirements.

## Validation

Focused pure presentation checks: `node --test site/tests/offline-visual-svg.test.mjs`. Full integration should run `--fixture step` plus an actual bundled `.wafercad` against the exact branch checkout and inspect the PNG, exported evidence, and scientific geometry. A simulated fixture cannot prove the real file reader or production topology path. Keep CI and release gates separate; local images are developer inspection artifacts until reviewed and approved.