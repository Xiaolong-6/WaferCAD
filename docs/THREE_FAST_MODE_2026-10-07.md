# 3D Fast Mode

Branch: `codex/project-io-geometry-sharing`, following complete-import acceleration `d37e51a`. No new branch, CI, merge or deployment.

## Contract

The 3D toolbar's **Fast** button defaults on for new and older projects. Off selects Quality. Mouse rotate/pan/zoom temporarily selects Interactive, then restores the preference. `display.threeFastMode` is an optional boolean UI preference, included in file/autosave/Recovery and the lightweight view record. It does not modify canonical model geometry, process topology, Main/Section data, History Steps or Variant lineage. No project-version bump or geometry migration is needed.

`render-quality-policy.js` defines one policy over the existing surface plan, spatial zones and canonical triangulation. Quality retains the previous sampling and analytical normals. Fast lowers screen-space adaptive sampling, uses face normals from the sampled envelope instead of six extra profile samples per vertex, lowers rough sidewall subdivision and caps device-pixel ratio. All levels sample the same deterministic morphology field: no second morphology/geometry algorithm, frequency-altered canonical profile, merged material layers or simplified project cache is created. Subpixel microtexture is approximated by the coarser render mesh and its normals.

| Policy      | Rough triangle budget fraction | Rough detail | Buried interface detail | Max rough depth | Rough sidewall segments | Max pixel ratio |
| ----------- | -----------------------------: | -----------: | ----------------------: | --------------: | ----------------------: | --------------: |
| Quality     |                              1 |            1 |                       1 |              10 |                     512 |               2 |
| Fast        |                           0.20 |         0.25 |                    0.40 |               8 |                     128 |               1 |
| Interactive |                           0.05 |         0.08 |                    0.15 |               3 |                      48 |            0.85 |

Budgets never remove base triangles needed for real openings, holes, material/sidewall ownership or seam stitching. Thus a complex physical outline can exceed a nominal budget floor. Fast's and Interactive's transparency sorting is throttled to 100/180 ms; newly added meshes and interaction end force sorting. Quality retains sorting each rendered frame. The existing opaque renderer already excludes buried material-interface and annotation-body meshes; transparent views retain every contributing layer and annotation envelope, with lower subdivision for buried rough interfaces. Aggressive visibility culling was deliberately not introduced.

Camera changes continue to reuse the ownership plan, spatial zones and base triangulation. Interactive caches only disposable render mesh data and lowers cap tessellation/pixel ratio/sort frequency; static sidewalls retain their selected Fast/Quality resolution during a drag. Mode switches rebuild presentation meshes from the shared model. GLB physical export keeps its independent existing morphology-export policy; renderer budgets do not flow into physical export.

## Measurement

Windows, Node 24.19.0, Playwright 1.55.1, Chrome 154.0.8037.98, local Three 0.179.1. Headful Chrome with software WebGL, 1440×960, same camera and context, three rebuilds per mode. Synthetic 76.2 mm full-wafer case: both faces textured, a 140×100 µm etched step/window, 0.1 µm native Conformal coating, and a 0.25 µm Implant envelope. The fixture is serialized/reopened at the established 0.1 nm file precision before comparing exact geometry.

| Median/count                                     | Quality |    Fast |
| ------------------------------------------------ | ------: | ------: |
| Complete presentation rebuild                    | 5.063 s | 1.103 s |
| Rough mesh worker                                | 2.609 s | 0.237 s |
| Rough cap triangles                              | 110,560 |  26,440 |
| Static cap/sidewall triangles before annotations | 594,314 | 148,874 |
| Requested rough scene budget                     | 265,625 |  53,125 |

Interactive used 6,642 rough cap triangles and a 13,281 subdivision budget; the active renderer animation loop measured 60.3 FPS during a held drag. This is a local absolute FPS observation, not a hardware-independent speedup claim or a comparison against the previous Interactive implementation. Reported rebuild/worker timings have no concurrent browser/Node benchmark workload.

## Acceptance and reproduction

`node scripts/three-fast-mode-regression.mjs` passed in installed Chrome: default on, Fast/Quality/Interactive budgets, actual pointer drag and restoration, unchanged ownership/layer IDs, exact Main/Section pixels across toggles, unchanged physical model/annotations after export, reuse of camera caches, and off preference restored after reload. Use `--inspection-only` for the additional opaque/transparent ROI path: surviving Implant cut preserved in both modes; transparent internal bodies remain visible; cap/sidewall ownership and 2D images match. Opaque ROI has one Implant cut and zero internal bodies; at opacity 0.55 it retains one cut and three internal fragments.

Set `WAFERCAD_CHROMIUM` to installed Chrome, `WAFERCAD_THREE_DIR` to `node_modules/three`, and serve `site/` at 4173 or set `WAFERCAD_URL`. The script constructs its scientific stress model, uses the real import/renderer/export/refresh UI, and writes screenshots/results under ignored `test-results/three-fast/`. Committed scalar runs: `tests/fixtures/project-io/three-fast-mode-windows-chrome.json`.

Other executed checks:

- Full Node run: 383/384 initially passed; the only failure was the existing source-contract check for the transparency-sort function signature. The parameter was removed while retaining forced sorting through its dirty flag; focused owning checks then passed 15/15, including that contract, rough seam ownership, and physical GLB/Z-collapse checks. No physical assertion was relaxed.
- Additional preference/validation/view-domain owning checks: 11/11 passed.
- Full ESLint passed; changed-file Prettier passed.
- `node scripts/product-layout-regression.mjs`: installed Chrome passed 109 wide/medium/phone captures and all layout contracts, including the new toolbar toggle.
- `node scripts/renderer-product-regression.mjs`: installed Chrome passed 19 real renderer captures, including conformal, rough/LOD/instancing, Implant profile and opaque/transparent ownership.

Fast deliberately trades fine surface shading and high-density sampling for responsiveness. Select Quality when examining microtexture. Macroscopic structure and physical data remain the same. Windows runtime evidence does not establish Linux pixel-baseline equivalence.
