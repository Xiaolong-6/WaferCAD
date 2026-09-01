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

Claims not represented in this matrix are descriptive behavior or known limitations, not completed verification claims.
