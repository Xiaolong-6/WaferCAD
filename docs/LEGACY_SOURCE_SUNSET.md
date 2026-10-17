# Legacy UI source sunset

The production editor is `site/app.html` (v2). The public `/app-legacy.html` route is still built by `scripts/build-pages-artifact.mjs` as a query/hash-preserving redirect **without executable Legacy code**.

Legacy editor and experimental D1 DOM bridge sources are removed from the active checkout. Historical user `.wafercad` project/schema readers, IndexedDB Recovery, writer leases, and shared `site/ui-v2/real-three-controls.js` remain.

Frozen rollback commit: `eaddf7f01da0c4c057a03f263d80b13ebc6a29ea`. The remote lightweight tag `legacy-frozen` has been created and independently verified to point to that exact commit; `archive/legacy-frozen-20261016` currently points to the same commit. The tag is the canonical permanent rollback reference and nightly source pin.

Archived source-only tests run nightly against `legacy-frozen` after this workflow reaches the default branch; active v2 invariants and restored old-project compatibility tests continue on Main. Deeper Array, Metalens, Renderer, exports and example replay science obligations are documented in [#289](https://github.com/Xiaolong-6/WaferCAD/issues/289) and do not block UI source retirement.

## Current-release browser gate ownership

Source retirement is distinct from **scientific test equivalence**. The original source-only regression suite remains reproducible at the pinned `legacy-frozen` commit. Historical success at that commit does **not** prove that contemporary v2 reproduces every old scientific assertion.

The package script names remain stable. Workstation and View UX now delegate to audited native-v2 owner scripts; remaining source-only browser entrypoints are explicit below. Native candidates prove scoped invariants, **not** complete equivalence with every historical Legacy DOM scenario.

- **Workstation and View UX:** `test:ui:workstation` and `test:ui:view-ux` now execute native-v2 tests through their original script paths. Real Chromium has verified startup, Welcome read-only/lease isolation, desktop docking, mobile, Main/Mask/Section/3D, physical Mask ROI, Z-break display, and interaction review. The original Legacy-specific boot/menu/gesture action-by-action equivalence remains unverified; the old scripts are preserved at `legacy-frozen`.
- **Interaction:** `test:ui:interaction` retains old File/Draw, ROI and export interaction cases. Native candidates: `check-review-interactions`, `check-unit-roi-alignment-lifecycle`, `check-mask-process-area`. The original complete shape-editing matrix is unverified.
- **Process:** `test:ui:process` retains old geometry cases. An independent, fail-closed native-v2 candidate runs `check-physical-process-units`, `check-manual-both`, `check-recipe-preflight-atomicity`, `check-recipe-prefix-stop-parity`, `check-worker-fault-parity`, and `check-mask-process-area`. Full roughness, implant, lift-off, conformal, Section and GLB equivalence is unverified.
- **Interchange:** `test:ui:io` retains original imported/exported file cases. An independent native-v2 candidate covers `check-legacy-project-recovery`, `check-klayout-mask-process`, `check-report-export` and `check-three-export-abort`. Full GDS/OAS/.wafercad roundtrip and error matrix is unverified.
- **Arrays:** `test:ui:array` retains original scoped array and export cases. Native candidates: `check-array-625-science` and `check-array-6400-worker-replay`. Full-array changes and export equivalence are unverified.
- **Examples:** `test:ui:examples` retains older example assertions. Native candidates: `check-m4-projects`, `check-metalens-recipe-science` and paper-specific workflows. Complete intermediate Step replay parity remains unverified.

History and Persistence package entrypoints were separately rerouted to native v2 transaction/Recovery checks. Scientific coverage gaps are tracked in [Issue #289](https://github.com/Xiaolong-6/WaferCAD/issues/289) and must not be masked by looser tolerances, deleted assertions, or a misleading green gate.

Before Main merge, review exact-HEAD full Node and release-relevant browser/science gates, inspect actual Chromium evidence, and obtain explicit owner approval. Preserve `archive/legacy-frozen-20261016` until the pinned nightly workflow has run successfully from Main.
