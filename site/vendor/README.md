# Vendored dependency

## polygon-clipping

- Package: `polygon-clipping`
- Version: `0.15.7`
- License: MIT
- Upstream package: https://www.npmjs.com/package/polygon-clipping
- Repository: https://github.com/mfogel/polygon-clipping
- Active file: `polygon-clipping.umd.js`
- Unmodified upstream file Git blob: `ea20c2b105a925b5b9f888f394479a6ce88a2403`
- WaferCAD-patched active file Git blob: `8ac87ef1ac8db2be36494c034c6ab09fc60cedd3`

The UMD bundle is vendored because the deployed WaferCAD site has no build
step and the browser geometry kernel needs polygon Boolean operations offline
from the application server.

### Local performance delta

`Segment.compare(a, b)` returns `0` immediately when `a === b`, which is
exactly the result of the original comparator's final ID tie-breaker.
No nonidentical segment ordering or geometry tolerance is changed. This skips
redundant comparison work in large, densely overlapping M3D polygon unions.

Keep the local delta when updating the vendored package, and verify the exact
geometry output receipt with
`node --test site/tests/polygon-clipping-self-compare.test.mjs`, the process
science tests and all nine published Surface Plan SHA-256 baselines.
