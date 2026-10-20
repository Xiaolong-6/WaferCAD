# Vendored dependency

## polygon-clipping

- Package: `polygon-clipping`
- Version: `0.15.7`
- License: MIT
- Upstream package: https://www.npmjs.com/package/polygon-clipping
- Repository: https://github.com/mfogel/polygon-clipping
- Active file: `polygon-clipping.umd.js`
- Unmodified upstream file Git blob: `ea20c2b105a925b5b9f888f394479a6ce88a2403`
- WaferCAD-patched active file Git blob: `ccc0cd3f4d97319ef22b91d48cbabd76e6d2a601`

The UMD bundle is vendored because the deployed WaferCAD site has no build
step and the browser geometry kernel needs polygon Boolean operations offline
from the application server.

### Local performance delta

`Segment.compare(a, b)` returns `0` immediately when `a === b`, which is
exactly the result of the original comparator's final ID tie-breaker.
The local delta also returns `0` when comparing a `SweepEvent` to itself or
a sweep point to itself. The upstream comparator already returns `0` in these
cases, with no event linking or other mutation. Nonidentical event and segment
ordering, numerical tolerances and output winding remain unchanged.

On M3D, instrumentation observed roughly 20.3 million self-event comparisons
and 34.6 million self-point comparisons per full Surface Plan. Profiling used
the published full project input and exact material topology modules. Final
offline A/B comparisons and scientific checks are recorded with the PR.

Keep the local delta when updating the vendored package, and verify the exact
geometry output receipt with
`node --test site/tests/polygon-clipping-self-compare.test.mjs`, the process
science tests and all nine published Surface Plan SHA-256 baselines.
