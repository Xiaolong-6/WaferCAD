# Verification matrix

Run the committed checks from the repository root:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
npm run test:ui
```

Only synthetic fixtures under `tests/fixtures` are used. No commercial layout is copied, uploaded, archived, or committed.

| Requirement | Reproducible check |
| --- | --- |
| GDS inspection, hierarchy and optical composition | `tests/test_api.py::test_layout_inspection_preserves_layers_and_hierarchy`, `test_mask_compose_removes_stitches_and_applies_polarity` |
| Polygon request complexity and streamed upload limits | `test_geometry_request_rejects_total_vertex_budget`, `test_gds_upload_limit_is_enforced_while_streaming` |
| Exact substrate and exposed-surface partitions | `test_exact_substrate_thickness_with_overlapping_cuts`, the three `test_surface_partition_*` tests |
| Main → Pattern Editor → projection → process workflow | Playwright `core wafer workflow stays functional in Chrome` |
| Explicit refresh restore and IndexedDB persistence | Playwright `refresh stays empty until the user restores the previous session` |
| Projection invalidation by substrate or source revision | Playwright `new wafer invalidates...`, `mask source changes...` |
| Cut union before Three.js triangulation | Playwright `overlapping substrate cuts are unioned...` |
| Slow exact-thickness response cannot overwrite newer cuts | Playwright `slow exact-thickness response cannot overwrite newer cut geometry` |
| Mixed-height growth, etch and local doping | The three mixed-height Playwright tests |
| Project schema/future-version rejection | Playwright `project loader rejects future versions and invalid wafer dimensions` |
| Relative thickness display (logarithmic between layers, linear within) | Playwright `relative thickness mapping is logarithmic between layers and linear within`, `switching display mode never mutates stored thickness labels` — checks numeric table 1 nm–500 µm, 50/100 nm partial, 100/500 substrate proportion, front/back symmetry, stacked layers, per-layer scale, doping proportion, physical invariance and v8→v9 `log`→`relative` migration |
| Z display modes and scale labels | Playwright `cross section can compress a persisted substrate Z interval` now expects `relative thickness`/`physical Z` and `Display scale` |
| Three module lifetime and one canvas | `three-view-extraction.spec.js`: snapshot/camera restore, new wafer, Pattern/Main, project round trip, idempotent initialization, terminal cleanup and destroy during pending initialization |
| Three RAF and visibility | `frontend-memory-p0.spec.js`: 50 requests → one rebuild and Pattern/Main pause/resume; `three-view-extraction.spec.js`: simulated document-hidden event stops frame advancement and visible event resumes |
| Extracted Three topology and refill | Unchanged `pattern-refill-topology.spec.js`: real GDS upload/commit, Push2/Pull2 flush in Physical and Relative, canonical ring holes and QA-only bounds; existing section-view extraction tests remain independent |
| Process-controller UI boundary and atomicity | `process-controller-extraction.spec.js`: one QA instance; front/back Push2/Pull2; undo; exact-depth through-etch and over-depth rejection; doping routing; injected failure of doping consumption after successful solid splitting leaves physical state, undo and persistence revision untouched; diagnostics absent normally |

Snapshot-controller extraction is covered by `snapshot-controller-extraction.spec.js`: one UI controller, exact device/camera restoration, active auto-save preserving identity and thumbnail, shared device references surviving deletion, active-delete semantics, independent process undo, project replacement, and absence of diagnostics outside QA.

Final architecture smoke coverage is limited to three tests in `final-frontend-architecture.spec.js`: Top pan/zoom/selection and mirrored A/B dragging; wafer validation/replacement/reset preserving snapshots; one instance of each view/controller, Top cleanup, acyclic local static imports and dependency direction. Existing behavior suites remain unchanged.

Tests importing the application reuse its actual script URL (including version
query) so they do not instantiate a second application under an unversioned URL.

Claims not represented in this matrix are descriptive behavior or known limitations, not completed verification claims.
