# Microdisk isotropic release — pure mathematical oracle (#298)

The final #242 Microdisk remains an eight-slice selective Si release from a
paper-derived 148/82 µm SiO₂ mask. Source-independent calculations already
verify the 1.8 µm oxide and ~230 ng oxide mass; the **36 µm release radius is an
engineering assumption**. The published Fig. 2a SEM is of a *similar* disk.

This branch introduces `site/isotropic-release-oracle.js` as a deterministic
**continuous Euclidean reference** for a single physical release seed plane.
It is intentionally isolated from `site/model.js` and project persistence.
For lateral seed distance d and release radius r, the geometric front depth
is `sqrt(max(0, r² - d²))`; front/back mirror about the seed Z plane.

An N-slice constant radial approximation has a conservative maximum
vertical range over a cell `sqrt((r/N)*(2r-r/N))`. The pure oracle and its
convergence bound are **not** chemical XeF₂ calibration, a live-vs-saved
Replay gate, or automatic proof that real samples have smooth spherical
etch fronts.

## Kernel integration gates (not yet done)

1. Derive real exposed seed geometry from topology and material selectivity,
   respecting air voids, non-target masks and multiple exposed seed islands.
2. Select an adaptive XY/Z partition rule from a **predeclared** error budget;
   quantify monotonicity, symmetry, remaining material volume and
   convergence independently of the displayed view.
3. Save a new *opt-in* project state; old eight-step models and History must
   remain exactly restorable and not be silently regenerated.
4. Inspect real Chromium sections with multiple radial cuts; compare to
   Basiri-Esfahani 2019 SEM only at supported scale/device provenance.
5. Targeted scientific and recovery tests, then final Quality and necessary
   figure/browser validation. No renderer baseline changes to hide stair
   artifacts.

Targeted test: `node --test site/tests/isotropic-release-oracle.test.mjs`.
