# Paper figure evidence register — current acceptance (#299)

This is a machine-readable **scientific provenance and acceptance gate**, not a
second set of bundled-example source metadata. The authoritative file is
[`docs/evidence/LITERATURE_FIGURE_MATRIX_2026-10-16.json`](evidence/LITERATURE_FIGURE_MATRIX_2026-10-16.json).
Catalog ID, source URI and shipped project path must remain synchronized with
`site/bundled-examples.js`.

## Initial bounded findings

All eight families have existing real browser captures and saved-material
probes from PR #242. The metadata labels all entries
`open-paper-match`: this is deliberate. **Neither a passing screenshot job
nor matching film thickness certifies an original SEM panel**. A figure match
requires the exact device, scale calibration, XY cut, material stack,
comparison protocol and quantitative deviations; where the authors have not
published those inputs, the result remains a surrogate or blocked claim.

- Sahli Fig. 1/SI S2–S3: the real Si Z-plane is flat and the displayed
  pyramids are render-only. True facet-normal conformality belongs to #297.
- Basiri-Esfahani Fig. 2a: the caption shows a similar disk; our 36 µm
  eight-slice undercut remains an assumption. Continuous release work is #298.
- Lam: Fig. 1/2 own the physical structures and Fig. 3 is wafer-tier
  statistics. The local 91/100 nm ILD model is engineering geometry.
- PERC, MAGIC and TiO₂ use inferred masks. Do not label their placement as
  originating from original manufacturer GDS.
- Black-Si/Ge: the Ge two-branch thesis Fig. 15 is separate from the
  2025 research article in the catalog bibliography.

## Gate and ownership

`node --test site/tests/literature-provenance-matrix.test.mjs`

This tests catalog/source alignment and prevents accidental
`accepted-paper-match` status without a calibrated quantitative overlay.
#299 exclusively owns the register and its evidence links; it must not
modify physical geometry or numeric scientific tolerances. Future
acceptance requires original publication panel with DOI, journal rights
considerations, accurate dimensions, actual browser output and an
independent interpretation of any mismatch.

## Verified evidence bundle mapping

The register now enumerates the exact `figure-cut-manifest.json` and
captured PNG member names from real GitHub Actions archives:

- Microdisk, PERC, Tandem and Black-Si/Ge:
  [literature Section/Mask evidence run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38753459685/artifacts/11982606386).
- Three-tier JLFET:
  [Lam three-section evidence run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38867834831/artifacts/12031383878).
- M3D, MAGIC-1000 and TiO₂ metalens: **no recorded paper-matched
  Figure Cut** in this register; their other tests and browser acceptance
  are not substitutes.

These screenshots and saved point probes support software geometry
reconstruction. All source-paper quantitative overlay fields remain false
because no device-matched SEM calibration has been demonstrated.

## New targeted Chromium evidence cases (pending browser execution)

New browser cuts are now configured for the M3D vertical metal-via
junctions, the local MAGIC M4→M1 metal ladder and MoS₂/AlOx gate,
and the small Wang TiO₂ four-meta-atom process fixture. Material
ownership is probed against the real saved XY/Z stacks before capture.
These cases are not yet published screenshot evidence: the register
retains `captureEvidence: null` for all three until an actual browser
artifact is generated and independently inspected. The four-atom fixture
is a local proxy, not the 4,725-site optimized author lens/GDS.

## October 16 — three newly captured family-specific sections

The read-only Chromium run [38900945041](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38900945041)
produced [artifact 12045534988](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38900945041/artifacts/12045534988):
**six Section PNGs** plus Main/Mask/3D screenshots and one physical-probe
`figure-cut-manifest.json`, for M3D, MAGIC-1000 and TiO₂ metalens.
Every exact PNG member listed in the matrix has been confirmed in the
ZIP, and the Section images were visually inspected independently.
The M3D transfer, MAGIC interconnect and TiO₂ pillar scenes render, but
published paper figure calibration and original author mask geometry
are **still pending**. Chromium capture success is not an SEM match.
