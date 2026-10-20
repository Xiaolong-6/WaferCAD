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

## Native 3D continuous material display prototype (2026-10-19)

`site/continuous-etch-mesh.js` produces surface triangles from the
existing analytic material owner. It evaluates signed source-material
footprints and the exact XY-dependent release depth, then samples a
closed isosurface for each material. Triangle vertices, normals and
grid resolution are **derived display data**; the Model, History and
saved continuous front never contain a fixed 8/72-band approximation.

An explicit `vector-continuous-etch-v1` branch in native
`site/three-view.js` draws those surfaces with the existing material
presentation and Z display path; it does not use the pre-release
2.5D Renderer surface plan. Unsupported ROI clipping fails closed.
The mesh builder imposes voxel and triangle budgets, uses a material-
thickness-sensitive Z sampling interval, and adds a 0.0001 µm
**display-only** iso-offset to avoid singular tetrahedra on exact grid
vertices. This offset does not change stored geometry or science
tolerances.

Focused evidence on the existing verified `9c19c0d9` source bundle,
with branch-specific renderer code overlaid:

- Native headed Chromium + Xvfb + SwiftShader rendered the actual
  published Microdisk M07 predecessor and a 36 µm continuous circular
  Si release using the real `createThreeView()`. A low-angle view
  exposes the suspended disk, retained Si pedestal and open undercut.
- Microdisk display meshes for both Si and SiO2 had exactly two
  triangles sharing every tested edge (manifold watertight
  connectivity), with no nonfinite positions/normals.
- The 1.8 µm SiO2 surface interface and top stayed within
  0.1 µm of the source endpoints at this **display** resolution.
- Local scientific owner and mesh input remained unchanged.
- The local sampled 3D mesh generation took approximately three to
  four seconds on a software environment; its synchronous first
  build is **not yet an acceptable interactive latency contract**.
- `site/tests/continuous-etch-mesh.test.mjs`: 2/2 passed; the
  mesh module and test passed pinned Prettier 3.9.9 and ESLint 10.11.0
  targeted checks after restoring user-supplied offline dependencies.

**Acceptance limits:** The screenshot uses the repository's
`offline-native-app-capture.py` on a prior source-only Artifact plus
branch edits, under `about:blank` null-origin fallback. This is
actual production Three.js rendering of source-backed geometry, but
it does not prove the exact integrated branch HEAD, normal-origin
Workstation Open, multi-panel state, History/Recovery or renderer
interaction. Native 3D still needs ROI and selection clipping,
cancellation/background meshing for large examples, performance
budgets, visibility/presentation mode regression, GLB export
parity and ordinary browser acceptance. The current surface shows
visible tessellation/shading artifacts at the disk rim and substrate
side; visual release acceptance remains pending. Do not replace
the released 72-band Microdisk or merge on this evidence.

## Continuous Microdisk surface and default Z Break diagnostic (2026-10-20)

The original 4b389fe Microdisk M07 scientific source was used to distinguish
real remaining silicon from the dark 72-band visualization. In particular,
x=115 um along the diameter must retain a silicon top around **25.59 um**,
whereas x=60 um is around **4.35 um** and the center pedestal reaches 40 um.
Any renderer which removes the residual outer rise fails this physical
contract even if its output is visually smooth.

The generic default `resolveSectionCollapse(null, model, bounds)` enables
a Z Break which can map the entire curved release interval to essentially
one display height. Continuous material now suppresses this implicit default.
An explicit future continuous-owner Z Break opt-in must be marked
`continuousEtchExplicit: true`; ordinary 2.5D behavior is unchanged.

The opt-in native ThreeView display now has a safe two-part analytic path:

- Fully covered rectangular Si substrates with shallow **circular or
  elliptical** releases use `continuous-heightfield-mesh.js` for the
  physically sampled top, analytic planar bottom and shared exterior walls.
  Through-etch, vertical cliffs and unsupported topologies retain the generic
  implicit extractor; they are never silently passed to the smooth heightfield.
- Intact single-footprint films use `continuous-exact-film-mesh.js`, based on
  original Mask triangles and exact Z. A point-contact opening is split into
  edge-connected components without moving original vertices. The real M07
  SiO2 film yields **9 individually closed shells, 3404 triangles, 1.8 um**.
- Generic extraction skips layers already replaced, avoiding duplicate material
  and redundant volume sampling; it remains a fallback for other material forms.

The focused `continuous-hybrid-microdisk.test.mjs` guards six physical Si
height witnesses (including the outer rise), watertight edge ownership, all
nine oxide components, source immutability and unsupported vertical-profile
fallback. On the verified 4b389fe source overlay, 20 hybrid/extrusion tests
and 22 isotropic/Z-collapse tests passed. A headed Chromium/Xvfb/SwiftShader
native ThreeView diagnostic using the validated M07 predecessor showed the
outer rise, undercut and film with no recurring 72-band black ring and zero
page JavaScript errors. The diagnostic uses the documented `about:blank`
origin workaround; it is **not** a normal-origin Workstation transaction or
an exact branch-HEAD checkout acceptance.

Outstanding product gates remain intact: exact-HEAD Chromium acceptance,
regular Workstation Open/Save, History/Recovery, ROI and GLB export, general
follow-on Process consumption, targeted CI and release Quality. No tolerance
or baseline has been weakened; do not merge or replace the shipped Microdisk
on this evidence alone.

