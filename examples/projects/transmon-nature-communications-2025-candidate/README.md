# Tuokkola et al. (Nature Communications 2025): transmon GDS reconstruction

## Sources and target

- Paper: https://doi.org/10.1038/s41467-025-61126-0
- Original data (Zenodo): https://doi.org/10.5281/zenodo.12819934
- Authors' main file: `Zenodo_files/sample.gds` — SHA-256 `6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02`.
- Supplementary transmon sample: `Zenodo_files/Supplementary_material/Sample_design.gds` — SHA-256 `90f5c5d447c84ffe118754cbf9b2e66bd0a863f834bee613ca968b2d12a49072`.
- Source GDS binaries are not committed; retrieve from the public author-provided dataset and verify digests.

## Actual GDS baseline (Node.js 22; WaferCAD `site/gds.js` and `site/layout-io.js`)

| Source | Cells | Boundary records | SREFs | Units | Result |
| --- | ---: | ---: | ---: | --- | --- |
| `sample.gds` | 79 | 39,304 | 371 | 1 nm DBU | Parse succeeds (~90 ms); whole root flatten **fails** at the preserved 120,000-object safety limit |
| `Sample_design.gds` | 55 | 181 | 139 | 1 nm DBU | Root flatten succeeds: 1,693 shapes (~19 ms) |

The main file top cell is `2024-04-07_EITR2_1`. It references `chip0`, `chip1`, `chip2`, `chip3` at (-5000,+5000), (+5000,+5000), (-5000,-5000), (+5000,-5000) µm respectively, plus an auxiliary boolean cell. The reusable `Unnamed_b0465f83` contains 39,232 boundaries on GDS 2/0. A single chip root expands safely without changing global import limits.

The observed GDS layer/datatype pairs are `0/0`, `2/0`, `8/0` and `8/1`. **Material mapping is not established by layer numbers alone.** `chip2` is a GDS hierarchy name, not evidence that the chosen source cell is experimental qubit Q2.

### Reproduce a lossless single-chip selection

```sh
node scripts/transmon-gds-chip-extract.mjs \
  --input sample.gds --root chip2 --output chip2.gds \
  --expected-sha256 6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02 \
  --report chip2-report.json
```

This operation copies source GDS structure records byte for byte for the selected cell and all its transitive references. It does not redraw masks, approximate geometries, or relax the import budget. The selected root is in **cell-local coordinates**; the original reticle's SREF offset is not applied.

Verified `chip2.gds` output: 23 cells, 39,487 polygons, bounds [-5000,-5000] to [5000,5000] µm, SHA-256 `a41c01775172148c50e7e0a7c5d0f5bc54651e191a9ac5a5b7728d6a92be41e0`. Native WaferCAD `parseLayoutFile` imports the selected GDS in ~164 ms; **this is not a Workstation or Renderer visual acceptance**.

## Literature-derived process checkpoints

These are intended scientific baselines, not completed process geometry:

1. Intrinsic (100) Si wafer: 675 µm thick.
2. Sputter Nb: 200 nm.
3. Lithography and CF4 dry etch: measured total 250 nm depth, including ~50 nm silicon recess.
4. Double-layer resist: ~500 nm MMA and ~400 nm PMMA, with undercut.
5. First Al evaporation: 40 nm at 45° tilt and -45° planetary angle; static oxidation.
6. Second Al evaporation: 30 + 30 nm at 45° tilt, different planetary angles.
7. Ar milling / Al bandage / lift-off and final structure.

Supplementary Fig. S1(c) gives the Q2 Josephson junction mask size as 180 × 180 nm; Fig. S2(c) estimates a *fabricated* Q2 junction around 210 × 180 nm. These are different acceptance quantities.

## Acceptance and known gaps

