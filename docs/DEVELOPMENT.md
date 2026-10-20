# Development

## Active application

The active product is entirely under `site/`.

`app.html` opens the production v2 Workstation. The Welcome page's four-view
interactive preview uses a read-only v2 renderer; it never acquires the writer
lease or saves a preview into the local Workspace. The executable Legacy editor,
including `app-legacy.html`, `app.js`, and `workstation.css`, has been removed
from the active checkout. Its historical source and original DOM checks remain
reproducible at the immutable `legacy-frozen` tag; native-v2 scientific owners
run against the current application. The published `app-legacy.html` URL is a
build-generated redirect to `app.html` that preserves query and fragment.
See [Legacy source sunset](operations/LEGACY_SOURCE_SUNSET.md) for test and rollback ownership.

The v2 footer links the deployed short commit SHA to its full GitHub commit
(`commit local` for unstamped development). If browser `localStorage` is
unreadable or unwritable, v2 remains editable in memory, but persistent
autosave is disabled rather than risking cross-tab overwrite. Export a
`.wafercad` project while storage coordination is unavailable; after
restoring access use the explicit takeover/reconciliation flow. A missing
or expired writer lease cannot authorize an IndexedDB commit.

Historical implementations remain available through Git history rather than the active working tree. Do not reintroduce retired backend/client APIs merely for compatibility.

## Offline source transport and Three.js priority

**Do not repeatedly request user uploads or retry blocked git clone.** First
locate the already-uploaded `three@0.179.1` npm tarball in WaferCAD Project
Sources (materialize if required) or the current container's `/mnt/data`.
The stored filename may have a numeric suffix. Then restore Three.js using:

```sh
python3 scripts/restore-pinned-three.py --archive "/mnt/data/three-0.179.1.tgz"
# Or: WAFERCAD_THREE_ARCHIVE="/path/to/three.tgz" python3 scripts/restore-pinned-three.py
```

The helper verifies SHA-512 against `package-lock.json` before extraction.
If the Sources attachment is unavailable **in a full repository checkout**,
the tracked `vendor/npm/three-0.179.1.tgz` is a verified fallback
(run without arguments). The source-only ZIP deliberately omits that tarball;
therefore its restore requires a separate local Sources/archive copy.
Reuse `node_modules/three` as long as the local workspace survives.
Only `npm ci` installs the full development toolchain.

The [source-only Artifact workflow](../.github/workflows/offline-source-bundle.yml)
uses GitHub's checkout and publishes a ZIP of the exact commit's tracked
sources, tests, fixtures, docs and workflow files. **It excludes**
`vendor/npm/three-0.179.1.tgz`, `node_modules` and Chromium. There is no
npm installation in Actions. `wafercad-source-<SHA>.zip` contains
`wafercad-source-manifest.json` with the revision and per-file SHA-256.
Use a completed existing workflow run when possible; run its narrow
`workflow_dispatch` only when a newer source bundle is necessary (the
workflow becomes manually dispatchable once present on the default branch).
The connector downloads the Artifact straight into the execution container,
where it can be extracted and verified. No `.git` history is included.

**Verified 2026-10-18:** GitHub Connector -> mounted Artifact ZIP -> local
extraction and hash verification -> native headed Chromium/Xvfb/SwiftShader
rendering succeeded. `scripts/offline-native-app-capture.py` rendered a real
in-memory demo and a strictly validated Photodetector model. Managed browser
navigation still blocked `https://wafercad.local`; `about:blank` fallback
only verifies the isolated native 3D renderer. Real Worker Open, IndexedDB,
History/Recovery, synchronized views and complete UI interaction still require
separate normal-origin acceptance. Do not create a second Chromium runner.

## Local run

```bash
python -m http.server 8000 --directory site
```

Open `http://localhost:8000`.

