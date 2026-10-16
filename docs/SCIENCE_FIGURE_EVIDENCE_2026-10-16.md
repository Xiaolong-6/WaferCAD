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

## Acceptance escalation: independently reproducible paper match

The `accepted-paper-match` state is deliberately unused for all eight
families. The fail-closed metadata contract requires, _before_ this status
can be assigned:

- A specific original **paper panel** identified in the source citation,
  a published source-panel URL, a real Chromium comparison artifact URL
  and a named JSON measurement-report member in that artifact.
- The exact physical A–B cut in µm, a positive µm/pixel registration scale,
  and at least **three** identified correspondence features.
- Explicit measured registration and physical-shape mismatch errors, each
  bounded by its own **predeclared** positive acceptance limit.
- An actual overlay using the original paper panel. An assumed mask, an
  unreported material structure or a display-only roughness surface may
  never be labeled accepted.

`node --test site/tests/literature-provenance-matrix.test.mjs` includes
synthetic positive/negative _schema_ fixtures to test these requirements.
Those synthetic fixtures provide **zero evidence** of actual image
correspondence. The scientific reviewer still must independently verify the
paper image, calibration, saved material owner, exact cut and numerical
comparison. No new geometric tolerance was approved by this metadata update.

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

## Section-alignment audit — off-section controls

Independent XY-to-A–B line measurements on captured artifact
[12045534988](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38900945041/artifacts/12045534988)
found **7 on-section probes and 3 off-section XY controls**:
M3D second power via (10.6 µm away), MAGIC second interconnect control
(8 µm away), and TiO₂ substrate control (1.1 µm away). These controls
are still valid saved-material checks; **they cannot be cited as pixel
evidence in those rendered A–B sections**. All **7 on-section probes**
now have independent recorded XY samples and actual A–B endpoints; the
metadata regression verifies both perpendicular distance and the finite
segment projection, rejecting material points on the extension beyond A or B.
The regression also recomputes each off-section control's distance.
A matching Section for M3D's second power via remains a
visual-acceptance follow-up.

## October 16 — native v2 M3D power-via cut audit

A new true **native-v2** Chromium Section acceptance uses two temporary
source-project copies with presentation-only A–B cuts; it never modifies
the M3D physical material model or the bundled project. The exact browser
[run 38953627619](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38953627619)
produced [artifact 12070530260](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38953627619/artifacts/12070530260):
two Section PNGs and the complete Z-slice manifest.

- First cut A=(12, −5.3), B=(20, −5.3) µm; sample (16, −5.3) µm.
- Second cut A=(12, +5.3), B=(20, +5.3) µm; sample (16, +5.3) µm.
- Both cut locations contain the same eight recorded material intervals,
  including Ti power via 120 nm, Ni 28 nm and Au 30 nm.
- **The two screenshot files are byte-for-byte identical**, SHA-256
  `4b2dfbfa32f4c66bd1064699f29a8ce8d9a3dec38940cc5ba2d8acf9c106d412`.
  Both renders are visible and nonempty. This is a scientific observation;
  it cannot establish whether the original author manufactured identical
  vias or whether the reconstructed mask/metal placement is insufficient.
- This native screenshot now places the *second* power-via material probe
  on its own displayed Section, resolving the old off-section placement.
  The older Fig. 3 figure-cut evidence retains its original off-section
  classification; it has not been silently rewritten.

**Status stays `open-paper-match`.** Before acceptance, compare an exact
source-paper panel and distinguish the claimed Ni/Au interface geometries
with independently grounded authors' SEM, dimensions or mask provenance.
If the paper lacks distinguishing geometry, record `unreported` rather
than inventing a device-specific difference. The screenshots do not prove
a published SEM silhouette match.
