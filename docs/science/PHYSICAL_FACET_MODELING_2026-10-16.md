# Physical facet modeling — experimental mathematical contract (#297)

This module is **an isolated analytic oracle**, not a Process Kernel feature or a
new project schema. Existing `geometryMode: ideal` rough/pyramid appearance,
old `.wafercad` projects and current Sahli example remain unchanged.

## Representation gate

The current canonical region-stack owner stores polygonal XY material
footprints and constant Z intervals. A rendered heightfield does **not** make
its film boundaries physical. The proposed opt-in canonical extension must
represent a deterministic piecewise-planar `z(x,y)` for every material
interface; Section, 3D, Save/History and all process operations must consume
the **same owner**. Mixing physical and appearance-only geometry without an
explicit conversion is invalid.

The oracle `site/physical-facet-math.js` returns an analytically periodic
four-facet square-pyramid surface, gradients and outward face normal for
non-crease samples. An apex, diagonal crease, boundary or mask discontinuity
requires topology-aware geometry; the oracle refuses to invent a unique normal
at the apex/crease. `facetNormalFilmVerticalSeparation` is valid only for a
**single infinite planar face** at fixed XY: it is _not_ a Boolean coating
operator across apexes, valleys, steps or mask boundaries.

A complete opt-in Kernel design must resolve:

1. Region/triangle XY ownership and deterministic interface IDs, including
   neighboring tile seams and shared front/back normal orientation.
2. Offset surface intersections and multi-material contact at convex ridges,
   concave valleys and true voids; no negative Z thickness, gaps or overlaps.
3. Compatibility policy for directional/isotropic Etch, CMP, Implant,
   GDS masks, arrays and units: either physical geometry calculation or
   fail closed with a specific unsupported-operation message.
4. Non-lossy persistence, versioned opt-in migration, History, Recovery and
   Rollback with old format bit-for-bit semantic equivalence.
5. Exact scientific comparison of actual canonical ridge/valley Section and
   real browser 3D to Sahli Fig. 1 / Supplementary S2–S3. Existing 3D
   render-only roughness and PR #250 may not be independently modified.

## Verification

Targeted pure-oracle check: `node --test site/tests/physical-facet-math.test.mjs`.

This tests analytic height, symmetry, gradients, normal-thickness relation,
relief volume and fail-closed undefined normals. It **does not certify**
physical deposition, material ownership, Snapshot replay or original paper
SEM correspondence. These remain explicit subsequent gates; no relaxation
of scientific tolerances or legacy baseline regeneration is permitted.

## Canonical point ownership (experimental Model only)

The new experimental `samplePhysicalPyramidSlab` evaluates _both_
front and back interfaces using the same deterministic relief lattice.
At a selected XY point it returns a unique physical Si interval
`[z0,z1]`, two corresponding surface descriptors and a true local
thickness. There is no dependence on 3D renderer colors or LOD.

For a symmetric height `h = 4.5 µm`, front/back valley planes at
`±125.5 µm` and pitch `6.4 µm`, local material thickness ranges
from **251 µm at valley** to **260 µm at apex**. Integral relief
volume yields an **average physical thickness of 254 µm**. This
is different from the existing flat **251 µm** region-stack slab:
one must not silently substitute the renderer's pyramids while
retaining the old volume, or declare mass conservation passed.

This deterministic oracle is now attached to one explicit experimental
Base-only Model, with versioned physical ownership and native Section
and ThreeView consumers. It does **not** yet resolve arbitrary mask
boundaries, real facet-normal coatings at creases, or production Process
operations. The wafer-thickness/etch-depth interpretation still needs
source-paper justification. The bundled Sahli project remains intact.

## Versioned experimental physical material ownership

New `site/physical-facet-owner.js` exports a JSON-safe, opt-in
`wafercad-physical-pyramid-slab-v1` descriptor. It owns one material,
a rectangular integer-cell XY domain and two analytic physical interfaces.
Point probes distinguish solid interiors, exact interfaces and voids.
Volume is integrated from canonical analytic boundaries, not the 3D display.

This explicit owner is part of a restricted experimental Model Kernel.
The planar `region.stack` remains only a checked compatibility reference;
physical interfaces and volume come from the owner. Compact and workspace
storage preserve this descriptor with Snapshot/History state. Ordinary
Process operations fail closed, and production Workstation file import
is disabled. Arbitrary masks, multi-owner intersections and facet-normal
conformal offsets remain unsupported.

## One-owner physical 3D/Section geometry (experimental only)

