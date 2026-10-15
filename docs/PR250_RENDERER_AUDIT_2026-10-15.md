# PR 250 renderer integration audit

Repository: `Xiaolong-6/WaferCAD`. Branch:
`fix/3d-rough-seams-transparent-outlines-20261015`. Baseline:
`f76c8e02a2e9944dcea72ea1db3410727bb9a67d`.

This audit records engineering evidence for the existing draft PR, not final
visual approval or authorization to merge. No merge is authorized.

## Evidence owners

- [Geometry and boundary diagnosis](THREE_ROUGH_BOUNDARY_AUDIT_2026-10-15.md).
- [ROI ownership and structural depth](THREE_OUTLINE_DEPTH_AUDIT_2026-10-15.md).
- [Runtime fixtures and visual acceptance](PR250_RENDERER_ACCEPTANCE_2026-10-15.md).

## Integration contracts

The cap worker publishes actual Float32 boundary segments. The interactive
renderer and CPU fallback rebuild rough sidewalls and ROI/buried contours from
those segments after each LOD result. Sidewalls use the union of the upper and
lower cap breakpoints and interpolate the cap polyline instead of sampling a
second nonlinear curve. GLB export consumes the same profiles with its own
camera-independent mesh budget. Renderer metadata is removed from exported
geometry extras.

Opacity and Border changes reuse scene geometry. A complementary solid/dashed
pair tests each physical contour against structural depth. The color pass
retains the existing transparency architecture; the depth pass uses the same
GPU-displaced materials, writes no color, and forces one depth submission for
DoubleSide surfaces. Annotation volumes and helper axes do not occlude material
contours. Border OFF skips the extra passes. PNG export uses the same path.

The local GPU-module cache query is retained from the existing checkout. The
user's unrelated untracked `output/` data is preserved. Audit artifacts occupy
only `output/playwright/pr250-audit/` and named `test-results/` directories.

## Checks and outstanding acceptance

Environment: Windows, Node `v26.7.0`, npm `11.19.0`, Playwright `1.55.1`,
Chromium `140.0.7339.186`, Three `0.179.1`. Installed dependency versions match
the lockfile. Hardware captures use headless full Chromium with ANGLE D3D11 on
Intel Iris Xe. Default headless-shell captures use SwiftShader. RTX 3060 has not
been established as an available renderer. No foreground windows, desktop input
or user's browser tabs are used by the acceptance runs.

Executed integration checks:

- `npm run test:ui:smoke`: passed.
- `WAFERCAD_CAPTURE_REVIEW=0 WAFERCAD_EXTENDED_REVIEW=0 WAFERCAD_RENDERER_STRESS=0 node scripts/renderer-product-regression.mjs`:
  passed. Despite the gallery reporting zero captures, both targeted PNGs were
  generated: `rough-opaque-3d-evidence.png` and
  `rough-transparent-borders-3d-evidence.png` under
  `test-results/pr250-targeted-product/`.
- `WAFERCAD_V2_EXAMPLE=metalens node scripts/v2/check-three-view.mjs`: passed at
  1440, 1024, 768 and 390 pixels, plus touch/pinch and physical export checks.
- Full extended renderer product run: failed the existing
  `Detail must contain rough Si, ALD and Implant` assertion in
  `scripts/test-helpers/section-profile.mjs:127`, invoked for the literature
  quarter-ROI case. Re-running against the frozen exact baseline failed the same
  assertion. The assertion has not been removed or relaxed. Logs:
  `output/playwright/pr250-audit/product.log` and `product-baseline.log`.

Final geometry, complete Quality, hardware/software matrix, resource stress,
performance comparisons and exact remote CI status must be recorded before
requesting final user visual review. A baseline failure remains an explicit
limitation even when the targeted PR gate passes.

## Budget handoff and resume point

The user requested a committed handoff and push before the remaining account
budget is exhausted. Preserve the existing draft PR #250; do not merge or enable
auto-merge. The remote head was refreshed and remains an ancestor of this branch.
Push normally to `origin/fix/3d-rough-seams-transparent-outlines-20261015`.

Production source is frozen at the source tree in `20b387a7`; later commits so far
contain test wording and documentation only. Final source-capture runs use an
exact Git archive under `output/playwright/pr250-audit/final-source/site` so
concurrent documentation changes cannot contaminate screenshots. An earlier
140-image run has valid observations but failed its source SHA guard and must
not be substituted for the final immutable-source acceptance.

Additional completed checks:

- Geometry workline: 62 focused Node tests passed. See its linked audit for
  exact modules, numerical bounds and preparation benchmark.
- Outline workline: 13 tests passed, including original GPU-material retention,
  one-pass depth submission and uniform restoration on exceptions.
- `node output/pr250-run-hardware.mjs scripts/array-renderer-regression.mjs --fast-transparent-lod`:
  passed (`ARRAY_RENDERER_OK`). Includes 625-site LOD and 20 presentation-toggle
  stability. Log: `output/playwright/pr250-audit/array-renderer.log`.
- Pipeline benchmark completed against baseline and repair on the same headless
  D3D11 configuration, with no page errors or geometry/resource invariant
  failures. JSON: `pipeline-before.json`, `pipeline-after.json` in the audit
  directory. Transparent draw submissions remain 16,906,262 triangles when
  Border is off. Warm frame submission was 54.7 ms before and 16.1 ms after,
  but overlapping tests, compilation and host load prevent claiming a causal
  speedup. The added Border/depth cost is measured separately in the fixed-view
  screenshot comparison.

Pending checks at this handoff:

1. Read `quality-final.log` for the final `npm run check` result. Earlier attempts
   stopped at concurrent formatting or a not-yet-written documentation target;
   these are not final test results. Checkout-only CRLF inconsistencies were
   normalized to the repository's existing LF contract without content diffs.
2. Finish immutable-source hardware 148-image, software 40-image and explicit
   CPU fallback 40-image runs. Read the acceptance audit for final output paths
   and source identity. Inspect opaque, transparent, ROI and ring screenshots;
   do not infer visual acceptance from counters alone.
3. Compare fixed-camera baseline and final hardware reports using
   `node scripts/pr250-audit-compare.mjs BEFORE AFTER OUTPUT`. Explicitly assess
   depth/Border performance and the +8.2 ms CPU preparation stress cost.
4. The extended literature Detail failure is under investigation as a test
   fixture error: the helper hardcodes `layer-2`, which is the literature
   project's back oxide; its rough front ALD is `layer-3`. Preserve registration,
   thickness and Implant assertions when correcting fixture selection. No
   canonical Process changes are warranted by this mismatch.
5. Check exact pushed-commit Quality, Browser regression, v2 3D and other
   applicable CI. Draft-only skipped large-array jobs are not passes. Keep local
   evidence and CI status separate and leave PR draft until user review.

Local convenience files under `output/` are untracked support only. The
repository harnesses and linked committed reports are the portable handoff.
The headless HTTP server on `127.0.0.1:4174` serves the working site;
`127.0.0.1:4175` serves the frozen baseline. Neither uses the desktop UI.