## Lossless Workspace material identity after polygon-dictionary expansion (2026-10-20)

The normal-origin Process -> History -> IndexedDB acceptance exposed a
serialization/validation mismatch in the dedicated continuous-material owner.
Workspace storage deduplicates physical polygons by replacing `region.geom` with
`geomRef`, then restores the exact geometry at the end of the region object.
This alters JavaScript property insertion order (for example `id, geom, stack`
becomes `id, stack, geom`), but not the physical polygon, layer or Z interval.
The previous `JSON.stringify()` equality rejected this legitimate lossless
round-trip as a changed material region.

The continuous owner now compares **all** source-model fields recursively by
exact keys and values, independent of object key insertion order. Ordered
arrays (region owners, polygon vertices and stacks) remain order-sensitive,
and scalar coordinates retain exact equality without tolerance, snapping,
reorientation or baseline changes. Unknown future material fields are still
compared and unauthorized field additions/deletions fail closed.

The focused regression packs a canonical continuous Base using the production
Workspace geometry dictionary, expands it, validates the entire project and
rejects a subsequent deliberate physical polygon-coordinate modification.
The corresponding real-Workstation CI must still prove completed Save,
IndexedDB readback, reload and History preservation before final acceptance.

## Continuous release rectangular ROI / Section alignment (2026-10-20)

The native `renderContinuousEtch` path previously threw on **any** Main ROI,
leaving the entire 3D view empty. Rectangle inspection now uses the exact
physical XY bounds of a single axis-aligned rectangular ROI. The first
implementation used GPU fragment-only clipping and left complete wafer meshes
behind the cut planes; the result could show detached/stray surface fragments
while passing the old cap-triangle-count smoke test. `continuous-etch-roi-mesh.js`
now crops derived 3D triangles explicitly against each of the four XY bounds
before they enter the GPU. The opened sides are filled by disposable cut-face
triangles generated from `continuousSectionContours()` and the same canonical
analytic material owner as ordinary Section. The saved Model, History and front
are not modified. The full display meshes are retained for fast ROI changes;
only presentation triangles/cut faces change, and a changed rectangle is reframed
without resetting the user's camera orientation on unrelated rerenders.

Continuous Section uses full physical Z by default, including when a generic
wafer Z Break was previously enabled. The current visible/color state comes
from the active Model rather than the immutable pre-release source. The ROI cut
faces and Section are sampled displays; neither creates stepped stored solid
geometry. Polygonal, circular, sector and multiply connected 3D ROI clipping
are not yet accepted. Those shapes must fail explicitly rather than showing
an incorrectly cropped scientific surface.

Scientific owners: `continuous-etch-roi.test.mjs`,
`continuous-etch-section.test.mjs`; actual native Chromium visual evidence is
produced by the existing `offline-native-app-capture.py` (with the true
`site/three-view.js` and `site/plan-renderers.js` rendering paths). The normal
Origin Workstation/History/Recovery gate must cover Main ROI creation, 3D cut
faces, Section Z and undo/redo/save, separately from isolated null-Origin
rendering diagnostics.

## Exact Continuous Etch Process Recipe replay (experimental)

Process Recipes normalize `profile: "continuous"`, including exact `shape`
(`circular`, `elliptical`, or `vertical`) and `lateral` micrometres alongside
`depth`. Circular release enforces equal lateral and vertical reach; Front/Back
only and an explicit target material are required. `Run All` passes the same
canonical physical inputs to the Process Worker as manual Apply. Preflight
rejects unsupported later material-changing Steps rather than silently using
old isotropic Z bands. `record`/`snapshot` annotations may follow the release.
The dedicated normal-Origin Workstation check must demonstrate Recipe Run All
material/front parity with manual Apply, plus History and Recovery.

## ROI closure follows the actual native display mesh (2026-10-20)

The first rectangular-ROI implementation clipped each 3D triangle but built
four separate Section-sampled cut faces. Even when both visualizations queried
the same exact analytical material, their **sampled boundary vertices did not
match**, leaving open edges and detached slivers. A passing Renderer-ready flag
and positive cut-face triangle count did not detect the problem.

`continuous-etch-roi-mesh-cap.js` constructs caps from the **open boundary edges
of the already-cropped Three.js display triangles**. It closes each clipped
layer-shell along each ROI plane and reuses the exact existing boundary
vertices, including the corners shared by neighboring planes. Face normals
and triangle winding are consistently outward. It does not resample the
scientific owner, write any polygon to History, or change the Section sampler.

Scientific regression `continuous-etch-roi-mesh-cap.test.mjs` counts all
undirected and directed triangle edges. It requires **zero open edges, zero
nonmanifold edges and zero inconsistent-winding edges**, separately for the
20 µm Base and every intersecting material shell of the actual Microdisk M07
under both centered and off-center rectangular ROI bounds. The initial
20 µm diagnostic had 128 open clipped edges and 276 after the independent
Section caps; the mesh-derived cap closes all 128. The tests use 0.1 nm
Float32 display-vertex grouping, not a relaxed physical-material tolerance.

The visual evidence must additionally include a maximized native WebGL view:
`continuous-roi-three-maximized.png` in the existing real-Origin
Workstation CI artifact. Geometry closure alone does not prove usable lighting,
camera framing, correct material colors, or a successful Recipe Run All.
