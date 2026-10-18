# Offline ChatGPT visual diagnostics (source-backed)

This is an **isolated diagnostic renderer**, not a substitute for running WaferCAD's production browser UI or its Three.js shader pipeline. It reads `.wafercad` through the real `site/project-io.js` validator, obtains canonical surfaces and sections from WaferCAD, and only then rasterizes individual views without `localhost` or `file://` navigation. The command does not change the model, history, snapshots, or scientific tolerances.

## Batch capture

Requires Node 22+, Python with Pillow, CairoSVG, Shapely, VTK (for 3D), and Playwright plus a working Chromium executable (for isolated UI components). No dev server is needed. Execute inside a complete checkout or verified portable source package:

```bash
python3 scripts/offline-chat-acceptance.py \
  --project site/examples/photodetector-literature-examples.wafercad \
  --views main,mask,section,three,navigation \
  --z-min 174.2 --z-max 175.72 --scale auto \
  --output test-results/offline-photodetector

python3 scripts/offline-chat-acceptance.py \
  --project site/examples/m3d-selfpowered-full-replay.wafercad \
  --views three,navigation --roi 1,-5,8,5 --camera iso \
  --z-exaggeration 4 --selected-view three \
  --mobile view --width 390 --height 844 \
  --output test-results/offline-m3d-roi
```

`--roi xmin,ymin,xmax,ymax` constrains **3D only** in physical micrometres. It is sent to the original `buildRenderSurfacePlan(model, clip)` before any mesh conversion, rather than clipping triangles after creating a full wafer. An invalid, zero-area or clearly outside-boundary ROI fails before expensive surface construction; empty material intersection fails explicitly, too. A 100,000-surface guard avoids pathological VTK runs. The ROI never alters canonical model geometry. `--camera iso|top|side` and `--z-exaggeration` only affect VTK presentation, with camera and crop recorded in the JSON evidence. The renderer does not reproduce physical roughness relief or any native Three.js material, opacity, border, depth blending or GPU-specific LOD behavior.

`--z-min` and `--z-max` select a **Section** Z window in physical micrometres; the accepted pixel/µm scale is still recorded separately for X and Z. `--scale physical` means X:Z is 1:1 and is not a Z break. Without an intersecting material slice, the rasterizer fails instead of exporting an apparently valid empty image.

The standalone native v2 Shell exporter loads actual `app.html` CSS, icons, navigation registry and workstation JS into Chromium's memory document. It accepts `navigation`, `topbar` and `viewbar`, desktop or mobile viewport dimensions, `--mobile edit|view`, `--domain project|mask|process|history`, and `--selected-view main|mask|three`. The selected navigation or view button must have the proper `aria-pressed` state. The shipped product tokens are currently **light-only**: a requested dark theme fails instead of fabricating an unsupported appearance. The output contains no real business-content adapters, so it cannot prove full application interactions.

Example direct UI capture:

```bash
python3 scripts/offline-chat-ui.py \
  --component navigation --mobile view --selected-view mask \
  --domain mask --width 390 --height 844 \
  --output test-results/offline-ui-mask
```

## Evidence and tests

Each image is checked for dimensions and non-uniform pixel content; its SHA-256 and the `.wafercad` input hash are listed in `summary.evidence.json`. The source revision is `unavailable` if the checkout is an unversioned archive, or comes from a verified `offline-source-manifest.json` if one is available. Do not infer a branch SHA from a ZIP filename.

Focused local tests:

```bash
python3 scripts/offline-chat-acceptance.test.py
node --check scripts/offline-chat-native-export.mjs
python3 -m py_compile scripts/offline-chat-acceptance.py scripts/offline-chat-vtk.py scripts/offline-chat-ui.py
```

These tests cover complete Photodetector and PERC projects, M3D ROI geometry/VTK, polygon holes, rejected invalid or out-of-bound ROI, project read failures, and real mobile/desktop v2 Shell source/selected-state captures. They do **not** cover browser Recovery, actual WebGL rendering, array release regression, interactive Mask editing or the full Quality/release gates. Those remain necessary before final merge.