- [x] Verify original binary GDS units, cells, layers, refs and SHA-256.
- [x] Reproduce full-chip hierarchy budget rejection, without changing its safety limit.
- [x] Select a chip via original GDS record preservation and verify imported element counts, bounds and units.
- [ ] Establish material interpretation for each GDS layer using the paper and geometric overlays.
- [ ] Locate Q2 unambiguously and compare its original mask to Supplementary Fig. S1.
- [ ] Rebuild Nb deposition, dry etch and Si recess and verify 200 nm/50 nm cross-sections.
- [ ] Check shadow evaporation, oxidation interface and lift-off against the process kernel; never claim unsupported process physics.
- [ ] Capture actual WaferCAD Chromium Mask, Section and 3D images; validate save/open and History/Recovery using normal origin.
- [ ] Final targeted CI, Quality and scientific release gates before requesting a merge.

The initial audit was run against an older offline source snapshot; the current `main` copies of `site/gds.js` and `site/layout-io.js` were independently checked to have the **same Git blob hashes** (`78afaeddfcb28887d6134853f9aaa436faf7da9b`, `7100985c7ad579daf6ca0e90adbbc0789cd85a39`). A complete latest-main local checkout and Chromium acceptance are still outstanding.


## Q2 original-GDS ROI and first native Nb Process replay

