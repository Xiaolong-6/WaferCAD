# Legacy UI source sunset

The production editor is `site/app.html` (v2). The public `/app-legacy.html` route is still built by `scripts/build-pages-artifact.mjs` as a query/hash-preserving redirect **without executable Legacy code**.

Legacy editor and experimental D1 DOM bridge sources are removed from the active checkout. Historical user `.wafercad` project/schema readers, IndexedDB Recovery, writer leases, and shared `site/ui-v2/real-three-controls.js` remain.

Frozen rollback commit: `eaddf7f01da0c4c057a03f263d80b13ebc6a29ea`. The remote lightweight tag `legacy-frozen` has been created and independently verified to point to that exact commit; `archive/legacy-frozen-20261016` currently points to the same commit. The tag is the canonical permanent rollback reference and nightly source pin.

Archived source-only tests run nightly against `legacy-frozen` after this workflow reaches the default branch; active v2 invariants and restored old-project compatibility tests continue on Main. Deeper Array, Metalens, Renderer, exports and example replay science obligations are documented in [#289](https://github.com/Xiaolong-6/WaferCAD/issues/289) and do not block UI source retirement.
