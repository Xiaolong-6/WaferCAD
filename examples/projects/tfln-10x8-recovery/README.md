# TFLN 10×8 round-resonator reconstruction — clean native mask-driven source

**Status:** reproducible engineering candidate; **not** the authors' original photomask or a published/Welcome Example. This package replaces the archived 30-template recovery, which was heavier and did not faithfully carry the later clean Mask source.

## Complete original deliverables

Four gzip-compressed, byte-for-byte preserved files from `TFLN_10x8_Clean_Mask_Driven_Rebuild_20261024(1).zip`:

| File (`.gz`)                             | Original size | Original SHA-256                                                   |
| ---------------------------------------- | ------------: | ------------------------------------------------------------------ |
| `TFLN_10x8_REBUILT_editable.wafercad.gz` |   1,736,834 B | `43b758303c226c00ab9b4909ef6cb93223cfc607edd888a6f58d4ac8d62481f9` |
| `TFLN_M1_M2_10x8.gds.gz`                 |     557,916 B | `ebb37f61452bfb6ed13819c7deafe2040297903f931a63781d5c1b41a36ee7de` |
| `TFLN_M1_M2_10x8.oas.gz`                 |     364,120 B | `43ef9f97786546d8481c96dc30da75bc152cc288c9e23c16608c26749c4bb6f7` |
| `routes.json.gz`                         |      58,339 B | `95f0c1a9cb2ce926dd020d11a583e34b73e330414219a4c7710f8213a9686fd9` |

Decompress a copy of the `.wafercad.gz` file before opening it in WaferCAD (use native **Open**, not generic geometry import). Use `gzip -dk ...` to retain the compressed source. GDS/OAS contain editable file Mask shapes as 11/0 M1 (640 polygon pieces) and 12/0 M2 (480), 1,120 total; the native project has those same polygons embedded.

## Geometry and acceptance

- Native WaferCAD v14 `vector-2.5d-array-v1`, **one native mask-processed row template**, ten 8-device translated rows, 80 real disks and 160 independent fanout routes; wafer 1,160 × 3,600 µm, 145 × 360 µm pitch.
- Published-device-inspired inputs: 40 µm outer ring diameter, about 17 µm inner rim radius, 0.4 µm anchor width, 300 nm starting LN, 80 nm retained membrane and 2 µm BOX. Inferred release holes, 1 µm-wide row fanout corridors, routing, array pitch and bounded BOX void are engineering assumptions. No HF release kinetics or optical-Q claim.
- `node examples/projects/tfln-10x8-recovery/verify.mjs` uses the production geometry kernel to **verify each decompressed SHA-256**, parse full native project, prove polygon-by-polygon GDS/OAS parity at 0.1 nm DBU, perform 1,840 LN/BOX physical thickness-position checks and generate full/ROI native Renderer geometry.
- `build_masks.py` is the original deterministic Shapely 2.1.2 geometry source, **not** precomputed mask data. Its outputs (`mask_input.json`, `routes.json`) can be regenerated with `shapely==2.1.2`. **Copy `build_masks.py` to a temporary directory before running it:** the script writes both outputs next to its own path, not into the shell's current directory. Do not overwrite the checked-in reference files.
- A separate `verify-clean-fanout.mjs` gates the 40 _real_ M1 fanout stripe borders and 18 absent row-join seams; formerly required an external file, now also supports this packaged project.

## Rebuild the native project from masks

`mask_input.json.gz` is the original generated M1, M2 and engineering BOX-void
geometry snapshot. The decompressed JSON SHA-256 is
`82ce62f4c3ef69c998390dee7c714f0cffd3b042d8a4484c05f409d89a76a708`.
With the repository's pinned Node dependencies installed, run:

```sh
node examples/projects/tfln-10x8-recovery/rebuild.mjs /tmp/tfln-rebuilt
node examples/projects/tfln-10x8-recovery/verify-clean-fanout.mjs /tmp/tfln-rebuilt/TFLN_10x8_REBUILT_editable.wafercad
```

The rebuild applies M1 and M2 through the production process kernel to one
eight-device row, explicitly splits the engineering BOX void, places ten row
instances, creates an editable mask layout, and exports GDS and OASIS. It
strictly reads the generated project and compares its material regions, stacks,
array placements and all 1,120 layout polygons against the saved reference on
the 0.1 nm coordinate grid. It also reimports both generated mask exports and
compares their polygon geometry. Ring start, winding, duplicate adjacent points
and exactly collinear intermediate points do not change the comparison geometry.

The original parameter generator can be run with Shapely 2.1.2 in a temporary
directory; pass its resulting `mask_input.json` as the optional second argument
to `rebuild.mjs`. The same reference comparisons must pass. With Shapely 2.1.2
and GEOS 3.13.1, the regenerated `mask_input.json` and `routes.json` were
byte-identical to the original inputs, and the resulting masks passed the native
project and GDS/OAS rebuild comparisons.

## Visual / CI evidence

The rebuilt project was opened in the real Workstation on a local HTTP origin,
and Main, Mask, 3D and Section were captured using pinned Chromium 140 and
Three.js 0.179.1 with software WebGL. The original TFLN project was also opened
through the project Worker, saved and restored through Recovery, and inspected
at 55% opacity in Clean, Structure and X-Ray modes for both the full array and
a two-disk ROI. A section through two disks was inspected. Separate real-app
checks covered History/Recovery lease behavior, a partial-height two-site array,
and a rough photodetector ROI with Z-break; presentation changes preserved the
underlying model. These software-rendered checks are not a GPU or browser
first-frame performance guarantee.

Full-array borders are dense; do not delete physical M1 fanout trenches as if
they were false array seams. Ready risk-targeted CI and merge approval are
required before merge.
