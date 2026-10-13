# Physical unit edit integrity — 2026-10-13

## Canonical contract

WaferCAD stores physical XY/Z values in µm. The Project XYZ selector (nm, µm, mm) is presentation/input state only. Switching the display unit must not mutate `model`, `drawMask`, `maskRoi`, `History`, or stable entity IDs. Each open numeric control must convert its current **draft**, not reload the old saved value. Angles and dimensionless fields do not change.

## Ownership and current protections

- `site/units.js` is the canonical unit converter.
- `site/ui-v2/view-kit/display-units.js` converts tagged live scalar and Polygon point editors. Overflowing values must not turn into literal `Infinity` in the editor; malformed input is validated by its owning controller.
- `site/ui-v2/view-kit/inspection-fields.js` marks physically dimensional controls. Mask Draw and Mask ROI operate through their existing controller and runtime ports.
- `site/tests/v2-display-units.test.mjs` now covers an open combined editor with lengths, polygon vertices and an untouched angular field, including three successive unit changes, canonical-model immutability, and overflow retention.

## Confirmed physical-precision hazard

A canvas-drawn shape can hold sub-0.1-nm coordinates. The inspector shows values on the 0.1-nm display grid; before this change, reapplying **unchanged** fields normalized the shape to the displayed grid. The Draw controller now returns without writing when every editor field matches its current rendered representation, avoiding a silent geometry modification or project dirtiness. Deliberate changes still use the established 0.1-nm editing precision.

## Browser ownership

The dedicated `scripts/v2/check-open-mask-unit-editor.mjs` gate exercises the production `app.html` entry: create a real Rect Mask Draw shape, keep its editor open, drive the Project unit selector through its existing `change` handler, apply the shape, and compare canonical Draw geometry/model and IDs. The gate runs before the lengthy visual acceptance owner, asserts that no-edit Apply is bit-for-bit idempotent, and verifies an intentional 10 nm edit at the established input grid. This is one focused smoke path, not a complete shape-family matrix.

## Explicit outstanding browser matrix

A unit test does not establish an end-to-end Apply result. Before promoting this branch, cover **real v2** Mask Draw: Rect, Circle, Polygon, Ring, Ring-sector, ROI and alignment, with edits open during µm → nm → mm → µm. Then check Apply, Cancel, Undo/Redo, save/export/import and exact physical geometry. Include Base dimensions, Manual thickness/depth and Recipe typed-unit execution at representative sub-nm values. Reuse `scripts/v2/check-sync.mjs`, `scripts/v2/check-m4-projects.mjs` and `scripts/process-geometry-regression.mjs`; avoid duplicating scientific fixtures.

## Verification boundary

Tests must compare canonical geometry and IDs, not canvas pixels or formatted string equality alone. Do not relax model/kernel precision limits or alter approved visual baselines. The branch's CI run and real browser acceptance must be recorded separately; successful Node conversion cases alone do not close this work package.
