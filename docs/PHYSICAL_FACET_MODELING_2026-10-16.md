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
**single infinite planar face** at fixed XY: it is *not* a Boolean coating
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
