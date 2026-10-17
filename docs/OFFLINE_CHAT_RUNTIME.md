# ChatGPT Offline Capture Fallback

This developer-only path captures scientific and Shell evidence from a complete
WaferCAD source snapshot when the current ChatGPT browser cannot navigate to
`localhost` or `file://`, and a Node `playwright` / `three` installation is
unavailable. It is **not** a native WaferCAD browser/Three.js visual acceptance.

## One-command invocation

Required: Node 22+, Python 3.11+ and `cairosvg`, `Pillow`, `playwright`.
The isolated Shell screenshot additionally requires a system Chromium binary
(`WAFERCAD_CHROMIUM` overrides detection). Offline 3D additionally requires
`vtk` and Shapely 2.1+ for constrained polygon triangulation.

```sh
python3 scripts/offline-chat-acceptance.py \
  --project site/examples/photodetector-literature-examples.wafercad \
  --views main,mask,section,three \
  --z-min 174.2 --z-max 175.72 \
  --z-exaggeration 8 --output test-results/chat-offline-photodetector

python3 scripts/offline-chat-acceptance.py \
  --project site/examples/perc-solar-cells-point-contacts.wafercad \
  --views main,main-back,mask,section,navigation \
  --width 390 --height 844 --output test-results/chat-offline-perc
```

This reads `.wafercad` through the production `readProjectFile()` import,
validates the model, derives physical Main/Mask/Section using the existing
`surfaceGroups()`, `sectionSlices()`, `drawShapeGeometry()` and
`maskLocalToWorld()` functions, then sends **read-only derived data** to
CairoSVG. For 3D it extracts the same `buildRenderSurfacePlan()` owned
caps/sidewalls, conservatively triangulates polygon holes with Shapely
constrained Delaunay, checks area coverage, and renders with VTK. It never
modifies the canonical model, stored project or History.

For the optional Shell capture, the Python Playwright adapter injects the
**actual production v2 JS modules and CSS** into Chromium `about:blank`, then
screenshots only an actual `navigation`, `topbar`, or `viewbar` component.
Scientific view adapters remain intentionally empty; do not infer that
workstation startup, real panel content or interactions have passed.

Outputs are per-view PNG, SVG (2D), `*.evidence.json`, native derived JSON and
`summary.evidence.json` with the input SHA-256, file hashes, dimensions, backend,
limitations, and optional source-bundle revision/dirty flag. A source ZIP alone
cannot cryptographically attest its Git revision unless its manifest/provenance
has been independently verified.

For Section, `--z-min` and `--z-max` select a physical Z window **without
changing geometry**. `--scale physical` preserves equal X/Z pixel scales;
`--scale auto` exaggerates Z to make nanometre films observable. No renderer
Z-break or roughness displacement is reconstructed. The Mask diagnostic uses
the stored flattened File elements / selected layer keys and does **not**
recompute active-cell hierarchy; this remains a live-UI acceptance requirement.
3D opaque previews omit buried surfaces and all native Three.js shaders,
transparent sorting, GPU roughness, annotation shading and Border rendering.

## Minimal local verification (not CI)

```sh
python3 scripts/offline-chat-acceptance.test.py
```

The focused tests load full bundled Photodetector and PERC projects, verify
real output images and unchanged source hashes, test malformed project
rejection, constrained tessellation of a polygon with a hole and real v2
Shell execution without URL navigation. Any screenshot from this backend must
be identified as an **offline diagnostic**, never as the real application
Chromium release visual gate.

The original Node SVG/Three/UI entrypoints in `OFFLINE_VISUAL_KERNEL.md` remain
available in environments with pinned dependencies. Include the Python fallback
files in the portable source package so ChatGPT can run without Node packages.