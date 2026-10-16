# Microdisk isotropic release — pure mathematical oracle (#298)

The final #242 Microdisk remains an eight-slice selective Si release from a
paper-derived 148/82 µm SiO₂ mask. Source-independent calculations already
verify the 1.8 µm oxide and ~230 ng oxide mass; the **36 µm release radius is an
engineering assumption**. The published Fig. 2a SEM is of a _similar_ disk.

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

The shipped Kernel currently uses eight **uniform Z-depth bands** and chooses
a lateral footprint at each band's midpoint. This differs from a uniform
radial-distance staircase. The separate
`uniformDepthMidpointLateralErrorBound` gives the maximum local lateral
error of this single-seed midpoint approximation: for 36 µm and 8 depth
bands, it is approximately **12.53 µm**. The 17.43 µm bound from uniform
radial partitioning must not be attributed to the production algorithm.
Neither value measures actual XeF₂ release accuracy or interface topology
near multiple etch seeds.

## Kernel integration gates (not yet done)

1. Derive real exposed seed geometry from topology and material selectivity,
   respecting air voids, non-target masks and multiple exposed seed islands.
2. Select an adaptive XY/Z partition rule from a **predeclared** error budget;
   quantify monotonicity, symmetry, remaining material volume and
   convergence independently of the displayed view.
3. Save a new _opt-in_ project state; old eight-step models and History must
   remain exactly restorable and not be silently regenerated.
4. Inspect real Chromium sections with multiple radial cuts; compare to
   Basiri-Esfahani 2019 SEM only at supported scale/device provenance.
5. Targeted scientific and recovery tests, then final Quality and necessary
   figure/browser validation. No renderer baseline changes to hide stair
   artifacts.

Targeted test: `node --test site/tests/isotropic-release-oracle.test.mjs`.

## Adaptive reference geometry (not production Kernel)

A new opt-in _pure_ depth-band generator partitions **lateral footprint
radii** evenly and maps those endpoints through the continuous
`z(L)=sqrt(r²-L²)` profile. Its variable-depth bands are guaranteed to
have at most the requested lateral footprint error when the midpoint
radius is used. At 36 µm radius, the mathematical target 0.5 µm
requires 36 bands, compared to the current fixed **eight** uniform
Z-depth bands (whose conservative lateral bound is 12.53 µm).
The guarantee is geometric and applies to one seed front only.

`adaptiveReleaseDepthBands({ radius, maxLateralErrorUm, maxBands })`
rejects nonpositive/infinite tolerances, exceeded work budgets and
numerically degenerate band partitions. The current Kernel's material
selectivity, XY Boolean clip, runtime cost, save/replay and radial SEM
correspondence are intentionally unchanged and remain integration gates.
