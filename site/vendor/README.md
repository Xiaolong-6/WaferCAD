# Vendored dependency

## polygon-clipping

- Package: `polygon-clipping`
- Version: `0.15.7`
- License: MIT
- Upstream package: https://www.npmjs.com/package/polygon-clipping
- Repository: https://github.com/mfogel/polygon-clipping
- Active file: `polygon-clipping.umd.js`
- Unmodified upstream file Git blob: `ea20c2b105a925b5b9f888f394479a6ce88a2403`
- WaferCAD-patched active file Git blob: `8f18414a2c68df7f6612c154ad87012de105e8c1`

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

The local Splay Tree `Tree.add` delta moves `new Node` into the actual
insertion branches. A lookup of an existing key still runs exactly the same
comparator and splay operations, but no longer allocates a discarded node.
The isolated published M3D layer-26 profile observed about 2.44 million
existing-key lookups; this is an allocation/GC optimization, **not** a proven
browser first-paint or stable wall-time speedup. The additional pinned receipt
covers 1,260 Booleans with repeated and EPS-near coordinates.

Keep the local delta when updating the vendored package, and verify the exact
geometry output receipt with
`node --test site/tests/polygon-clipping-self-compare.test.mjs site/tests/polygon-clipping-tree-add-allocation.test.mjs`, the process
science tests and all published full Surface Plan SHA-256 baselines.
