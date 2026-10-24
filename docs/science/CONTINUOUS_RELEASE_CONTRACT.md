# Continuous selective release — bounded canonical material contract

**Status (2026-10-24): experimental operation available in the
Process Guide and published Continuous Microdisk project.**
This is a mathematical material-geometry feature, **not** a model of
XeF₂ chemical kinetics or experimentally calibrated undercut.
Existing 2.5D banded etches are preserved independently.

## Process input and physical seed

The exact Continuous Etch path is
`site/continuous-etch-process.js`. It requires a canonical,
non-array `vector-2.5d-v1` predecessor, a single **physically
exposed target material**, Front or Back, a valid nonempty mask
footprint and positive lengths in µm. Appearance-only Rough/Pyramid
surfaces cannot seed it. The physical seed is derived from
`exposedSurfaceGroups()`, not from display triangles or an
unverified ROI proxy. A mismatch or no exposed target fails closed.

`site/continuous-etch-geometry.js` owns a front with
`seedGeom`, `seedZ`, `face`, `layerId`, lateral reach `L`,
vertical reach `D` and `shape`. For an XY point at distance
`d` from the exposed seed, the curved profile is:

```text
depth(d) = D * sqrt(max(0, 1 - (d / L)^2)),  0 <= d < L
depth(d) = D,                                inside the exposed seed
depth(d) = 0,                                outside its lateral reach
```

`circular` requires `L = D`; `elliptical` permits unequal
`L` and `D`; `vertical` uses the supported rectangular/vertical
front. Coordinate direction follows the active Front/Back face.
This analytic equation describes an ideal front, not transport,
etch-rate history, stiction or chemistry. The seed Mask boundary
remains polygonal; mathematical continuity does not magically
reconstruct unpublished source-mask curves.

## Saved material identity and replay limits

The result is a `vector-continuous-etch-v1` model with a
serialized, single-release `continuous-material-owner`. Its
original 2.5D predecessor, physical layer IDs and saved source
geometry are protected against extra mutations. Lossless
serialization/validation, History/Recovery restore and exact
material identity must agree; the result must not become a stack of
8 or 72 visual Z bands during round trips. Exact material revisions
and owner identity prevent stale geometry from being reused
after History navigation.

Only **one Continuous release per process lineage** is supported
by the current special model. Additional physical Process steps,
including new Deposit/Etch on its exact released solid, do **not**
silently fall back to legacy 2.5D geometry: unsupported follow-on
operations fail with an actionable error. A clean alternative is
**Rebuild Base** or an explicitly preserved predecessor Variant.
Normal legacy banded Isotropic/Undercut projects keep their replay
behavior unchanged. Array topology, unsupported rough/physical-facet
owners and nonrectangular 3D ROI are outside the available Continuous
envelope; a rejected operation cannot be presented as successful.

## Section, 3D and exports

Section queries true surviving material at physical coordinates.
Native 3D uses a dedicated continuous material view/mesh; the
bounded off-thread heightfield optimization may accelerate its
**display**, never replace its analytic material owner. A 3D
preview or tessellated display mesh is not an independent etch
calculation. Section/3D and cut electrical/implant annotations
must clip to the **remaining material**, including undercut voids.
Unsupported annotation or ROI modes fail closed.

3D PNG is a WYSIWYG visual capture only after an exact painted
frame. Physical GLB and geometric checks must not derive their
answer from a display-only proxy. Check 3D ROI, Section A–B,
Z-scale and exposed side before comparing surfaces; Z display
scaling never changes `L` or `D`. See
[Renderer contract](../renderer/RENDERER_CONTRACT.md).

## Bundled Microdisk and paper evidence

The current shipped full project is
`site/examples/suspended-silica-microdisks-continuous.wafercad`.
Its M08 uses circular Continuous release through the inverted
original mask; M09 is a record-only process entry. The reported
silica dimensions (outer radius 148 µm, inner radius 82 µm,
approximately 1.8 µm oxide) are separate from WaferCAD's
**assumed 36 µm lateral/vertical reach**. The cited
Basiri-Esfahani Fig. 2a depicts a *similar* disk.
Neither the 72-band historical Chromium capture nor the current
3D thumbnail proves the new device's original SEM correspondence.
The bundled interactive preview may retain an intentionally
smaller historical model, distinct from the complete project.
See the [nine-example provenance register](../evidence/SCIENCE_FIGURE_EVIDENCE_2026-10-16.md).

## Acceptance and historical research

Required owners include
`site/tests/continuous-etch-*.test.mjs` and
`scripts/v2/check-continuous-etch-workstation.mjs`, plus
`scripts/v2/check-published-continuous-microdisk-workstation.mjs`
for actual saved-asset, normal-Origin/Worker, History and UI
behavior. Failed or skipped normal-Origin tests are not made green
by a null-Origin native Three.js diagnostic or isolated math tests.
Do not claim chemical accuracy, mechanical stability or paper
image fidelity without external calibration.

The [2026-10-16 isotropic oracle and development record](ISOTROPIC_RELEASE_ORACLE_2026-10-16.md)
preserves the earlier eight-band mathematics, adaptive 72-band
experiments, bounded convergence and dated M07 evidence.
Historical measurements remain correct for their original source
SHAs, not as current production acceptance.
