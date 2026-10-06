# Full-wafer project IO benchmark fixture

`nature2026-fig3-wafer-legacy.wafercad.br` is an exact Brotli archive of the original 67,315,148-byte `shared-assets-v1` JSON project exported from installed Chrome on 2026-10-06. Compression is only for storing this test fixture in Git. Application exports remain JSON `.wafercad`, using a shared geometry dictionary; the browser does not require Brotli decoding.

The engineering fixture contains 41 restorable Steps, five bookmarks and three tiers with 625 sites each. It was generated from the user-provided `Nature2026_Fig3_WaferCAD_Reconstruction.zip` masks/plan and the current WaferCAD UI. It is a planar geometric proxy: horizontal HfO2 films omit ALD sidewall coverage; SOG is represented by overfill followed by native CMP; doping is structural annotation. It is not a measured device or an author-original mask reconstruction. Literature context: https://doi.org/10.1038/s41586-026-10496-6.

`metadata.json` records the original and archive SHA-256 hashes. No original article image is included. The benchmark verifies deep equality of the entire normalized project, not only final geometry or counts.

From the repository root, after installing locked dependencies:

```powershell
New-Item -ItemType Directory -Path test-results/project-io -Force
node scripts/project-storage-benchmark.mjs tests/fixtures/project-io/nature2026-fig3-wafer-legacy.wafercad.br test-results/project-io/reference-v2.wafercad test-results/project-io/storage-benchmark.json test-results/project-io/reference-legacy.wafercad
```

For browser timings, serve `site/`, set `WAFERCAD_URL`, `WAFERCAD_THREE_DIR`, and `WAFERCAD_CHROMIUM` to the installed Chrome executable, then run `scripts/project-import-benchmark.mjs` with the raw `.wafercad` path, report path and repetition count. Measure the legacy file on the starting product commit and the v2 file on this branch, using the same browser, viewport and machine. Each run uses a fresh browser context, the actual Open input/confirmation, project-worker completion and matching-model 3D readiness.
