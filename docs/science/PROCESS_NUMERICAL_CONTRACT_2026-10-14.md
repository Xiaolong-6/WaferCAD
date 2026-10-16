# Process numerical precision and physical interpretation — 2026-10-14

## Scope and scientific claim

WaferCAD's Process Kernel is a 2.5D **continuum geometry** simulator. A numerical Z
segment is not evidence that a physically continuous atomic film exists, that a
deposition process has nucleated, or that an ultrashallow implant profile is
physically valid. Physical feasibility depends on material, chemistry, coverage,
surface and process conditions; no universal atomic-layer thickness can be
deduced from a global numeric threshold.

Example: `0.005 nm` is `5 pm` (`0.000005 µm`). It may serve as a mathematical
equivalent/area-average thickness in a continuum calculation. Treating that
number as a literal, uniform, physically continuous film is **not justified** by
this model. WaferCAD does not implement atomistic nucleation or monolayer
occupancy. No automatic claim of physical validity is made.

## Implemented numerical contract

- Internal Z coordinates and Recipe lengths use physical µm. The Kernel uses
  the requested positive, finite Process amount; it no longer silently clamps
  values below `0.01 nm` to that former arbitrary floor.
- Material segments pass through `normalizeStack`, whose existing Z filtering
  threshold is `1e-9 µm` (a **numerical** limit, not a physical thin-film
  minimum). Positive material Deposit/Extend and removal-depth operations at or
  below the threshold are explicitly rejected, before model mutation.
- Implant and Electrical depth values describe non-material annotations. They
  are checked for positive finite values but do not inherit the material-stack
  normalization threshold.
- Absolute-Z Planarize targets are coordinates, not film thicknesses. They are
  not subject to a material deposition thickness floor.
- Recipe parsing, normalization and source serialization share the same
  material-length contract. Human-readable length formatting is accepted only
  when it round-trips the canonical value; otherwise the serializer retains
  the full µm number.
- Front/Back/Both Process execution retains the existing per-operation
  all-or-nothing semantics, including distinct Layer IDs for Both Deposit.
  Rejecting a thickness must not add Layers, alter Z, or create History.

The threshold describes the current stack canonicalizer's limitations, not
a proposed minimum deposition depth. Some extremely large absolute-Z contexts
may lose precision due to IEEE-754 spacing before reaching that threshold.
Do not assume arbitrary combinations of absolute coordinate and sub-pm
increments are accurately representable: precision validation and observed
canonical Z changes remain an acceptance obligation.

## Acceptance and regression owners

- `site/tests/kernel-invariant-matrix.test.mjs`: 5 pm numerical thickness
  is preserved without promotion to 10 pm; too-small material segments
  fail closed across Front/Back/Both; annotation depths stay distinct.
- `site/tests/process-recipe.test.mjs`: sub-0.01 nm Recipe parsing, unit
  conversion and high-precision source serialization.
- `scripts/ci-test-plan.mjs`: the numerical contract module and Recipe
  normalization edits route to the Process browser owner and Recipe release gate.

CI results on this branch must be recorded separately; code or documentation
inspection alone is not a passing scientific acceptance. Do not weaken geometry,
project-schema or persistence assertions to make a small thickness test pass.