If managed Chromium rejects local/virtual-domain navigation with
`ERR_BLOCKED_BY_ADMINISTRATOR`, **do not conclude that local 3D diagnostics
are impossible or create a parallel capture script**. Reuse the existing
[offline native app capture](tools/OFFLINE_VISUAL_KERNEL.md#real-native-app-with-offline-swiftshader-diagnostic):

```bash
# Native v2/Three.js Renderer smoke check (headed Chromium + Xvfb on Linux):
python3 scripts/offline-native-app-capture.py --root . \
  --inmemory-demo --output test-results/offline-native-demo

# A real, strictly validated model inside the native Three.js viewport:
python3 scripts/offline-native-app-capture.py --root . \
  --inmemory-project site/examples/photodetector-literature-examples.wafercad \
  --output test-results/offline-native-photodetector
```

The script first attempts the normal application origin; under administrator
URL blocking it can fall back to the real app source running at `about:blank`
with local pinned Three.js. Inspect the actual screenshots and evidence report.
A null-origin capture is **partial Renderer evidence**, not proof of project
Open/Worker, synchronized views, IndexedDB, History/Recovery, mobile interaction
or full release acceptance. `scripts/offline-visual-kernel.mjs` is the separate
scientific SVG/PNG geometry diagnostic, not a WebGL replacement.

## Process Recipe / Base lifecycle

`site/controllers/process-recipe-controller.js` owns the guided Recipe editor and runs existing Process operations; `site/process-recipe.js` is the restricted parser/normalizer and must never execute arbitrary JavaScript. **Continue current model** is additive and requires confirmation when a process revision exists. **Rebuild Base first (new Main)** reuses the Base controller's Keep/Clear/Cancel transaction and begins a fresh Main lineage. The Base History contract lives in `workspace-snapshots.js`: when archiving from a detached historical cursor, preserve the source Variant's **original HEAD**, not the currently inspected Step. New features must cover this with unit and browser tests, including Save/Open and Undo/Redo branch graphs.

Typed Recipe lengths bypass the manual form's editing grid when assembling the existing transactional Process worker request. This includes film thickness, etch/CMP depth, Implant/Electrical depth and rough profile lengths. A 0.35 nm Recipe film must execute as 0.35 nm in every display unit. Export selects lossless storage if compact quantization would change physical Z/depth/profile lengths in the live model or any restorable History state; strict compact serialization keeps its documented grid contract. Recipe `snapshot()` is a structural History mutation and must trigger autosave even when no material operation runs. Material process lengths follow the [numerical/physical interpretation contract](science/PROCESS_NUMERICAL_CONTRACT_2026-10-14.md); the continuum Z representation threshold is not a universal atomic-film lower bound.

Recipe validation drafts are keyed by stable Step ID. Deleting a Step or changing its operation invalidates stale field errors, and Undo/Redo restores the persisted valid Recipe without unapplied field drafts. Run to Step validates only the requested prefix, and displayed error numbers follow current Step order. The Process material menu caches derived exposure only across identical model/revision, active face and Mask selection (Cell, Layers, transform, ROI, Draw source, layout elements); Geometry Kernel and Process worker validation remain authoritative. See [the Recipe field/cache integration note](archive/RECIPE_LOCAL_REPAIR_2026-10-08.md) for the original patch provenance and acceptance boundaries.

## Development checks

Install the development-only tooling:

```bash
npm ci
```

Run the full check:

```bash
npm run check
```

Available commands:

- `npm run lint` — ESLint over the active JavaScript only; vendored code is excluded.
- `npm run format` — Prettier rewrite for the active application and current documentation.
- `npm run format:check` — local formatting verification for the active application and current docs; the PR and release Quality gates enforce Prettier; `check:ci` remains available to focused legacy/specialized jobs.
- `npm test` — vector/GDS/project-schema smoke tests plus focused regression tests for XY units, GDS error handling, project files, snapshots, surface morphology, Implant clipping, palette behavior, and material boundaries.

The project-IO/schema path is intentionally separated from `app.js`: project files are fully validated before editor state is replaced, and the quantized storage representation is expanded and validated again before export. Interactive project/layout parsing, .wafercad packing/serialization, Mask GDS/OAS serialization, and process-result geometry validation run in workers so large file transforms do not monopolize the UI thread. Process candidates must be validated before Variant/model/History commit; rejected geometry leaves the live workspace unchanged. Polygon booleans and strict model validation share one lazy robust kernel with a single 0.1 nm canonical retry, matching the compact storage grid rather than introducing a looser fallback or quantizing all canonical lengths. Keep worker handoff transactional: Abort/error/rejection must not replace live state or leave the shared task controller busy.

Export and Recovery use adaptive shared-asset storage. Ordinary small/non-repetitive projects may remain `shared-assets-v2`; translated polygon dictionaries use `shared-assets-v3`; canonical repeated model arrays use `shared-assets-v4`, which stores shared model templates plus instance lists without expanding every physical site into duplicated canonical polygons. Geometry dictionaries still share exact boundary/region/annotation polygons across History, and v3/v4 may additionally share translated polygon templates encoded at the 0.1 nm persistence quantum. Expansion restores ordinary physical model/geometry values before Process/rendering where resolution is required; the canonical array runtime may keep repeated templates and instances compact for array-aware Process/Main/Section/3D paths. Lossless workspace packing retains raw sub-grid coordinates. Readers retain unencoded/v1/v2/v3 compatibility; older application versions that do not understand v4 must reject canonical-array files instead of silently opening an empty or partial model. Template/array expansion is preflighted and strict logical geometry budgets remain unchanged.

Canonical translation arrays are owned by `site/model-array.js` plus the array-specific Process/render adapters. Mask import may retain repeated translation templates and a spatial instance index; Process may retain boundary indexes and a validated worker briefly for idle preparation. These indexes/caches are derived runtime data: they are bounded, cancellable, excluded from project serialization, and may not alter canonical geometry, History, Variant lineage, or scientific validation. Copy-on-write edits preserve repeated templates until a physical context actually diverges.

Exact rectangular containment proofs and per-polygon intersection bounds avoid unnecessary Boolean work; general boundaries retain robust differences and overlapping components retain aggregate area checks. Geometry containment/intersection results are reused only within their documented cache lifetime while dimensions, stack/layer ownership, point budgets and annotation metadata remain checked per model. History import uses a synchronous batch validator with the original per-state filtering as fallback; restored states are cloned before editing. Strict file reads privately capture History validation receipts, reused once only when the exact state objects and all values remain unchanged. Autosave and Recovery lossless packing use a separate worker and preserve the writer lease guard before IndexedDB commit. See [complete import loading follow-up](archive/PROJECT_IMPORT_LOADING_2026-10-07.md), [general project IO optimization](archive/PROJECT_IO_OPTIMIZATION_2026-10-07.md), and the historical [625-site array checkpoint](archive/ARRAY_PROCESS_PREWARM_2026-10-07.md).

Annotation volume fragments are private derived data shared by Main, Section, Detail and 3D within a model revision. Host-layer, Z-range and XY-bound checks precede polygon intersections. The cache follows model/process revisions, region-array identity and annotation metadata/geometry identity; returned full-view polygons are cloned and ROI intersections remain transient. It must never replace canonical geometry or weaken strict validation.

Welcome interactive cards use `previewProject` assets in `site/examples/previews/`. Each retains the current final structure, layout, camera, ROI and display settings, one final History Step and no bookmarks. Original complete files stay at the catalog's existing `path` as backups; Open example and downloads continue to use complete History/Variants. Regenerate with `node scripts/build-example-previews.mjs --write`, then verify determinism and source preservation with the same command without `--write`. Changes to a full example must regenerate its preview. Preview generation deliberately retains v2 so a new storage codec alone does not invalidate published preview/thumbnail hashes. Published Welcome assets have per-file SHA-256 receipts in
`site/examples/bundled-integrity.json`, generated only after strict native
validation of every bundled full and preview project at Pages staging. Matching
bytes use the faster trusted decoder; a missing receipt keeps the original
strict import, and mismatched hashes abort rather than silently bypassing a
failed receipt. User-imported files always undergo strict validation. The
developer/test entry `app.html?start=example&example=<id>&validation=strict`
continues to use the original Worker/History path. The
`scripts/example-open-benchmark.mjs` baseline defaults to strict; use
`--fast` to measure the attested production path separately.

The suspended-silica microdisk cover is a cropped Chromium 3D screenshot
of the exact saved adaptive 72-band Variant, derived from the native Workstation
acceptance evidence. Its source hash tracks the full adaptive project, while
the on-demand interactive four-view preview intentionally keeps the validated
original lightweight model; the card explicitly distinguishes them. Regenerate
the cover and manifest together if the adaptive source geometry changes.

The TiO₂ metalens Welcome cover is a Chromium 3D render of the complete
4,725-site illustrative array, and is content-addressed to the full bundled
file. Its interactive four-view preview remains the four-unit representation,
so the display explicitly distinguishes the two. The T-CMOS cover is also a
real Chromium WebP, content-addressed to its saved preview project. Preserve
these provenance/hash contracts on regeneration.

Welcome browsing shows real 3D-rendered WebP thumbnails without starting app frames or parsing project/layout modules. Clicking Explore 3D or a view tab initializes one interactive frame, preserving the final-only preview workflow. Regenerate thumbnails after preview changes with `node scripts/build-example-thumbnails.mjs` against a running local site and pinned Three; hashes bind each image to its final-preview source.

UI orchestration that does not own canonical geometry lives under `site/controllers/`. Process input/state and worker request assembly belong to `process-panel-controller.js`; History edit/insert strategy, branching gates, and replay transactions belong to `history-mutation-controller.js`; browser autosave/Recovery/cross-tab lease/safe-reload behavior belongs to `workspace-persistence-controller.js`; synchronized view/base summaries belong to `workspace-view-controller.js`; Project toolbar and History-tree presentation belong to `project-controller.js`; Mask/Main/Section canvas drawing lives in `site/plan-renderers.js`. Derived process/ROI selection geometry lives in `site/selection-geometry.js`. Keep build/update checks, welcome startup routing, tab navigation, maximize behavior, rendering details, process-form validation/request assembly, History transaction state, persistence workflows, and similar responsibilities out of the main editor module when they can be expressed through narrow callbacks.

3D Fast Mode defaults on. Fast, Quality and temporary Interactive are render-mesh budgets over the same canonical surface ownership and morphology field; `display.threeFastMode` is a view preference and uses lightweight view autosave. Rough sampling, normals, sidewall subdivision, pixel ratio and transparency sort frequency may vary, while topology, annotation envelopes, Main/Section and physical GLB export remain unchanged. See [3D Fast acceptance](archive/THREE_FAST_MODE_2026-10-07.md) and run `node scripts/three-fast-mode-regression.mjs` (or `--inspection-only` for transparent/ROI checks).

Rough display filtering estimates XY sample pitch from each cap's actual
triangulated area and allocated LOD, independently of the ROI bounding box
and repeated material layers. Caps with the same seeded appearance use the
coarsest shared pitch to preserve conformal registration. This display-only
filter does not establish Section/3D interior height parity. The legacy
variable-feature stochastic field evaluates noise using a spatially varying
feature size; at large world coordinates it can vary much faster than its
nominal `featureSize`. `section-three-rough-profile.test.mjs` audits actual
Three.js triangle/cutline intersections, reports interpolation and Float32 XY
rounding errors separately, and enforces physical vertex and 50 nm film
registration. Reported interpolation errors are diagnostics, not approved
tolerances. Changing that physical heightfield requires an explicit scientific
and project-compatibility contract, including physical GLB export.

The explicit **Rough (stable scale)** option stores `morphology: stochastic-v2`.
It keeps the seeded rotation, height distribution, polarity and depth envelope,
but replaces the variable denominator with a fixed `featureSize` lattice.
Each rotated coordinate is displaced by
`featureSize * 0.25 * featureCv * clamp(coarseNoise, -1, 1)`; the two coarse
noise channels use four times the nominal pitch. Feature CV controls bounded
spacing variation here, not an exact measured correlation-length CV. This is
a distinct deterministic morphology, not a measured SEM reconstruction or a
band-limited signal. Section, CPU mesh, GLSL, sidewall/border sampling and
physical GLB export consume that same explicit field.

Existing `stochastic` profiles and unspecified Recipe rough modes retain their
legacy algorithm without automatic conversion. Manual Process, Recipe editing,
History replay, inherited films/annotations and file/Recovery storage must
preserve the selected morphology. A legacy reader rejects the unfamiliar enum
rather than silently displaying v2 as v1; unknown future values also reject.
No bundled example or saved History state is implicitly upgraded.

The Photodetector-coordinate 0.6 um cutline audit compares actual Three.js
triangle intersections at 65 interior points. With 2, 32 and 512 triangles,
v2 RMS interpolation errors are approximately 128, 27.9 and 3.53 nm, while
the legacy 512-triangle case remains approximately 133 nm. At 8,192 triangles
the production adaptive mesh gives 0.357 nm RMS
(2.83 nm maximum). Resolved v2 profiles target up to sixteen samples per nominal
feature; legacy profiles retain four. Screen-space limits, Fast/Interactive
policy, maximum subdivision depth and scene-wide triangle budgets still bound
this request, and conformal caps retain synchronized allocations. The 1 nm RMS
convergence assertion belongs to that resolved diagnostic patch with sufficient
budget, not all camera/ROI scales.
Physical GLB retains its camera-independent allocation request and existing
hard budget; finer interactive sampling does not enlarge that export request.
Matched conformal meshes retain the existing `2e-5 um` height/film contract.
Neither convergence nor the new morphology claims pixel-level equality between
Section screen filtering and coarse 3D LOD, or hardware GPU acceptance.

Hardware renderer names alone do not establish CPU/GPU height parity. Before
using shader displacement, qualify the task with up to 64 Float32 XY samples
across its prepared cap zones, executing the production profile in the vertex
shader and reading a float target. A maximum error outside the existing
`2e-5 µm` vertex-height contract, incomplete readback or unavailable float
targets selects the existing CPU mesh. Cache up to 64 task results per
renderer and dispose all temporary GPU resources; repeating an unchanged task
must not draw or read back again. This bounded screen-independent probe does
not prove unsampled or mesh-interior accuracy. Known software backends still
select CPU directly. Physical morphology, Section and CPU GLB export are
unchanged. The native offline diagnostic's `--check-rough-parity` compares the
actual Photodetector coordinates with origin and constant-height controls.
On Chromium 140/SwiftShader, the 58-point actual-coordinate probe measured a
maximum `0.479321 µm` shader/CPU discrepancy; the origin control measured
`0.0000214965 µm`, and the uniform-height control measured
`0.0000000119209 µm`. These are reproducible diagnostic observations, not
hardware guarantees or approved error tolerances. The independent physical
cutline still reports approximately `0.133455 µm` RMS interpolation error at
LOD 4; rejecting inaccurate shader displacement does not fix that legacy
field/mesh-resolution mismatch.

Exposed rough caps can use the GPU-hybrid renderer: the worker still owns adaptive topology and transferable buffers, while shader code applies deterministic surface displacement and micro-normal detail. Keep CPU fallback for buried interfaces, Implant morphology and non-unit front/back Z scaling, and keep physical GLB export on the CPU morphology path. Presentation-only 3D changes (currently opacity and borders) must not be added to the physical-scene cache key: with model/ROI/Z-collapse/layer identity/Fast policy unchanged, update existing scene objects and materials in place. Any change to this split must preserve `sceneGeneration`, `surfacePlanBuildCount` and stable scene resource counts under repeated presentation toggles.

The historical [2026-10-07 pre-main audit](archive/PRE_MAIN_AUDIT_2026-10-07.md) records the complete branch review, repaired shared-asset budget accounting and browser ownership, and local integration evidence at that revision.

## Deployment

`.github/workflows/pages.yml` deploys a filtered copy of `site/` from `main` only after the **same revision** passes Release Quality (including formatting), targeted Browser regression, the real UI v2 Stage C/M4 integration checks, and the impact-selected Main/Mask, KLayout and Recipe scientific release aggregate. Release jobs reuse the existing Browser/UI workflow owners, which no longer trigger independent duplicate `main` push runs. Weekly/manual full browser checks remain separate; KLayout compatibility stays path-scoped and manually runnable for broader corpus checks.

There is no application bundling step. `node scripts/build-pages-artifact.mjs` stages the public runtime in `build/pages/`, excluding historical UI prototypes, mocks, review pages and Node tests. The release stamps only staged JavaScript and writes `build-info.json` there; source fixtures remain available in Git and local tests.

## Current design contracts

1. XY geometry remains vector.
2. GDS XY is converted to canonical µm from the file's `UNITS` record.
3. The global XYZ display/input unit converts presentation values only; it must never rescale stored geometry.
4. X, Y and Z are stored as physical micrometre coordinates; view-only Z exaggeration must never feed back into process geometry.
5. View zoom/pan must never modify geometry or trigger full-project autosave packing; view/inspection state uses the lightweight workspace-view persistence domain.
6. Mask alignment transform is explicit and defaults to identity. It is working state until a process/export consumes it, so browser autosave persists alignment through the lightweight view record rather than rewriting a large project on every input change.
7. Cells define hierarchy scope; Layers is global.
8. Zero-width linework is not an operable mask.
9. The 3D ROI is render-only. Its perimeter defines 3D inspection cut faces and remains independent from the Section A–B line; neither view may silently move the other.
10. All four views derive from the same region-stack model.
11. Layers are referenced by stable internal ID, not by user-visible name.
12. Structure and Implant colors come from curated or generated harmonious 20-color palettes; arbitrary color-picker input is intentionally hidden from Process.
13. Etch has no growth mode.
14. Rough/Pyramid morphology is deterministic appearance metadata; Section and 3D must consume the same profile field and canonical material geometry remains ideal. Section materials, conformal films and following annotations must stay registered in Detail insets; concentration depth follows the local source surface. Widening a subpixel sidewall for visibility must preserve its rough floor.
15. Implant is a non-material annotation volume. Rendering must clip it against current material geometry; later Etch removes the corresponding surviving volume rather than regenerating it from the new surface. Section and 3D must consume the shared Implant depth-gradient contract; opaque 3D may expose only the ROI-cut face of a buried Implant, never the full buried volume.
16. Main/Mask morphology cues must remain subtle overlays that do not replace the underlying material/mask color language.
17. Base rebuilds remain reversible.
18. Every successful Process Apply must append exactly one restorable **Step** node. Failed, aborted, busy, and no-change operations must append none.
19. Snapshot-branch format v3 requires a valid non-nested workspace state on every new Step. v1/v2 remain readable as legacy formats but must not gain invented intermediate states.
20. Variant topology is Step-first: `parentBranchId` + `rootNodeId` define ancestry. New Variant creation must not require or synthesize a snapshot/bookmark record.
21. Bookmarks are annotations on Steps. Adding, renaming, or deleting a modern bookmark must not add/remove a Step or change Variant ancestry.
22. Variant HEAD is independent per Variant. Restoring a Step or Undo may move the cursor behind HEAD but must never rewrite HEAD; the next successful Apply must fork first.
23. Process position and exact workspace HEAD are distinct. A same-revision historical state must not overwrite HEAD display/ROI/project edits.
24. Any Step presented as restorable must remain restorable after autosave/reload and file export/open. Packed storage must preserve Step and Variant HEAD states through the shared asset layer.
25. Replacing live workspace state must synchronize transient Undo/Redo controls so enabled buttons never point at cleared history.
26. History UI must render Variant ancestry as a tree at the actual origin Step. A flat “Other variants” list is not an acceptable substitute.
27. Existing projects without branch metadata must normalize into one linear Main Variant without changing saved workspace state.
28. History labels that reference material/Implant/Electrical Region entities must resolve through stable IDs; renaming an entity must not leave stale labels or stale replay names on the same entity lineage.
29. History **Insert before…** must be transactional: failed/no-change inserted operations leave the original process tree untouched; current-Variant insertion may rewrite a tail only when dependency checks pass; child-Variant insertion must leave the source Variant unchanged.
30. When insertion causes replayed Deposit Steps to receive new layer IDs, all downstream replayable layer references must be remapped before the worker request is issued.
31. Project schema migrations must preserve morphology/polarity semantics across v12→v13 and older supported formats.
32. Editing a Step shared by dependent Variants must use copy-on-write rather than becoming a dead end: preserve the source/dependent histories, commit the edited Step on a new active Variant, and carry replayable downstream Steps when requested. Failed carry/replay restores the original graph transactionally.

## Source style

Prettier 3.9.9 and ESLint 10.11.0 are development dependencies. New code should not add multi-statement compressed handlers. Large event handlers should be moved into named functions or focused modules instead of continuing the earlier single-file compression style. Controller extraction must preserve the canonical model/view contracts; do not move geometry semantics merely to reduce file size.

The formatter ignores `site/vendor/`. Vendored code must not be reformatted locally.

## CI gates

Pull requests run the fast **Quality** gate (`npm run check:ci`, ESLint, documentation checks and Node tests) and the path-filtered **Browser regression** workflow, which selects owning suites with `scripts/ci-test-plan.mjs`. Process Geometry and 625-site rendering have separate conditional jobs; weekly/manual full runs cover the complete inventory. Draft PRs defer designated heavy replay jobs until ready for review. See [CI routing](CI.md) for exact triggers and exceptions. The complete local `npm run check` additionally runs `format:check`; formatting is intentionally not duplicated in the fast CI gate. Parser/import/export changes additionally trigger the pinned KLayout GDS/OASIS compatibility workflow. Keep parser-only corpus work scoped so ordinary UI changes do not pay the full corpus cost.

Surface/Implant changes should add both pure geometry/profile assertions and at least one real UI-path assertion. Changes to adaptive 3D must preserve the scene-wide subdivision budget and prove that camera-only LOD updates do not rebuild the static surface plan, spatial rough zones, or cached base triangulation. Rough triangulation belongs in `rough-mesh-geometry.js`; physical cap/sidewall/border ownership belongs in `process-topology.js`; `three-view.js` should remain scene/camera/material orchestration. A browser pass is required when changing 3D displacement, transparency, cached LOD-zone boundaries, compact Process layout, or legend interaction because syntax/unit tests alone cannot establish visual correctness.

## Product and process regression

See [Testing](testing.md) for current product layout/renderer commands and [Product review](archive/PRODUCT_REVIEW.md) for the historical Chromium gallery and interaction evidence. Current CI selects semantic coverage by ownership; full screenshot galleries belong to weekly/manual full runs with pinned Three.js. See [Testing](testing.md) for suite ownership and [Development handoff](COLLABORATION.md) for ChatGPT/Codex coordination.

See [Process benchmarks](science/PROCESS_BENCHMARKS.md) for analytic step/trench/island geometry, both faces, Direct/Conformal/Grow/Etch checks, and explicit approximation boundaries. These tests run under `npm test`.

## UI visual system

WaferCAD should read as a compact engineering/CAD workstation rather than a collection of independent web cards. Preserve information density and layout geometry. New UI should reuse the existing visual hierarchy:

- scientific headers use the shared compact toolbar treatment; persistent toggles share selected/hover palettes across Main, Mask, 3D and Section, with no extra ON/OFF badge. File/Draw, Fast/Quality and Auto/1:1 always highlight the currently named mode; popovers highlight only while open. Keep checkbox/pressed semantics independent of the mode label;
- use borders sparingly; prefer surface contrast, spacing and active-state emphasis;
- fields and selects share the same compact control height, radius and focus ring;
- primary actions use the steel-blue accent; secondary/quiet actions remain neutral;
- tool tabs should not introduce per-tab boxed borders;
- runtime feedback is centralized in the bottom status bar; semantic colors are reserved for success, information/progress, warning and error states. Do not duplicate the same message in panel hints or toast overlays.

Do not create a one-off visual language for a new panel or control when an existing workstation control pattern fits.
