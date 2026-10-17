# Offline Visual Kernel (P0)

## Evidence tiers: geometry diagnostics vs native visual acceptance

**Tier A — scientific geometry diagnostics.** The SVG and optional Python/VTK
backends inspect canonical topology, crop/Section coordinates, and provenance.
They are **not** pixel or layout or shader or interaction acceptance. Maintain
these diagnostic paths for existing evidence only; do not extend independent
renderers as substitutes for `plan-renderers.js` or Three.js.

**Tier B — actual-app visual evidence.** The existing
`npm run preview:visual` starts the production `app.html` Workstation and
captures native Main, Mask, 3D, Section and surrounding UI via real Chromium.
It accepts `WAFERCAD_CHROMIUM`, optionally enables software WebGL using
`WAFERCAD_VISUAL_SWIFTSHADER=1`, and automatically routes the application's
pinned Three.js 0.179.1 dependency to `node_modules/three`. Only this tier can
supply renderer/UI screenshots. It strictly rejects an unfinished or lost
3D WebGL frame, and labels captured evidence **unreviewed** until an AI or
human actually inspects it. See [CI visual-first guidance](CI.md).

Both tiers are read-only and do not establish scientific/History/Recovery or
final Quality acceptance. In managed Chromium environments where navigation
is policy-blocked, Tier B remains **unverified** rather than being replaced
by simulated images. Do not bypass administrator browser policy.

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
## ChatGPT no-Node-dependencies fallback and real-file validation

For environments with system Python Playwright/CairoSVG/VTK but no installed Node
Playwright or Three packages, use [ChatGPT offline capture](OFFLINE_CHAT_RUNTIME.md).
The read-only Python+Node fallback has been exercised against a complete
Main source archive with **full Photodetector and PERC .wafercad files**,
including native Mask data, physical Section Z windows, VTK diagnostics and
isolated real v2 Shell controls. This verifies the uploaded Main snapshot's
components, **not this feature branch's exact integrated release HEAD**.

## Real native app with offline SwiftShader (diagnostic)

This independent Playwright/Python entrypoint launches **the actual** `site/app.html`
and its production Three.js 3D renderer. It does not render mock HTML, generate
independent 3D geometry, modify Chromium administrator policy, or call CI.
The portable source ZIP includes the script, but **does not bundle a browser
binary or Python Playwright**. Provide an installed Chromium and Python Playwright.

```sh
python3 scripts/offline-native-app-capture.py \
  --root . --browser /usr/bin/chromium \
  --output test-results/offline-native-app \
  --project site/examples/previews/photodetector-literature.wafercad

# Demand a real HTTPS origin, for projects that need Worker/IndexedDB:
python3 scripts/offline-native-app-capture.py \
  --root . --output test-results/offline-native-origin --require-origin
```

This tool verifies the **exact Three.js version in app.html's import map**
against `node_modules/three` (currently 0.179.1). A catch-all Playwright
request route serves only local `site/` via
`https://wafercad.local/` and the pinned Three.js
`build/` / `examples/jsm/` files via the exact CDN URL. All other
requests are denied and recorded; the known optional missing
`build-info.json` is recorded separately. Path traversal and version
mismatch fail closed. No real network access is required.

On Linux the default is **headful Chromium** with an existing X display
or ephemeral **Xvfb**; ANGLE/SwiftShader software WebGL is enabled.
Use `WAFERCAD_CHROMIUM` or `--browser` to pick the exact executable.
`--headless` is optional but may be unable to initialize WebGL.
The tool captures `four-view.png`, a real pointer-drag
`three-orbit.png`, `three-maximized.png`, and
`native-app.evidence.json` containing Chromium path/version, WebGL
renderer and native context status, SHA-256 image hashes, request
allowlist/denials, and JS errors. It fails if the four native views,
3D WebGL, or necessary local resources fail. These images still require
**independent visual inspection**, and software GL does not replace
hardware acceptance.

**Origin limitation:** If administrator policy blocks the initial
`https://wafercad.local/` navigation, the tool **does not bypass or
change policy**. Unless `--require-origin` was supplied, it falls back
to injecting the unmodified application HTML and real scripts into an
`about:blank` document. Its origin is `null`, even though a `base`
element maps relative source URLs. This case is marked
`null-origin-native-diagnostic-only` and is **not** equivalent to normal
app-origin visual acceptance. Native 3D and orbit/maximize can still be
diagnosed. Project files are intentionally **not opened** there:
module Workers cannot be created from `null` origin. No fake Blob
Worker, storage/locks shim, or fake successful Recovery state is used.
Example loading, multi-tab coordination, IndexedDB/History/Recovery,
mobile touch and release gates all remain **unverified**.

With working HTTPS navigation the optional `--project` performs an
Open-file UI attempt and records a screenshot/Worker errors, but it
**never automatically marks example scientific or visual acceptance
complete**. Independent review and the original targeted science gates
are still required.

Focused checks: `python3 scripts/offline-native-app-capture.test.py`.
The real Chromium screenshot run is manual and intentionally not part of
the ordinary unit-test/CI loop.

### Source-backed in-memory native 3D: demo or validated project

Worker-restricted browsers can still render real, validated model topology
inside a **separate production Three.js viewport** without opening a project
in the Workstation. These options keep all four original app panels visible
in the initial screenshot, then capture a second isolated native viewport.

```sh
# Deterministic in-memory three-material model (production createModel):
python3 scripts/offline-native-app-capture.py \
  --root . --output test-results/offline-native-demo --inmemory-demo

# Real file validated with readProjectFile(), then native production 3D:
python3 scripts/offline-native-app-capture.py \
  --root . --output test-results/offline-native-photodetector \
  --inmemory-project site/examples/photodetector-literature-examples.wafercad
```

The project helper invokes the production `readProjectFile()` with the pinned
polygon-boolean vendor, including storage expansion, migrations, full strict
schema/geometry validation and the original file SHA-256. For safety, files
over 8 MiB are refused in this synchronous diagnostic path. It uses
`buildRenderSurfacePlan()` and `rememberRenderSurfacePlan()` to supply the
real native renderer with the same model identity, without attempting to
construct a cross-origin Worker. No independent reconstructed geometry or
fake Worker is involved. The `isolated-native-model.png` screenshot and
`isolatedNativeModel` evidence record layer/region and cap/sidewall counts,
the native canvas/Renderer ready state, and an explicit
`workstationStateLoaded: false` flag.

**This is 3D geometry/presentation inspection only, not a project Open
transaction.** Main, Mask and Section continue to show the existing
Workstation project; History, Autosave, Recovery and storage leases are
neither bypassed nor verified.

In production, both the active v2 Project panel and the legacy app Project reader
use `process-task-controller`'s explicit optional
`startupFallback` only when Worker construction throws. The project reader
opts in for files of at most 8 MiB, using the original strict
`readProjectFile()` validator, with Abort and busy-task semantics preserved.
Process Apply, Layout, export, running Worker errors and DataClone failures
keep their existing behavior. Even after a successful fallback parse,
`openProjectFile()` **still requires the normal pre-replacement Recovery
checkpoint**: a `null`-origin browser without storage must fail closed
rather than silently replacing the editor state.

Targeted checks:
`node --test site/tests/process-task-controller.test.mjs site/tests/offline-native-project-export.test.mjs`
and `python3 scripts/offline-native-app-capture.test.py`.
Neither diagnostic mode is final Workstation or release acceptance.
