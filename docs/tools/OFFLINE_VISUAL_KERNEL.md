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
human actually inspects it. See [CI visual-first guidance](../CI.md).

Both tiers are read-only and do not establish scientific/History/Recovery or
final Quality acceptance. In managed Chromium environments where navigation
is policy-blocked, normal-origin Tier B remains **unverified**. **Before
declaring native 3D diagnosis blocked, reuse the existing
`scripts/offline-native-app-capture.py`** (commands below), which can fall
back to `about:blank` with the real application/Three.js source. That is
partial native Renderer evidence, not full app-origin acceptance. Do not
modify or bypass administrator browser policy, or substitute simulated images.

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

### Verified Project Sources + GitHub source-only Artifact workflow

For restricted containers, **use this established chain before trial-and-error**:
fetch an existing exact-commit `wafercad-source-<SHA>` GitHub Actions Artifact
(or trigger the narrow `offline-source-bundle.yml` workflow if none exists),
download it via GitHub Connector to the local execution container, then extract
and check the `wafercad-source-manifest.json` revision/SHA-256 values.
The Artifact contains all tracked source/test files but deliberately excludes
`vendor/npm/three-0.179.1.tgz`, all `node_modules` and Chromium.

Use the already uploaded Three.js 0.179.1 archive from WaferCAD Project
Sources (materialize the attachment if needed) or an existing `/mnt/data`
copy, then `python3 scripts/restore-pinned-three.py --archive <path>`.
The script verifies the archive against `package-lock.json`; if no
`--archive` or `WAFERCAD_THREE_ARCHIVE` is specified, it uses the
tracked `vendor/npm/three-0.179.1.tgz` backup. Do not ask the user to
reupload the same package without checking Sources and cached files.