**Status: source-backed research candidate, not a released Example.** The original dataset is published by the authors (Zenodo v4: https://zenodo.org/records/14651787). No original binary author GDS is checked into WaferCAD; obtain it from Zenodo.

The `chip0`–`chip3` cells in the main GDS are *chip variants*, not transmons Q1–Q4. In author `chip2`, Q2 is the original SREF to `jj_width0p18` at **(1400, 2513) µm**, consistent with the 180 × 180 nm Q2 junction mask design in Supplementary Fig. S1. This has been checked against the source GDS cell hierarchy.

```sh
node scripts/transmon-gds-q2-roi.mjs \
  --input sample.gds --output transmon-Q2-ROI.gds --radius 500 \
  --expected-sha256 6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02 \
  --report transmon-Q2-ROI-report.json

node scripts/transmon-replay-nb-q2.mjs \
  --input transmon-Q2-ROI.gds \
  --output Transmon-Q2-Nb-etch.wafercad \
  --report Transmon-Q2-Nb-report.json
```

The author ROI selection does **not redraw any polygons**: it copies original GDS polygon records whose untransformed bounding boxes intersect the Q2 search window. Polygons crossing the requested ROI remain whole. Source SREF to Q2 and dependent structures are preserved. The resulting source-local Q2 GDS has SHA-256 `12e40565bab2f6c0841b5c3d051fcf38cc1e3c9deda5eaa53ab06cd70782f5e5`, **7 cells, 45 polygons**: 28 on `2/0`, 8 on `8/0`, and 9 on `8/1`; WaferCAD's own layout parser imports it. The exported bounding box can exceed the requested ROI because source polygon geometry is not clipped.

The initial reconstruction uses the `2/0` source patterns as Nb *removal* regions, based on correspondence with the shaded Nb-removal design shown in Supplementary Fig. S1. The interpretation is still subject to a final overlay/author-process check. The two `8/*` datatypes are reserved for EBL junction lithography; their exposure-dose assignments have **not** been proven.

### Verified first process checkpoint

- Starting substrate: intrinsic Si (100), 675 µm.
- Real native Process operation: blanket 200 nm Nb deposition.
- Real native Process operation: 250 nm directional etch through the translated and geometrically clipped source `2/0` mask, i.e. 200 nm Nb removal plus 50 nm Si recess.
- Model processRevision 2, 2 material regions. At model XY (0,0), Si top is 337.45 µm with no Nb; at (0,20), remaining Nb thickness is 0.2 µm above original Si top 337.5 µm.
- Full output project successfully passed strict schema validation, export serialization, storage expansion, and scientific readback. Output project SHA-256: `5ba6debaf54c6f0ebd6c38b1bd9b16633983fac5059744a51b0d5fa1c5eedf8f`.
- Focused tests with both author-provided GDS files: **8/8 passed**. Run them locally with:

```sh
WAFERCAD_TRANSMON_GDS=/path/to/sample.gds \
WAFERCAD_TRANSMON_Q2_ROI_GDS=/path/to/transmon-Q2-ROI.gds \
node --test site/tests/transmon-gds-chip-extract.test.mjs \
  site/tests/transmon-gds-q2-roi.test.mjs \
  site/tests/transmon-q2-nb-replay.test.mjs
```

- The existing `scripts/offline-native-app-capture.py` loaded the strictly validated project in an **isolated native Three.js** model viewport using Chromium + SwiftShader with ROI `[-125,-125,125,125]` µm and Z break `[337.7,336.8]` µm. Native mesh completed; 0 browser page errors. **Normal-origin loading was blocked by managed Chromium URL policy.** This is partial native Renderer evidence, **not** Mask/Section synchronization, Worker-backed Open, History/Recovery, or product visual acceptance.
- This first local Kernel diagnostic ran against the previously mounted source snapshot because the current `main` exact-SHA checkout is not available locally; the current-`main` `gds.js` and `layout-io.js` Git blobs match the snapshot, but `model.js` does not. Targeted process/scientific tests on the actual new branch baseline remain required before merge.

The project does not simulate Josephson shadow evaporation, lift-off, AlOx or the quantum electrical response. It is a **Nb + Si recess checkpoint** only. No manual CI or full Quality suite was run for this research iteration.

## Original Josephson junction double-dose mask verification

The author GDS source has also been checked at the **actual Q2 SREF** and in its native unrotated cell, using `scripts/transmon-junction-dose-audit.mjs` and `site/tests/transmon-junction-dose-audit.test.mjs`. This test uses the public source binary and does not create synthetic replacements for the final source measurement.

```sh
node scripts/transmon-junction-dose-audit.mjs \
  --input /path/to/Zenodo_files/sample.gds \
  --report q2-junction-dose-audit.json
WAFERCAD_TRANSMON_GDS=/path/to/Zenodo_files/sample.gds \
  node --test site/tests/transmon-junction-dose-audit.test.mjs
```

**Measured author mask facts:** `chip2` references `jj_width0p18` at (1400, 2513) µm with a 90° rotation, no reflection, unit magnification. Flattening the original `chip2` yields 39,487 polygons; all 17 nearby EBL polygons equal the native `jj_width0p18` geometry after that reference transform, matching their original vertices and layer/datatype identities. In the junction cell, `8/0` has 8 polygons with total union area 11.200000 µm², and `8/1` has 9 polygons with total area 11.201288 µm². Their Boolean intersection is zero.

**Dose-to-layer interpretation remains a hypothesis:** the `8/1` long connected junction strips geometrically correspond to the main lithographic pattern (1000 µC/cm² in the article). The `8/0` terminal regions plausibly correspond to the lower-dose undercut exposure (400 µC/cm²). Because the GDS contains no unambiguous exposure-dose metadata, this cannot yet be stated as an author-verified layer map. See Supplementary Fig. 1 and the Methods section; do not silently turn this hypothesis into a verified material/process assignment.

Local offline validation on the source snapshot: **3/3 new targeted tests passed**, including incorrect-rotation and overlapping-datatype counterexamples; Prettier 3.9.9 check passed. GitHub copies of both files were verified by their exact Git blob hashes. The complete current-branch checkout, WebGL Workstation, resist undercut geometry, actual 45° shadow evaporation, thin AlOx and lift-off **remain unverified/not implemented for this paper**. No simulated junction 3D result is claimed.

**Next scientific gate:** establish a generic material/process contract for two-layer MMA/PMMA relief, shadow occlusion and directional deposition at the specific `θ=45°`/`ϕ` angles in the paper, including selective clearing and bandage contact. Do not approximate this by non-shadowed conformal coating or falsely claim the existing Implant tilt models metal evaporation.

## Sampled oblique shadow visibility — research kernel, not process deposition

`site/shadow-exposure-geometry.js` adds a generic 2D **substrate visibility** calculation for beams incident through sequential resist apertures. For a beam with polar tilt `θ` and in-plane azimuth `φ`, visibility at a substrate point requires the ray `(x, y) + z tan(θ)(cos φ, sin φ)` to remain inside the aperture at all *sampled* heights of every resist layer. This calculation intersects translated openings using WaferCAD's own polygon Boolean kernel. The sampling interval is explicit, and arbitrary nonconvex openings are not claimed to be solved exactly in the continuum limit.

The source-backed research hypothesis for Tuokkola Q2 is PMMA upper openings = `8/1` and MMA lower undercut openings = union(`8/1`, `8/0`). Use author-reported 0.5 µm MMA + 0.4 µm PMMA; test `θ=45°`, `φ=-45°, +45°, -135°`. These designations are provisional because author GDS does not encode dose-to-layer semantics or evaporator-stage coordinate mapping.

**Actual source-GDS result:** the `-45°` / `+45°` visibility overlap was 0.0322763, 0.0322678, 0.0322625, and 0.0322592 µm² for resist-height sampling steps 0.15, 0.075, 0.0375, and 0.01875 µm. The 180 × 180 nm lithographic mask area quoted in Supplementary Fig. 1 is 0.0324 µm². This agreement is suggestive only. It is not a measured deposited junction area, tunnelling area or an independent validation of the assumed dose map. Detailed source SHA, convergence and explicit limitations are in `q2-oblique-shadow-evidence.json`.

Focused local verification from the existing manifest-verified `9d8b7a98` source-only Artifact (1,118 files, all SHA-256 checked) with unchanged GDS, Boolean and benchmark module Git blobs relative to the target branch:

```sh
WAFERCAD_TRANSMON_GDS=/path/to/Zenodo_files/sample.gds \
  node --test site/tests/shadow-exposure-geometry.test.mjs
# 5 passed, 0 failed (includes author-GDS convergence and adversarial nonconvex aperture).
```

Prettier 3.9.9 passed for both new code files; branch Git blobs match the locally verified files exactly. A complete checkout of this branch remains outstanding, as do actual manufacturing geometry (resist wall shape, shadowed deposited metal volumes, alumina oxidation, lift-off), Worker/History/Recovery, and native normal-origin WaferCAD visual acceptance. No new CI was triggered for these local mathematical tests.

## Native fixed-angle Direct replay and XY material ownership gate

The Q2 research builder now supports `--native-direct` as an opt-in execution path in `scripts/transmon-shadow-al-preview.mjs`. It uses ordinary `growth: 'direct'` with explicit `incidence: { tiltDeg, azimuthDeg, heightStepUm, apertureStack }`; it does **not** define a PVD operation or empirical sidewall fraction.

```sh
node scripts/transmon-shadow-al-preview.mjs \
  --gds /path/to/author/sample.gds \
  --native-direct \
  --output Transmon-Q2-Direct.wafercad \
  --report Transmon-Q2-Direct-report.json
# Optional *explicit and sourced hypothesis* only:
# --oxide-thickness-um 0.002 --oxide-source "Illustrative value, not author measured"
```

Unlike precomputing all three XY footprints on a flat substrate, native Direct recalculates ballistic visibility against the **current** material stack for each Al dose. The substrate is 675 µm Si, the hypothetical resist aperture is 0.5 µm MMA plus 0.4 µm PMMA, and the fixed beams are 40 nm at (45°, −45°), 30 nm at (45°, +45°), and 30 nm at (45°, −135°). The 8/0 versus 8/1 resist interpretation remains **unverified**.

An important correctness failure was reproduced: applying unsnapped fractional XY illumination footprints across all three original-GDS exposures returned successful native Process operations but later failed strict project schema because two material regions occupied the same XY area (~0.0000843 µm²). The repair is **restricted to opt-in angle/physical-aperture Direct**: canonicalize the calculated incoming footprint on the existing 0.1 nm physical persistence grid *before* partitioning the material columns. A further strict per-operation ownership gate rejects larger residual overlaps and uses the existing incidence transactional rollback; global tolerances and historical 0° Direct are unchanged. A coarse 75 nm height step is now rejected rather than allowed to generate invalid material ownership.

With the 37.5 nm sampling interval, the author GDS native Direct replay passes strict save / expansion / schema validation: three Al exposures, 8 distinct XY material regions, an optional separately identified hypothetical AlOx spacer, and a two-dose footprint overlap around **0.0322630 µm²**. At 18.75 nm the overlap agrees within 0.0001 µm². The earlier unsnapped multi-dose preview and the corrected native model are not physically calibrated evaporator or tunnel-barrier models. Sidewall flux, time-resolved thickness growth, deposition on already formed sidewalls, actual PMMA/MMA wall shape, real oxidation kinetics and full Workstation/History/Recovery acceptance remain open.

Current local targeted science/Process/Project/History selection: **115/115 passing**, including the real author source GDS. Local pinned Prettier 3.9.9 check passed. Chromium 144/SwiftShader rendered the validated project in the documented null-origin isolated Three.js viewport (0 page errors); nanometre Al/AlOx interfaces were still not visually discernible, so full visual acceptance is **not passed**. Source-bound full Quality and the complete exact merged-branch checkout remain outstanding.

## Isolated fixed-angle Direct sidewall: safe geometry contract

Direct supports an **explicit opt-in** `incidence.sidewallGeometry = 'isolated-step'` for an isolated, axis-aligned rectangular material step without resist or other blocking structures. No separate deposition process mode is introduced. On an illuminated vertical facet with outward XY normal `n`, a beam of fixed tilt `θ` and azimuth `φ` deposits a finite lateral material width

```text
sidewall width (um) = nominal horizontal thickness (um) * tan(theta) *
                      max(0, dot(outwardNormal, [cos(phi), sin(phi)]))
```

This is the ballistic projected-flux relation for an ideal vertical step, not a general evaporator or arbitrary-3D shadow solver. The resulting native 2.5D material occupies a narrow band **outside the raised solid** from the lower to the upper physical Z surface, with an explicit `direct-sidewall` role. Later Direct deposition must not use the artificial top of this vertical film as a horizontal physical source. Existing angle-less Direct and existing optional angle-only Direct are unchanged.

**Scientific scope is intentionally narrow:** the solver requires exactly two physical surface-height regions, a single axis-aligned rectangular raised region, the complete wafer face, no Z-resolved resist aperture, and a lateral width resolvable on the 0.1 nm persistence XY grid. Unsupported geometry/angles/masks fail with the transactional rollback; no empirical coverage factor, broadening of tolerance or rotating target is introduced. This does **not** yet support original Q2 junction resist walls, arbitrary three-dimensional occlusion, competing tall features, sloped facets or dynamic self-shadowing.

Verified with offline source-backed Process/Conformal/author-Q2 tests: **25/25 passed**; strict `validateProcessModel`, save/export/expand/`validateProjectFile`, positive and reversed azimuth, diagonal two-wall illumination, unsupported-mode rollback, and subsequent Direct exclusion of the artificial wall cap. Prettier 3.9.9 passed. The real native Three.js model was rendered under headed Chromium + SwiftShader using the standard `offline-native-app-capture.py` null-origin diagnostic with 0 page errors. Thin sidewall geometry was not visually distinguishable at the chosen scale, therefore **visual acceptance is incomplete**; normal-origin Workstation/History/Recovery and exact branch-HEAD final Quality also remain unverified.

## Exact upper-aperture visibility for isolated Direct sidewalls

The opt-in `incidence.sidewallGeometry = 'isolated-step'` can now accept an
`apertureStack` **only when every resist aperture is wholly above the raised
wall**. At each resist height, all incident rays starting anywhere on the
finite-height rectangular wall sweep a planar parallelogram; Boolean
containment of that entire envelope in the aperture is checked using the
existing polygon kernel. Fully visible walls receive the previously verified
ballistic normal-projection thickness. Fully blocked walls receive no film.
**Partially visible walls fail closed and roll back the Process transaction**,
because the current 2.5D wall slab cannot express Z-varying material coverage.
Resist intersecting the wall, competing obstacles, nonrectangular steps,
multiple separated heights and evolving sidewalls are not supported.

This closes a specific false-coverage risk without introducing PVD,
user-calibrated coverage fractions or rotating targets. Tests cover full,
blocked, partial and Z-intersecting apertures; a real native Direct operation
and strict Process Model validation; and a byte-for-byte unchanged predecessor
after a rejected deposit. The author's Q2 MMA/PMMA undercut intersects the
junction topography, so this feature is **not yet a complete Josephson process
solver**.

Reproducible offline evidence: Chromium 144 + SwiftShader renders a schema-
validated exported research project using `offline-native-app-capture.py`
with ROI around the step at x = 2 µm, and Z break 6.08–4.90 µm. The sidewall
band is visible after correcting an initially misplaced ROI; this is native
Three.js null-origin diagnostic evidence, **not** a full Workstation,
Worker/History/Recovery or Section/3D quantitative acceptance.


## Fixed Direct: partial-Z sidewall deposition through upper rectangular openings

The isolated rectangular-step Direct sidewall solver can now represent **height-limited**
metal deposition without inventing a full-height wall. For fixed angle θ/φ,
the ray from a wall point at Z to an upper resist height Zₐ has coordinates
(x,y) + (Zₐ−Z)tan(θ)(cosφ,sinφ). Rectangular aperture bounds produce exact
linear inequalities in the wall Z coordinate; intersecting all aperture
faces yields the visible Z interval. The resulting film has independent
physical XY width and actual stored material Z bounds.

Example: a 1 µm wall (Z=5–6 µm), 45° Direct and an upper resist aperture
at Z=6–6.6 µm yield **Z=5.2–5.8 µm** of metal, leaving 0.2 µm
uncoated at each end. This is canonical material geometry, not display cropping.
The 0.1 nm project quantum is applied conservatively, snapping the visible
Z interval inward. New and legacy Direct use the same native Process and
project serialization pathways. Multiple rectangular upper apertures are
intersected; nonrectangular masks still use the former exact fully visible
or fully blocked check, while partially visible nonrectangular masks fail closed.

This is deliberately not a general Josephson junction solver. The current
2.5D representation assumes the entire rectangular wall *length* has
the same Z visibility; tangentially partial opening, openings intersecting
the step wall, and competing material shadows remain unsupported. It does
not yet solve the actual sub-µm Manhattan resist undercut/AlOx/sidewall
cross-section from the Q2 paper. Do not enable this mode for the full
author Q2 replay until the partial-X/Z facet-owner geometry contract exists.

Focused local verification on the aligned offline source: **107 passed, 0 failed**,
including Process, Conformal, strict project geometry/storage, History and
new partial-Z tests; Prettier 3.9.9 passed. A schema-validated output was
rendered using the existing real native Chromium + SwiftShader offline
capture with zero page errors; two actual 0.2 µm uncoated intervals remain
hard to resolve in the current 3D view, so final visual acceptance is
**not passed**. Normal-origin Workstation/Worker/History/Recovery and
the exact Git HEAD full release Quality gate remain unverified.


## Fixed-angle Direct: independent XY and Z sidewall bounds

The experimental \`isolated-step\` sidewall geometry now supports partial **length**
clipping for an upper, axis-aligned rectangular resist opening when the beam
has **zero component along the facet tangent**. The original physical
sidewall interval is clipped in XY and only that retained line segment is
passed to the existing analytic upper-aperture Z interval solver. Both
endpoints snap **inward** to the established 0.1 nm persistence quantum.
If clipping does not occur, the old wall coordinates are preserved exactly.

A critical native Process control-path error was also fixed: a narrow
upper aperture may completely block **every horizontal surface** while
still illuminating a **vertical surface**. In that case ordinary Direct
must not return \`changed: false\` before materializing the eligible sidewall.
The absence of horizontal hit, material contact and eligible horizontal
surface is now checked together with actual nonempty sidewall plans, without
weakening the original default Direct contracts.

**Actual native Kernel fixture:** one raised rectangular step, 40 nm
nominal Al at θ=45°, φ=0°, an upper opening with X bounds 2.2–3.4 µm,
Y bounds −0.4…0.4 µm and resist Z bounds 6–6.6 µm. The resulting
sidewall Al occupies X=2–2.04 µm, Y=−0.4…0.4 µm, Z=5.2–5.8 µm,
with an actual material **volume of 0.0192 µm³**, matching the analytic
product (0.04 × 0.8 × 0.6). No metal is deposited along that wall
outside the upper mask's Y interval or in either unilluminated Z band.
Project strict model/schema validation, compact export, expansion and
re-validation passed, without altering global scientific tolerances.
Independent local geometry and relevant Process/Conformal/History/Project
regressions passed **32/32** on the reconstructed baseline. Evidence,
full limitations, and fixture SHA-256 are in \`direct-sidewall-xy-z-science.json\`.

Tangentially oblique incidence coupling wall length to Z, nonrectangular
partial XY apertures, competing tall occluders, arbitrary facets,
resist contacting the wall, dynamic thickness/self-shadow and original
Q2 junction fabrication remain **unsupported**; such cases remain
fail-closed. The real native Chromium diagnostic rendered the validated
model without page errors, but the 40 nm band was not distinctly
recognizable under inspected views. **Visual acceptance and exact branch
HEAD final Quality remain open.**


## Oblique fixed-direction Direct: conservative tangent–Z facet partition

The experimental \`Direct\` sidewall solver has a new **geometry-only**
extension for a fixed incident direction with a nonzero component along
the wall's tangent, such as \`θ=45° / φ=45°\`. No additional process type,
rotating source model, empirical wall-coverage fraction, or global numerical
tolerance is introduced.

A beam through upper rectangular, Z-resolved apertures imposes a series
of **linear constraints** on wall-tangent coordinate \`s\` and height \`z\`:
\`opening_min <= p(s) + (apertureZ - z) * incidentXY <= opening_max\`.
The exact illuminated facet is usually diagonal in \`(s,z)\`, whereas the
native 2.5D material Kernel stores constant-Z intervals over XY regions.
\`site/direct-sidewall-facet-partition.js\` splits the tangent direction
into bounded slices and analytically intersects the worst-case aperture
constraints at both tangent endpoints and both aperture heights. Every
emitted XY/Z rectangle is **strictly inside** the ray-visible domain;
missing corner triangles are a deliberate *under-approximation*, not
silently deposited material.

The unit contract is physical µm; material XY/Z vertices snap *inward* to
the established 0.1 nm persistence grid. \`facetSliceUm\` (default
0.05 µm) and \`maxFacetSlices\` (default 256) are explicit optional
research controls. Coarser step sizes may visibly undercount coverage:
they require convergence checks before scientific acceptance. Unsupported
nonrectangular upper apertures, wall-intersecting resist, sloped surfaces,
competing obstructing structures, out-of-budget regions or unexpected
polar angles fail closed with the existing Direct transaction rollback.
The earlier exact XY-only / Z-only solutions are retained when the incident
direction has no wall-tangent component.

**Local evidence (source-backed but not exact branch HEAD):**
a 2 µm tangent-length test wall with a single rectangular upper aperture
and θ=45°, φ=45° produced **15** conservative XY/Z patches at
0.05 µm resolution. Their positive-area pairwise overlap was zero.
The analytic illuminated facet areas (µm²) increased monotonically when
the tangent sampling step was halved:

| Maximum tangent step (µm) | Conservative facet area (µm²) |
| --- | ---: |
| 0.20000 | 0.129660 |
| 0.10000 | 0.196920 |
| 0.05000 | 0.229245 |
| 0.02500 | 0.245175 |
| 0.01250 | 0.253245 |
| 0.00625 | 0.255252 |

These are intentionally **lower bounds** for this simplified science
fixture, not the Q2 junction area or a calibrated Al deposition volume.
In a local reproduction of the PR #352 native vector Model with the
relevant Direct sidewall material hooks ported, an actual \`applyOperation\`
materialization generated 17 nonoverlapping material regions and strict
\`validateProcessModel\` passed. Project export and storage expansion
passed strict \`validateProjectFile\`; 76/76 focused Project/History/
geometry-storage regressions and five targeted mathematical/material-plan
tests passed. These checks **must be repeated against exact branch HEAD**
before merge.

The real Chromium 144 + SwiftShader native Three.js offline diagnostic
rendered the locally schema-validated science project with zero page
errors. Even after a tighter ROI and Z break, the individual sloped-in-Z
40 nm facet patches were not visually separable; **native visual
acceptance remains incomplete**. Managed null-origin mode does not
establish Worker, History/Recovery, or synchronized Section/3D behavior.
This is not yet the author's fully modeled Q2 Josephson junction.


## Analytic fixed-angle visibility bound for oblique Direct sidewalls

The finite rectangular upper-aperture visibility problem is now solved by
intersecting linear half-planes in the native wall tangent/Z plane. This
produces an **exact convex illuminated polygon and physical area** (within
floating-point arithmetic), independent of the material-column partition.
The 2.5D material representation still approximates this polygon with
constant-Z XY strips; it is *not* an exact continuous oblique surface model.

A scientific-correctness failure in the earlier implementation was
identified: independently rounding each tangent slice inward to the 0.1 nm
persistence grid repeatedly removed an XY quantum at every boundary.
Very small slices could therefore produce **less**, rather than more,
visible material. The repair partitions a single **shared integer XY grid**
without seam gaps and counts all XY/Z rounding loss against the analytically
known illuminated area.

The solver now automatically refines the configured initial facet slice
(default 0.05 µm) until the **actual physical under-deposition** is no
more than \`facetMaxAreaLossFraction\` (default **2%**), subject to the
existing \`maxFacetSlices\` budget (default 256). If it cannot satisfy this
numerical science gate, the operation fails and existing Direct
transactional rollback applies. Neither the 0.1 nm physical persistence
quantum nor global geometrical tolerances are weakened.

**Measured rectangular science fixture**, 45° polar / 45° azimuth,
a 2 µm long, 1 µm tall wall through a single upper opening:

| Method | Area (µm²) | Underestimate |
| --- | ---: | ---: |
| Analytic half-plane polygon | 0.26134993 | 0% (reference) |
| 50 nm fixed slices, grid-aligned | 0.22945964 | 12.20% |
| Default adaptive 2% bound (121 patches) | 0.25719803 | 1.59% |
| Explicit 1% bound (255 patches) | 0.25933813 | 0.77% |

Tests independently sample 360,000 rays to check the analytic polygon,
check two successive aperture levels, XY seam ownership, rotation covariance,
realistic translated wafer coordinates, and intentionally failing numerical
budgets. The exact geometry source and tests have been byte-for-byte
verified against the remote Git blobs. Related local Process/geometry
storage regression: **19/19 passed** and pinned Prettier passed. See
\`facet-visibility-accuracy.json\` for values, commands and scope.

**Boundary:** This is still a restricted isolated rectangular wall with
rectangular apertures above the wall. Competing occluders, resist walls
touching the facet, arbitrary 3D facets, dynamic growth and original
Q2 junction manufacturing remain out of scope. The target branch does
not yet have a complete exact-HEAD local checkout/normal-origin Chromium
release acceptance for this change. Do not reuse a previous screenshot
as evidence that this new material geometry passed Section/3D review.