`site/physical-facet-surface.js` now triangulates this same opt-in
material owner into a **closed 3D physical Si solid**, including exterior
sidewalls, and finds exact Section breakpoints by intersecting the A–B cut
with those triangle edges. It uses the analytic front/back `z(x,y)`
interfaces rather than colors, Roughness metadata or a second heightfield.
The mesh handles rectangular domains clipped across pyramid cells, but is
explicitly limited to 256 cells by default (hard maximum 4096). Wider
areas fail closed rather than silently switching to LOD geometry.

The mesh's signed enclosed volume equals the owner's analytic volume.
Adjacent top/bottom/side triangles must form paired edges, with no
internal void walls. Section corners and straight segments must evaluate
to the identical analytic owner interfaces at every tested midpoint.
A JSON-round-tripped owner must generate the same Section and 3D geometry.
These are scientifically verifiable structural invariants, not browser
acceptance or SEM overlays.

Targeted scientific command:

`node --test site/tests/physical-facet-math.test.mjs site/tests/physical-facet-owner.test.mjs site/tests/physical-facet-surface.test.mjs`

**Not yet complete:** The experimental `model-view-geometry` Section
contour and production `createThreeView` have opt-in physical consumers,
validated using a real browser preview. The bundled Sahli Example and
ordinary Workstation Process, Section auxiliary slices and file import
still do not support this Model. Full native Recovery rollback,
facet-normal multilayer coating and original-paper figure calibration
remain blocked. Old `.wafercad` projects must not be silently upgraded.

## Explicit opt-in persistence staging (not production UI)

`site/physical-facet-model.js` now validates a new optional
`model.experimentalPhysicalFacetOwner` descriptor against a single
rectangular Base region and its reference planar Z bounds. Only the
one-material geometry is supported. The experimental model has a separate
`vector-physical-facet-experimental-v1` Kernel ID, so older clients
reject its unfamiliar physical representation instead of silently
drawing a flat legacy stack. The front/back pyramid `z(x,y)`
remains the scientific truth for this experimental owner; the flat
`region.stack` is a constrained compatibility reference and **not**
permission for the legacy renderer to display a physical facet.

Project storage preserves the descriptor with the saved model asset in
Snapshot / History records, and opt-in tests verify the analytic Section
survives packed and lossless round trips. Unimplemented Process
mutations return an explicit failure without changing the model.
The native `sectionContours` geometry API now emits the real polygon
defined by the owner's face-intersection breakpoints. This is an
incremental **Section geometry consumer**, not yet an enabled
Workstation view. Other constant-Z Section slices reject the physical
owner, preventing a misleading flat fallback. Production ThreeView now
has an isolated opt-in path that renders the same owner as actual front,
back and outer-wall triangles. Its three camera views and exact Section
were captured in real Chromium. Workstation file import deliberately
remains blocked until the rest of the application's view and transaction
contracts can safely consume this model.

This is an intermediate **storage and transaction safety contract**.
The actual Snapshot Manager has now restored two distinct physical
pyramid phases and preserved their exact Section geometry after export
and reimport. This is not complete Workstation Recovery or end-to-end
file-open certification. The isolated Chromium inspection uses the
production ThreeView renderer, without activating an imported project
or editing any user data. No default project has this field; old
`.wafercad` files are not upgraded. Next gate: native Workstation
read-only opening, Section/3D display, and full Recovery rollback before
enabling any physical Process operations.

## Fault-injected Recovery transaction contracts (2026-10-17)

`site/tests/physical-facet-recovery.test.mjs` exercises the real
`createWorkspacePersistenceController().restoreSelectedRecovery()`
transaction using an explicit storage fault adapter. An injected
`QuotaExceededError` during the recovered-project commit restores the
original faceted Model, Snapshot records and active History branch graph,
including the exact Section profile. If the same commit fails and the
volatile rollback also throws, the controller locks all further Save,
Recovery and checkpoint actions until reload; it cannot commit the
untrusted in-memory geometry. This supplements the earlier physical
Snapshot Manager export/reopen tests.

The fault adapter replaces the storage operations at the controller
boundary in Node. These tests do **not** establish a real IndexedDB
abort or browser-level Recovery interaction, which remain separate
acceptance gates. The production default uses the unchanged persistence
functions. Old `.wafercad` schemas and scientific tolerances are
unchanged. The new Main canvas-grid and palette refinements were also
merged into this feature branch without overriding the physical Section
guard.

## Single-facet local conformal material patch (experimental, 2026-10-17)

