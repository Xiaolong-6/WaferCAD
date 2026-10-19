# Microdisk isotropic release — pure mathematical oracle (#298)

> **Current status (October 2026):** The bounded Process oracle is opt-in. Draft [PR #332](https://github.com/Xiaolong-6/WaferCAD/pull/332) keeps the separately saved adaptive project, generator, science tests and Chromium evidence in [site/experimental/microdisk](../../site/experimental/README.md). Default Microdisk, snapshots and legacy 8-band replay do not change. The original Fig. 2a SEM depicts a similar sample and the assumed 36 µm radius remains unverified.

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

## Exposed-seed operation-plan boundary (not enabled in Process)

`planSelectiveIsotropicRelease` now accepts an explicitly exposed
material seed (`layerId`, `seedZ`, `face`) from a future material-topology
owner. It refuses unsupported target materials and hidden seeds, then emits
a deterministic set of Front/Back physical removal Z intervals and the
corresponding lateral geometry extent for every adaptive depth band.
It enforces an independent maximum-work budget (128 depth bands by default).

This JSON-like band plan is compatible with the existing concept of
`applyIsotropicEtch` seed groups and `removeLayerInterval`, but does not
modify a model. Most importantly, it does **not** implement
`difference/union/intersection` for the released XY footprint, reject
colliding undercuts between seed islands, or turn this into a selectable
new Recipe command. Every required production integration remains gated by
targeted scientific topology, History/Recovery, and Chromium visual tests.

## Canonical exposed-material seed ownership (combined #298/#299)

`planTopologySelectiveIsotropicRelease()` now derives its seed patches from
the existing production `exposedSurfaceGroups(model, {face, clip})`
topology, rather than accepting a caller-provided `isExposed: true`.
The source geometry is the actual exposed material footprint intersected
with the requested physical mask. The planner rejects buried target
layers, unknown layer IDs, unsupported arrays/physical-facet owners,
invalid faces and unsuitable appearance-only Rough surfaces. Returned
Front/Back Z bands still derive from the **same pure analytic oracle**;
their source footprints retain Polygon/MultiPolygon holes and islands.

This is a read-only canonical-topology adapter, **not** a new etch
operation. It does not replace `applyIsotropicEtch()`, solve the
exposed-seed dilation Boolean, or mutate old Microdisk snapshots. These
remain hard preconditions before a new opt-in replay or any source
figure claim. The targeted tests explicitly verify a buried Base
blocked by front oxide, backside Base visibility, real XY mask clipping,
invalid selectivity and byte-identical original Model state.

## Opt-in adaptive kernel execution (experimental; no Recipe migration)

The canonical `applyOperation(model, { type:'etch',
etchProfile:'isotropic', isotropicLateralErrorUm: 0.5, ... })`
now accepts a **deliberate opt-in** per-operation request. It invokes
the independent `adaptiveReleaseDepthBands` oracle and executes
material-selective XY removal using the actual `exposedSurfaceGroups`,
`conformalBoundaryBands`, `splitByArea`, and canonical ownership
partition exactly as the existing Kernel does. The planner rejects
invalid accuracy, band-budget overflow and unsupported array Models
before accepting a partial result; all geometry failures roll the
entire Model back through `applyOperation()`.

If the optional accuracy field is absent, the exact existing
**eight equal-depth slices** remain unchanged, including all old
Recipe/History states. This is **not** yet the shipped Workstation UI
mode or a new automatically migrated Microdisk project. The analytic
0.5 µm bound applies to the requested **single-seed lateral band
radius**, and does not prove that polygon-buffer chord error,
multi-seed collisions, source-paper XeF2 chemistry or total final
Si shape is within 0.5 µm. Those independent topology, Section,
volume and real-browser acceptance checks remain required before
promotion to normal Process.

## Exact continuous geometry foundation (2026-10-19, development branch)

The opt-in `site/continuous-etch-geometry.js` defines an **analytic** selective
release front. The original material/XY footprint and its target layer are
queried at each physical position, without storing 8, 72 or any other number
of Z bands. For distance `d` outside the real exposed seed polygon,
independent lateral reach `L` and vertical depth `D` give
`depth(d) = D * sqrt(max(0, 1 - (d/L)^2))` for `0 <= d < L`.
Inside the exposed seed polygon the depth is `D`. Circular requires `L = D`;
elliptical permits independent values. The vertical option has a rectangular
front. These are **geometric** parameterizations, not a calibrated XeF2
reaction-rate model. The original mask boundary is still polygonal.

The read-only `site/continuous-etch-topology.js` adapter derives fronts only
from physically exposed patches returned by the **existing production
`exposedSurfaceGroups()`**, filters by actual target layer and mask ROI,
rejects unsupported array/rough owners, and requires exact model-revision
parity for material queries. Section curves may be sampled at an arbitrary
display resolution; those samples never become canonical material geometry.

**Integration is partial.** Legacy `model.js` still performs 8-band or
adaptive-band isotropic Process for existing projects. New continuous models
are opt-in and remain isolated until native Section/3D and follow-on Process
can consume their true canonical material occupancy. Existing Microdisk and
all legacy History states remain unchanged.

The additional `site/continuous-material-owner.js` is a **separate,
losslessly JSON-serializable scientific owner**. It deep-clones the original
release-predecessor Model and the precise operation parameters; restoration
recomputes exposed seed surfaces from the stored source Model and rejects a
mismatched analytical front. The validated owner is recursively immutable
to avoid post-validation state mutation. Its physical XY queries return
remaining material **Z intervals**, subtracting unions of curved release
volumes and preserving non-target layers. Read-only Section point samples
query the same exact material intervals regardless of display resolution.

## Opt-in native model envelope and fail-closed storage gate (2026-10-19)

`site/continuous-etch-model.js` now attaches one analytic release to a
dedicated `vector-continuous-etch-v1` model. The original 2.5D regions are
retained only as the release predecessor; they are **not** the post-etch
material. The owner's analytical front, source Model and operation form a
versioned immutable reference. Validation checks exposed seed geometry,
selectivity, all original material fields, exact source/release revision and
canonical model-kind parity. Importing a modified front or replacing the source
model without rebuilding the continuous operation is rejected.

`site/project-schema.js` recognizes this model kind. The lossless
`.wafercad` codec preserves its exact source+front geometry and can restore
it with an **explicit read-only opt-in**. Normal Workstation Open rejects
the experimental continuous model before display, avoiding stale flat
geometry. `visibleMaterialModel()` and ThreeView refuse to use the
unetched reference for native rendering; follow-on Process rejects mutation.
A saved Microdisk M07 single-release model passes lossless read/write and
physical pedestal/undercut/SiO2 material queries. This is a limited persistence
and scientific-ownership contract, **not** general project UI readiness.

Do not treat a successful scientific Section column query as an accepted native
Section/3D visualization. Remaining gates: physically correct continuous
Section contours, watertight multi-material 3D mesh, Mask/ROI/GLB semantics,
sequential Conformal and Etch, array topology, History/Recovery transactions,
normal-origin real Chromium and full release Quality. Isolated GPU-null-origin
capture cannot establish these.

Focused source-overlay verification on the `9c19c0d9` source-only Artifact
plus continuous-etch branch files:

- 93/93 targeted Node tests: project files, existing selective isotropic
  science/topology, continuous material owner, Microdisk M07 and project codec.
- ESLint 10.11.0 and Prettier 3.9.9 targeted checks passed.
- Headed Chromium 144 / SwiftShader / pinned Three.js 0.179.1 isolated
  native 3D baseline captured successfully, with zero page errors.
- **Exact GitHub branch-HEAD reconstruction and native continuous front
  visualization are not yet verified.** Old-source overlay tests are not
  release acceptance and cannot prove current integrated HEAD.

No scientific tolerance was relaxed. No approved visual baseline was replaced.
