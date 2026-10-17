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

## Canonical point-ownership prototype (not active Model)

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

The prototype is a deterministic source for future XY/Z owners. It
does **not** yet allocate canonical region IDs, resolve mask
boundaries, support real facet-normal coating at creases, persist
the data, or enable a new Process mode. Kernel integration must
confirm which wafer-thickness/etch-depth interpretation is
supported by the paper. The current Sahli project remains intact.

## Versioned physical material-owner prototype (not active Model)

New `site/physical-facet-owner.js` exports a JSON-safe, opt-in
`wafercad-physical-pyramid-slab-v1` descriptor. It owns one material,
a rectangular integer-cell XY domain and two analytic physical interfaces.
Point probes distinguish solid interiors, exact interfaces and voids.
Volume is integrated from canonical analytic boundaries, not the 3D display.

This remains isolated from `region.stack`, the .wafercad project serializer,
Recipe, History, Recovery and production rendering. The isolated JSON
round-trip is NOT proof of application-wide persistence; changing Process
operations explicitly fails closed. Arbitrary mask polygons and multi-owner
intersections are intentionally unsupported. Next gate: canonical
owner/region attachment, true conformal offsets and save/reopen parity.

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

**Not yet complete:** Production `model-view-geometry`, Process,
History/Recovery and the existing Sahli Example still use ideal stacks.
Neither new geometry output is wired into application 3D/Section views.
Facet-normal multilayer coating at apex/valley junctions and original-paper
figure calibration remain blocked. This experimental adapter may only
become user-facing after an opt-in versioned canonical Model contract and
save/reopen/rollback test; do not silently upgrade old `.wafercad` files.