A new pure-science construction `physicalFacetNormalCoatingPatch(owner, options)`
builds **one real closed coating solid**, strictly within an open planar
facet of an existing physical pyramid. It uses outward unit normals on
both Front and Back, and moves the entire triangle by the specified
normal distance (not by fixed vertical Z). The resulting six-vertex
triangular prism has eight consistently wound boundary triangles.

For a triangular XY area `Axy`, surface slope `g` and normal thickness
`t`, its exact physical film volume is
`Axy * sqrt(1 + |g|²) * t`. The interface distance from source to
coating outer surface equals `t`, with a larger fixed-XY vertical
separation `t * sqrt(1 + |g|²)` on sloping facets. A signed closed-mesh
volume check and front/back material-section checks enforce this
contract. Invalid thickness/material identities, inverted triangles,
ridge/apex crossings, inter-cell transitions and offsets that leave
the source facet are rejected.

**Crucial limit:** the prism's cut edges are intentionally _artificial_
patch boundaries. This is **not** a continuous coating around pyramid
ridges, valleys or corners; its normal thickness is only established on
one planar facet interior. It is **not** registered as a project layer,
a Process operation, a Section material owner or a production 3D overlay.
There is no claim of physically correct multi-facet conformal coverage,
and Main/Mask/production Process remain unavailable for the experimental
physical Kernel. Next scientific gate is a topologically complete film
join at convex and concave creases, with non-overlapping material
ownership, exact cross-section and volume contracts, and genuine
browser 3D/Section visual inspection before activating the film in the
Model.

## Axial convex and concave coating joins (experimental, 2026-10-17)

The `physicalAxialFacetCoatingSection()` scientific oracle constructs
an **exact 2D exterior film profile** on a pyramid-row XZ Section using
the same physical Si triangle owner as the real Renderer and Section.
This restricted Section follows a pyramid centerline, so the true
three-dimensional facet normals lie in its XZ plane.

A convex Si apex is connected by a **circular radius-t arc** centered
on the true substrate ridge vertex, not a sharp artificial miter. A
concave Si valley uses the intersection of adjacent normal-offset
facet lines; the foot of each perpendicular must remain on its
original physical facet. The resulting Section ring is a distinct
material cross-section, with its true area calculated from the faceted
polygon plus exact circular-sector/chord corrections. At every
offset sample, the distance to **all** original Si facets is checked
to reject neighboring-facet overlap. Invalid axial orientation,
off-center diagonal cuts, negative normal thickness, unsupported
coatings at or above half the lateral pitch, and oversized intersections
fail closed. The half-pitch restriction is an explicit conservative
applicability bound for a local Section, not an asserted physics limit.

This is not a 3D coating volume or a canonical material owner.
It does not yet solve the spherical apex and three-dimensional ridge,
valley and face-junction patches away from the 1D Section centerline,
nor mask discontinuities or film self-contact across the full wafer.
Therefore the existing experimental Si-only Workstation preview
remains unchanged, and no Process or material-layer activation occurs.
Before integration: prove full 3D watertight film interfaces,
non-overlapping material ownership and exact Section/volume
agreements, then inspect real Chromium frames and source-paper SEM.

## Full unit exact implicit 3D silicon/oxide material ownership (2026-10-17)

The experimental `physical-facet-shell-owner.js` defines the entire
finite-volume coating by its **3D Euclidean distance to the actual
closed Si triangle mesh**. Each 3D point has mutually exclusive
material ownership: Si inside the physical solid, oxide outside Si
within normal distance `t` of any silicon boundary triangle, and
void elsewhere. The nearest-point solver includes triangle interiors,
edges and corners; convex ridges, concave valleys, 3D four-facet
apexes and domain sidewalls use the _same_ geometry, not stitched
independent appearance patches. The front and back film/void
interfaces are computed by bounded root finding against this complete
3D material query. The experimental descriptor is JSON-safe and
persists across .wafercad, Workspace and History with owner identity
validation.

**Critical acceptance distinction:** the full **implicit material
occupancy rule** is complete for the closed finite Si test specimen,
but a watertight **coating triangle mesh has NOT been extracted**.
The production 3D and Section renderers explicitly reject coated
experimental models rather than showing an uncoated Si surrogate.
The normal production project importer and Process remain unavailable.
A conservative `t < pitch/4` guard is a lab applicability bound, not a
physical thickness law. A 3D surface-mesh extraction, signed shell
volume invariants, interactive Chromium 3D/Section coated-specimen
inspection and original Sahli SEM correspondence remain acceptance
requirements before production activation or 64×64 scaling.
