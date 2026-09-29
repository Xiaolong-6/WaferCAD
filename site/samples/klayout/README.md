# KLayout compatibility samples

These files are a small UI-facing subset of the upstream KLayout test corpus. They are used to exercise WaferCAD's real browser import path, not just parser unit tests.

Upstream: `KLayout/klayout`  
Pinned revision: `5fa733e1680212e4ceda532ca5fa6ea707c654de`

The original upstream paths are recorded in `site/sample-layouts.js`. The full KLayout corpus is **not** vendored here; CI checks it out at the pinned revision for the parser/flatten compatibility sweep.

The sample files retain KLayout's upstream license. See `LICENSE-KLAYOUT.txt`.
