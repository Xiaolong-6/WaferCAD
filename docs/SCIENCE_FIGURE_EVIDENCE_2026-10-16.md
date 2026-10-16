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
