# Physical facets and SiO₂ coating — experimental (#297)

The regular WaferCAD **Roughness pyramid renderer remains the production
solution** for fast visual reconstruction. These 3D physical-facet prototypes
are **not** a default mode, not an example migration, and not required by
the nine bundled literature projects.

This folder groups the analytical facet heightfield, exact Si/SiO₂ spatial
material ownership, closed sampled coating surfaces, opt-in restricted
Both-face Conformal and diagnostic real-browser preview.

## Scientific and performance boundary

- A 50 nm thin film at a 2×2 pyramid lab fixture uses an expensive
  ~25,008-triangle exterior. Independent sampling observed a maximum
  ~0.497 nm thickness deviation at evaluated triangle midpoints/centroids;
  this is **not a certified global continuous error bound**.
- A small fixture took ~12 seconds and ~143 MB; not suitable as a promise
  for interactive full-wafer reconstruction. Keep strict complexity budgets.
- Unsupported masks, single-face or other arbitrary process combinations
  reject **without mutation**. The standard UI/project-editing route does
  not enable physical-facet Process or silently convert legacy projects.
- Same implicit material ownership should feed experimental Section and
  ThreeView. Save/reopen, scientific invariants, History and Recovery
  validation remain requirements whenever the experiment changes.
- Neither pixel-matched Sahli SEM nor original mask GDS is claimed.
  The conventional display-only pyramids intentionally retain their
  long-established approximate behavior.

Documentation: [Roughness](../../../docs/science/ROUGHNESS_MORPHOLOGY.md)
and [Physical facet experimental contracts](../../../docs/science/PHYSICAL_FACET_MODELING_2026-10-16.md).
