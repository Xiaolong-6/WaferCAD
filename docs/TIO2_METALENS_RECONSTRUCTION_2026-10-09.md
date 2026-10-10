# TiO₂ metalens paper-derived reconstruction — experimental

The subsequent full-array loading optimization and controlled measurements are recorded in [performance follow-up](TIO2_METALENS_PERFORMANCE_2026-10-10.md).

Primary source: Wang et al., _Nature Communications_ **12**, 5560 (2021), DOI [10.1038/s41467-021-25797-9](https://doi.org/10.1038/s41467-021-25797-9). Source of process details: Supplementary Note 4 in the published supporting information.

## What is source-supported

- NA 0.24 demonstrator, **30 µm** diameter, **4,725** TiO₂ nanopillars.
- Four fourfold-symmetric XY families: **circle, square, ring and bipolar concentric ring**.
- Substrate: glass with **13 nm ITO**; **1,500 nm TiO₂** e-beam-evaporated film.
- Spin coat **200 nm PMMA A2**; electron-beam lithography, development with MIBK/IPA; deposit **30 nm Cr** directionally and lift off PMMA plus unwanted Cr.
- RIE TiO₂ using patterned Cr as hard mask; strip Cr. Nominal pillars **1.5 µm** tall with near-vertical walls. Source reports **40 nm** minimum feature.

## What is illustrated, not reproduced

**The main article and supplied supplement do not disclose the full 4,725-site numerical XY/GDS mask and parameter assignment.** Accordingly the script outputs two distinct artifacts:

1. **Four-unit local 5 × 5 µm process project** with executable Recipe, Mask layer, material History and checkpoints from cleaning to final pillars. Its four XY sizes and positions are explicitly _illustrative_. The glass thickness shown (2 µm) is a visualization surrogate.
2. **30 µm / 4,725-site deterministic full-aperture GDS** and CSV: illustrates geometry, source-compatible families, hierarchical topology/annular voids and Mask IO performance. The positions use a golden-angle distribution and **are not the authors' optimized phase/group-delay assignment**. Optical achromatism and focusing efficiency cannot be inferred from this artwork.

The golden-angle full-aperture GDS remains a separate Mask artifact. The small four-unit Process project can be **Run all** from Base. Welcome now opens the existing **4,725-site GRID array** with its own matching Mask; this is a different illustrative layout. Its stored process stages are assembled from Kernel-replayed templates. Full-array interactive Run all has not been certified.

## Build

```bash
npm ci
node scripts/build-tio2-metalens-example.mjs
# Outputs under test-results/metalens/:
#  * tio2-metalens-four-unit-process.wafercad
#  * tio2-four-unit-mask.gds
#  * tio2-30um-4725-sites-ILLUSTRATIVE.gds
#  * tio2-30um-4725-sites-ILLUSTRATIVE.csv
#  * reconstruction-report.json
```

No project database schema bump, no special case in the Kernel, and no optical physics functionality is introduced.

## Full-aperture canonical array

An alternate **GRID surrogate** tests full-domain canonical model coverage with 80 × 80 equal physical cells (6,400 instances), of which exactly 4,725 are intended TiO₂ nanopillar sites and 1,675 are plain ITO/glass background cells. Each of the four cross-section families has a bounded set of parameterized dimension templates. The actual ideal Step operations are applied by the Kernel to **each distinct template** before instantiation. The stored array stages are compiled structures, **not** evidence of an end-user 4,725-site Recipe Run all from Base.

This grid surrogate is a distinct layout from the existing **golden-angle illustrative GDS**. It is neither the paper's author GDS nor an optical design. Publication requires the full 80 × 80 runtime and schema checks; smaller probes alone do not establish acceptance.

### 2026-10-09 bounded full GRID result

The 80 × 80 surrogate completed in GitHub Actions with **4,725 active
sites**, **1,675 ITO/glass background cells** and **49 shared templates**
(48 physically replayed local variants plus background). Its complete GDS
Mask contains **60,232 polygons** and round-trips through the WaferCAD
GDS parser. The matching `.wafercad` file (approximately 10.3 MB) passed
project serialization, import and full-model validation. In the actual
Chromium UI, import took approximately 5.6 s and both 3D and Section
became ready at approximately 10.2 s (one CI run; not an SLA).

That CI checkpoint originally left the GRID in validation artifacts. The
full-array Welcome follow-up now commits `site/examples/tio2-metalens-full-array.wafercad`
and makes the existing `tio2-metalens-four-unit` card open it. The card's schematic
and interactive preview retain the four-unit source through `previewSourcePath`.
The four-unit file remains available at `site/examples/tio2-metalens-four-unit-process.wafercad`.

The promoted full array retains all nine Recipe steps, ten History nodes and six
checkpoints. Each stored stage has the same 6,400-cell coverage and full `TIO2_GRID`
Mask. The 48 device templates and background are processed through the same
material sequence; empty background lithography and post-lift-off Cr strip
retain their unchanged local stages. Recipe lengths and masks describe the full
30 × 30 µm domain. Rebuild Base currently uses the ordinary rectangular Base;
interactive full-array Run all remains unmeasured and may be expensive. Template
compilation is not evidence of a complete interactive replay or optical performance.

Rebuild the published fixture with:

```bash
node scripts/tio2-metalens-array-scale.mjs --grid=80 --write-example
node scripts/build-example-previews.mjs --id=tio2-metalens-four-unit
```

The reconstruction workflow verifies deterministic regeneration of the committed
full-array file, independent four-unit Run all, the actual Welcome opening and
full-array project import/3D/Section. See the follow-up handoff for executed results.

## Merge review: full-array Recipe Base gap (2026-10-10)

PR #173 remains draft. The 4,725-site stored array is kernel-compiled from 49
shared templates; its 30 × 30 µm `processRecipe.base` has no `array` descriptor.
The interactive Recipe `new-base` path therefore would reconstruct one plain
rectangular substrate, not the 6,400-cell canonical array. The existing
`createWaferArrayTiling` is a circular odd-row/column wafer constructor and
cannot reconstruct this 80 × 80 GRID simply by adding a descriptor.

The pure Recipe preflight now rejects `new-base` for canonical array models
without an array Base descriptor **before** History or geometry can be mutated.
`continue` remains available for supported existing-model operations. This is
only a safety guard, **not** completion of full-array Run All. The mandatory
merge gate remains: support deterministic 80 × 80 Base reconstruction and real
browser Run All with exact material/Mask/History parity. Do not certify or merge
based only on compiled-template History or a successful four-unit Run All.

## Full-array Welcome follow-up validation

Branch: `feat/tio2-metalens-full-array-example-20261009`, based on `main` `d73a201`.
Product commit: `351a848`.
No Kernel, schema, recovery, renderer or UI-v2 implementation was changed.
The original four-unit project, preview and schematic remain byte-preserved.

Environment: Linux, Node 24.19.0, Playwright 1.55.1 / Chromium 140.0.7339.186,
Three 0.179.1 routed from the locked local package, headless software WebGL.
No visual baseline was replaced and no manual CI workflow was dispatched.

Executed checks:

- `npm ci`: passed.
- `node scripts/tio2-metalens-array-scale.mjs --grid=80 --write-example`:
  passed full-domain validation, matching GDS parse and project reopen.
  Final file is 10,563,872 bytes; repeated generation is byte-identical,
  SHA-256 `71538e0b5376a7458f62b8c61eb9bdd869f481de8470b8c4158d45bbe39da88d`.
- `node scripts/build-example-previews.mjs --id=tio2-metalens-four-unit`:
  passed without rewriting the preview; final structure/layout match the
  explicit four-unit preview source.
- `node --test site/tests/tio2-metalens-reconstruction.test.mjs site/tests/welcome-example.test.mjs site/tests/example-recipe-audit.test.mjs site/tests/example-mask-export.test.mjs`:
  27 passed, zero failed. After the final history-counter and hierarchy
  normalization fixes, the focused Metalens suite was rerun: 3 passed.
- `npm run check:ci`: passed ESLint, documentation validation and **571 tests**,
  zero failures. The broad run took approximately 16.6 minutes in this shared
  environment; it includes heavy existing M3D/Native fixtures.
- `WAFERCAD_THREE_DIR=<checkout>/node_modules/three node scripts/tio2-metalens-ui-regression.mjs`:
  passed independent four-unit **9/9 Run all**, actual Welcome title-link opening,
  full-array project export, exact model and Mask equality, all ten History nodes,
  six checkpoints and nonblank 3D/Section. Zero page errors.
- `WAFERCAD_THREE_DIR=<checkout>/node_modules/three node scripts/tio2-metalens-grid-browser.mjs`:
  passed the separate full-array file-import and actual 3D/Section path, with
  zero page errors. Tests used a colocated Python HTTP server because separate
  executor calls have isolated loopback namespaces.
- Targeted ESLint, changed-file Prettier, `git diff --check` and
  `npm run docs:check`: passed.

The first browser attempt tried Project export during asynchronous scene
assembly and timed out on a control evaluation. Browser owners now wait for
3D readiness before exercising Project controls. A subsequent exact Mask
comparison caught a missing empty `TIO2_GRID` hierarchy entry in the generator;
the published layout now contains the same canonical hierarchy that the app
exports. Geometry assertions remain exact. CPU sampling identified snapshot
cloning/comparison as significant startup work; this change does not claim to
eliminate that broader performance debt.

Browser evidence is retained under `test-results/metalens/`: local Run all,
Welcome/export view reports, full-array import reports and actual 3D/Section
screenshots. Interactive full-array Run all, optical performance and Windows
visual acceptance remain outside this follow-up's certification.

Observed startup times under concurrent regression load were 44.9 s to Welcome
import completion and 96.6 s to its first ready 3D frame. The separate file-import
probe took 46.2 s to import and 74.8 s through view capture. These shared Linux
software-WebGL results certify completion, not a production performance target;
large History capture/comparison remains a measurable limitation.

At the original integration checkpoint, remote push was rejected by automatic
approval review because explicit publication authorization was missing. On
2026-10-10 the user granted that authorization. The complete integration and
loading optimization were published to
`feat/tio2-metalens-full-array-example-20261009`, product commit
`e35a8c8df268d9a58446fcd1875968a64fc0e2a8`, with an exact file-tree match to the
tested local product. See the [performance publication record](TIO2_METALENS_PERFORMANCE_2026-10-10.md).
No PR, merge or deployment was made by this follow-up.
