# Process Geometry Kernel v2

Process Geometry Kernel v2 is WaferCAD's derived **surface-topology layer** for the existing vector 2.5D material model.

It does not replace the stored region-stack model and it is not a general B-rep, mesh Boolean kernel, or TCAD process solver. The persisted model remains `vector-2.5d-v1` so existing project files keep the same schema and geometry meaning.

The v2 goal is narrower and more important: every process/view subsystem should agree on what is physically exposed, buried, void, or a genuine sidewall.

## Canonical model vs derived topology

The canonical model remains:

- non-overlapping XY polygon regions;
- an ordered Z stack for each region;
- stable material-layer IDs;
- optional surface-appearance metadata;
- Implant annotations stored separately from material solids;
- Electrical Region annotations stored separately from both material solids and Implant.

`site/process-topology.js` derives physical topology from that model. Derived topology is disposable and can always be recomputed from canonical geometry.

## Topology contracts

### Exposed horizontal faces

`regionSurfaceFaces()` reads the active Front/Back segment of each region.

`visibleSurfaceGroups()` and `exposedSurfaceGroups()` merge compatible footprints so region partitions do not become visible or process-active seams.

An exposed face carries:

- material layer;
- physical Z;
- active face;
- XY geometry;
- opposite surface Z when required by Conformal void-wall handling;
- inherited surface appearance when present.

### Buried material interfaces

`materialInterfaceGroups()` derives interfaces only where adjacent stack segments touch at the same Z.

A material interface is distinct from an exposed face. It may carry rough appearance on either side, but it is not available to Deposit/Extend as an external process surface.

### Rough appearance ownership

`appearanceSurfaceGroupsFromTopology()` distinguishes:

- `exposed-appearance`;
- `buried-appearance-interface`.

Adjacent materials can therefore share one deterministic Rough/Pyramid profile without promoting that display morphology into canonical microgeometry.

A buried rough interface does not receive the external rough-cap closure skirt used at a genuinely exposed polygon boundary.

### Coverage voids

`classifyCoverageVoids()` separates uncovered XY domain into:

- `numerical-crack` — sub-grid slivers at or below the configured tolerance;
- `true-void` — intentional trenches, through-holes, or other uncovered process domain.

The current crack threshold is 0.1 nm, matching the project persistence precision.

Cracks may be healed before Conformal. True voids remain geometry and may receive sidewall coating.

### Vertical process walls

Conformal edge bands are classified by topology before any stack mutation:

- `material-wall` — a genuine step from a source surface to a physically lower Front neighbor or higher Back neighbor;
- `void-wall` — a source boundary adjacent to true uncovered domain.

Equal-height computational partitions are neither type and cannot generate Conformal material.

The model layer receives those wall targets and performs the actual stack mutation.

### Owned material surfaces

`ownedMaterialSurfacesFromTopology()` is the single source for 3D physical ownership. It splits caps by surface appearance, chooses one deterministic owner for coincident horizontal material interfaces, reconciles collinear partial-height sidewalls, and derives physical border lines. `renderer-geometry.js` is intentionally only an adapter to this result.

Collinear XY ownership uses `line-intervals.js`, shared with adaptive rough-mesh seam reconciliation. Complex slab unions use the kernel's fail-soft union path; if a bulk polygon union rejects a pathological set, derivation falls back recursively rather than aborting the whole render.

### Section and 3D solid topology

The same topology module derives:

- Section line columns;
- Section material slices;
- exact-Z extrusion groups;
- unioned material slabs;
- physical horizontal caps.

Horizontal 3D caps are created only where adjacent slab footprints differ. Internal slab transitions and computational partitions remain invisible.

## Conformal pipeline

The current Conformal Deposit/Extend contract is:

1. classify and heal numerical coverage cracks;
2. preserve the true-void domain from before coating;
3. coat selected exposed horizontal faces;
4. re-read the newly coated source faces;
5. build local XY edge bands using the requested physical coating thickness;
6. classify each band into `material-wall` / `void-wall`;
7. apply sidewall material only to those targets;
8. remove consumed void-wall bands from the remaining void domain so source levels cannot overlap.

Deposit creates a new layer ID. Extend reuses the selected exposed layer ID. Both share the same topology-driven Conformal kernel.

## Invariants

The permanent test suite protects these properties:

- same-height/same-material region partitions collapse into one exposed surface;
- exposed-layer selection comes from topology, not raw region count;
- buried material interfaces are distinct from exposed faces;
- rough buried interfaces retain shared profile ownership;
- numerical cracks are distinct from true voids;
- material-wall classification rejects source/same-height/higher neighbors;
- void-wall classification requires actual uncovered domain;
- Section slices and 3D slabs/caps use the same canonical intervals;
- coincident horizontal interfaces, partial-height sidewalls, and borders have one Kernel-v2 owner;
- complex slab union rejection degrades through the fail-soft union path instead of crashing rendering;
- internal material caps do not appear across computational partitions;
- rough Etch followed by Conformal cannot create sidewall material below the etched floor;
- front/back Step/Trench/Island and through-void Conformal benchmarks remain unchanged.

## Annotation clipping contract

Implant and Electrical Region volumes are canonical annotations rather than material. Their stored source patches remain attached to the process state where they were created; view geometry intersects those patches and depth intervals with the **current surviving material**. A later Etch therefore clips an existing annotation, exposes its current cut surface when appropriate, and removes it from an area when no annotated depth survives. Electrical Region type/source metadata does not participate in material topology or process chemistry.

## Non-goals

Kernel v2 intentionally does not add:

- arbitrary 3D solids or a general B-rep;
- overhang/re-entrant geometry;
- process-physics calibration;
- calibrated material-selectivity ratios or etch chemistry (the current target-material stop rule is geometric/process intent only);
- diffusion, implantation physics, stress, thermal flow, electrostatics, carrier transport, or predictive electrical simulation;
- canonical Rough/Pyramid microgeometry.

Those would change WaferCAD's product class. Kernel v2 instead makes the current visual/geometric process model internally consistent and easier to extend safely.