Run the existing `offline-native-app-capture.py` with real Chromium,
headed Xvfb and SwiftShader. Its null-origin fallback proves only native
Renderer diagnostics and cannot validate Worker Open/History/Recovery.
See [the complete offline bootstrap procedure](../DEVELOPMENT.md#offline-source-transport-and-threejs-priority).
The separate `scripts/offline-package.py` can still assemble a richer
locally bundled renderer environment when actually needed.

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
If the execution host rejects Unix-domain sockets, headed Xvfb and the
full Chromium executable may fail before navigation. The existing runner
also accepts Playwright's installed `chromium_headless_shell` executable
with `--headless`; try that normal launch before declaring rendering
blocked. In the 2026-10-20 Work environment, Playwright 1.55.1's Chromium
140 headless shell rendered the native app and validated Photodetector at
the normal HTTPS origin with SwiftShader and no page errors. This is an
environment-specific result, not a guarantee for every managed host.
Check the evidence's actual origin and WebGL state; neither mode changes
administrator policy or establishes hardware/History/Recovery acceptance.
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

For native UI shell diagnosis, add `--inspect-history` to the existing capture command.
It records `history-step0.png`, `step0-base-editor.png`, and `process-undo.png`,
and asserts that Step 0 opens the real Base editor and Process exposes model-level
Undo/Redo controls. In null-origin mode these screenshots prove **only** native
presentation and navigation; Step replay, Workers, autosave, and Recovery remain
unverified.

Focused checks: `python3 scripts/offline-native-app-capture.test.py`.
The real Chromium screenshot run is manual and intentionally not part of
the ordinary unit-test/CI loop.

### Repeatable Section-sampler versus completed native 3D mesh cutline

The existing source-backed native capture runner can audit the **actual
completed CPU rough mesh**, including the live material-layer ownership,
Renderer Z break and its display-only Z scale. For the Photodetector, keep
the physical 65-point line fixed and change only ROI and Fast/Quality:

```sh
python3 scripts/offline-native-app-capture.py --root . \
  --inmemory-project site/examples/photodetector-literature-examples.wafercad \
  --inmemory-roi 2465,-30,2525,30 --inmemory-z-break 14,2 \
  --rough-cutline 2494.7,2495.3,0.123 \
  --output test-results/rough-cutline-60-fast
# Add --quality for the same 60 µm ROI, and repeat using
# --inmemory-roi 2375,-120,2615,120 (240 µm) and
# --inmemory-roi=-3400,-3400,3400,3400 (6,800 µm).
```

For very large ROI / Quality meshes, the cutline runner creates a
temporary narrow probe geometry from the **actual completed material cap
triangles**. It keeps original Float32 vertices, face orientation and
`matrixWorld`, then intersects only triangles capable of meeting the line.
It never changes production mesh `drawRange`, canonical physical geometry
or the saved model. The report's `clippedTriangleCount` distinguishes
this diagnostic workload from the full `roughTriangleCount`. In particular,
do not call `Box3.setFromObject()` on a detached probe: it can recompute
`matrixWorld` without the parent group Z scaling, manufacturing a false
physical height error. Bound using the original live mesh instead. Unclipped
and clipped native Chromium raycasts must agree at the same cutline; the
6,800 µm Quality Photodetector scenario was the motivating regression.

The runner records `physicalRoughCutline`: the actual material owner,
all 65 ray intersections, missed points, per-point residual, RMS and maximum
error, together with the native screenshots, mode and triangle counts.
Section's reference height is sampled at 1,100 pixels / physical ROI width.
The reference is transformed with the **same** native 3D display map
before comparing to the ray intersection; otherwise a Z-break comparison
would report a false physical height error. A buried Base must not be treated
as the visible cap when an oxide lies above it. Shader-displaced and instanced
rough meshes are explicitly excluded from the CPU triangle-raycast metric.

The current report also separates two _signed_, physically equivalent
height residuals at each sample:

- `meshInterpolationErrorUm`: native CPU triangle raycast minus the 3D
  LOD-filtered analytic height (mesh/tessellation residual).
- `displayAttenuationErrorUm`: 3D LOD-filtered height minus the Section
  pixel-footprint physical height (display-filtering difference).

Their signed sum **must** equal `errorUm` at every sample (1e-9 µm
numerical tolerance), and the report checks that the project model is
unchanged. The corresponding RMS components are **not generally additive**.
The diagnostic also reports `displayHeightBlend` for each matched cap;
a blend below 1 intentionally reduces visible 3D rough displacement
without altering stored physics or the Section sampling formula.

On the Photodetector at 60 µm the native Quality mode exposes more height
frequency than its finite CPU mesh can resolve. At 240/6,800 µm both
Fast and Quality reach the minimum 0.12 display blend; increasing triangle
budget alone need not improve the physical Section/3D comparison. Do not
claim numerical convergence solely because a mesh budget increases.

This is a _null-Origin native Renderer diagnostic_. Its Section reference is
the production sampler, not a captured synchronized Section raster.
It does not prove complete Workstation, Worker-backed project Open,
History/Recovery, or untested GPU-shader vertex heights. Do not silently
label a partial or missed cutline as a pass; do not change scientific
tolerances or default morphology based on this diagnostic alone.

Add `--check-rough-parity` together with the full Photodetector
`--inmemory-project` to execute the production vertex-height qualification
at the actual rough-region coordinates, plus origin and uniform-height
controls. The evidence records maximum/RMS physical height error, initial
probe time, cache reuse, render-target restoration and resource disposal.
It deliberately measures the shader even on SwiftShader, where production
already selects CPU; software results cannot establish hardware acceptance.
This diagnostic does not change the physical heightfield or accept the
remaining triangle-interior interpolation error.

To audit the **spatial** distinction between saved legacy `stochastic` and
explicit `stochastic-v2` independently of display LOD, run:

```sh
node scripts/rough-morphology-statistics.mjs \
  site/examples/photodetector-literature-examples.wafercad
node --test site/tests/rough-morphology-statistics.test.mjs
```

The read-only diagnostic reports the source project SHA-256, seed, sampled
height mean/standard deviation/bounds, and X/Y autocorrelation versus
physical lag (default: 256×256 points, 0.025 µm pitch near the Photodetector
rough region). The statistics quantify morphology semantics and legacy
coordinate-dependent frequency; they are **not** a fitted Feature CV, a
section raster, a shader-height parity test, or native 3D visual acceptance.
Do not switch the saved morphology or weaken scientific tolerances based on
these statistics alone.

The parity diagnostic also probes stable-scale morphology at ±50,000 µm,
intermediate positions, a second Seed and normal polarity. Its printed
`precisionAnchor` is an internal shader-only coordinate frame; the test must
retain the original model/Seed and validate cache/resource restoration. A
smaller numeric discrepancy than before does not constitute a passing result:
only `eligible: true` at the existing 2e-5 µm maximum-error gate can qualify
the specific sampled task, and the native null-origin result cannot establish
full Workstation or hardware-GPU acceptance.

The probe also compares explicit `stochastic-v2` with the legacy stochastic
field at the same coordinates; it never upgrades the supplied project.
For reproducible normal-Origin stable-scale Process/Worker, 50 nm Conformal,
Undo/Redo, file export/Open and local Save/reload checks, run:

```sh
python3 scripts/offline-native-app-capture.py --root . --require-origin \
  --project tests/fixtures/project-io/stable-rough-base.wafercad \
  --check-stable-rough-ui --output test-results/stable-rough-ui
```

The output includes a real exported `stable-rough-roundtrip.wafercad`. Pass
that file with `--inmemory-project` and `--check-glb` to check production GLB
physical vertex heights and matched 50 nm film samples, independently of
display Z scaling. This focused check expects explicit stable-scale front
profiles; it does not replace the general GLB, History or Recovery suites.
Reuse the installed Chromium path/headless options as appropriate above.

For a **strictly validated, authored science fixture** that does not require
Worker-backed Open, the repository also provides
`tests/fixtures/project-io/stable-rough-conformal-glb.wafercad`. It contains
explicit `stochastic-v2` matching Base and 50 nm film profiles and can be
checked using the existing source-backed native renderer:

```sh
python3 scripts/offline-native-app-capture.py --root . \
  --inmemory-project tests/fixtures/project-io/stable-rough-conformal-glb.wafercad \
  --check-glb --output test-results/stable-conformal-glb
node --test site/tests/section-three-rough-profile.test.mjs
```

This fixture is deliberately authored from a simple base (not produced by a
Process Worker). It validates physical GLB vertices and matched conformal
heights, **not** an executed process transaction, History/Recovery, sidewall
process formation or real synchronized four-view acceptance. Do not call the
unmodified `stable-rough-base.wafercad` a GLB Rough test: its Base is flat.

The GPU qualification samples the inside and boundaries of up to 16 physical
Rough spatial zones (no more than 144 unique Float32 XY probes). Every zone
must be represented; a scene with more zones, or translated array instances
whose physical coordinates were not actually probed, is ineligible for GPU
height displacement and uses the CPU fallback. Passing these finite probes
still does not prove unsampled interior parity or hardware GPU correctness.

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

### Submicron roughness in native Three.js diagnostics

The native `createThreeView().init()` already schedules a full scene build.
The standalone in-memory inspector must not immediately call `render()`
again: doing so supersedes the ongoing build before adaptive rough meshes
are generated. An initial WebGL frame or `renderState=ready` alone is
**insufficient** evidence for a rough-surface Example.

Use explicit physical-coordinate XY ROI and a view-only Z break for the
Photodetector's ~0.3 µm rough feature size within its 7,000 µm device span:

```sh
python3 scripts/offline-native-app-capture.py \
  --root . --output test-results/offline-photodetector-rough \
  --inmemory-project site/examples/photodetector-literature-examples.wafercad \
  --inmemory-roi=-8,-8,8,8 --inmemory-z-break=173.9,-175.8
```

The two optional flags are **diagnostic presentation controls**; they do
not change the project model or scientific geometry. They require
`--inmemory-project`. The ROI coordinates are in µm with positive X/Y
extent; the Z break is `top,bottom` in µm. These particular coordinates
belong to the Photodetector Example and must not be used as generic
defaults for other devices.

Before writing a native rough-surface screenshot, the capture script now
waits for `roughMeshMode=detailed` when the physical surface plan contains
rough caps. It records the rough-mesh backend, triangle count and completion
status, and returns failure rather than accepting a smooth first frame if
refinement fails or times out. On managed null-origin Chromium, this is
native Three.js geometry/presentation diagnosis only; full Workstation
Open, Recovery and hardware GPU acceptance remain separate.

Focused checks: `python3 scripts/offline-native-app-capture.test.py` and
`node --test site/tests/offline-native-project-export.test.mjs`.
