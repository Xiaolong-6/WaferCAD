# WaferCAD geometry/process capabilities roadmap

> Planning contract · 2026-10-09 · starts from `main` · implementation milestones are **not** claims of shipped features.

## Product boundary

WaferCAD is a browser-based **Visual Process CAD**: an evolving, mask-aware **vector 2.5D** material model with shared Process / Main / Section / 3D topology. Kernel v2 distinguishes actual exposed faces, buried interfaces, intentional cavities, numerical cracks and genuine walls. It is **not** calibrated process TCAD. History, Recipe and visual resemblance to a paper are not proof of fabrication accuracy.

Preserve **vector-2.5d-v1**, canonical material ownership, units in µm, native Recipe/History/Variants replay and array templates unless a versioned migration is separately reviewed. Appearance-only Rough/Pyramid, empirical Implant, Electrical and Record annotations must remain clearly distinct from physically computed geometry.

## Capability proposals and sequencing

| Rank | Capability                                  | Deliverable / minimum viable scope                                                                                                                                                                               | Explicit limits / acceptance                                                                                                                                                                                                                                          |
| ---- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0   | **Process Geometry Diagnostics**            | Read-only analysis of current canonical structure: material volumes, Z ranges, per-layer thickness extrema, actual Z gaps, geometry overlap, stable XY/Z issue location, severity and explicit analysis coverage | Invalid overlaps are **errors**; intentional Z gaps are **observations**, not automatically defects. A clean result only covers implemented checks. Array templates need weighted summaries and honest per-instance scope. Analysis must not mutate History or model. |
| P1   | **Etch profile and sidewall angles**        | Parameterized taper / sidewall angle and explicit etch profile, with the geometry surviving in material topology and both views                                                                                  | Must not be only 3D cosmetics; no etch chemistry, measured rate, anisotropy calibration; signed front/back, mask edge and conformal regression fixtures                                                                                                               |
| P1   | **Parameterized Recipe / procedural masks** | Typed dimensions/variables and bounded mask primitives, named mask references, deterministic parameter sweeps                                                                                                    | Restricted declarative interpreter, no arbitrary JS/eval; quotas, units, exported masks, reproducible replay; safe recipe replacement and snapshots                                                                                                                   |
| P1   | **Step Coverage / Gap Fill**                | Explicit top/bottom/sidewall coverage ratios, geometric shadow/closure and trapped void modeling                                                                                                                 | Idealized user-specified geometry, not ALD/PVD transport or kinetics; material ownership and high-aspect-ratio voids verified                                                                                                                                         |
| P2   | **Local true Rough/Pyramid geometry**       | Opt-in ROI-local canonical fine geometry, boundary adapters and a deterministic resolution budget                                                                                                                | Current Rough/Pyramid remains render-only unless explicitly converted; do not voxelize the whole wafer; shared buried profiles and later conformal/etch consistency required                                                                                          |
| P2   | **Material transformation / oxidation**     | Mass/volume-constrained geometric consumption/replacement (e.g. Si -> SiO2), including layer provenance                                                                                                          | Temperature/time/ambient do not predict reaction kinetics; validated volume ratio, material-host ownership, masks and front/back                                                                                                                                      |
| P2   | **Simulation-ready export**                 | Physical geometry with explicit material domains/units, watertight interfaces and documented target format                                                                                                       | GLB imagery alone is not simulation-ready; roundtrip mesh/material verification before claiming FEM/FDTD interoperability                                                                                                                                             |

## Delivery plan

1. **Diagnostics first:** read-only, explicit Analyze action, geometry-quantified measurements with checked provenance, error/observation separation, bounded array behavior and permanent automated fixtures. Show results in the workstation Process tab; never block processing solely for a diagnostic warning.
2. **Geometric process fidelity:** etch sidewall profiles, then non-ideal step coverage/gap fill, then controlled material transformation. Each mode requires a clear analytical fixture, replay and Section/3D parity.
3. **Hybrid Kernel research:** preserve global vector domains and add local high-fidelity microgeometry only where needed. Define conversion, Z/XY interface ownership, sidewalls, cell/array consistency, memory bounds and preservation/export prior to coding.
4. **Design workflows:** Recipe parameters and sweeps can start in parallel once diagnostic metrics are stable; use diagnostics as the objective functions. Simulation handoff follows a verified material-domain export.

## Scientific and engineering acceptance

- Tests must distinguish **actual geometry** from rough/render metadata, implant/electrical overlays and process records.
- No asserted void defect without an intent/reference rule: released MEMS cavities and air gaps are valid geometry.
- Invalid overlap reports must have a spatial witness and materials/region context; no claim from coincident rendered edges.
- Validate numerical tolerances, unclosed/hollow shapes, same-height partitions, trenches/holes, released cavities and conformal sidewalls; include front and back.
- Array analyses must not silently substitute a single-site preview for the complete wafer. Report template-level checks, counts and whether cross-instance seams were examined.
- Tests: focused Node fixtures, applicable browser interaction, Recipe replay and import/export when relevant. Review actual UI and baseline screenshots; CI success alone does not establish UX fidelity.
- Update owning source docs/Wiki with shipped behavior. Date/version any benchmark evidence; no claim of current green CI without actual evidence.

## Deferred scope

No in-browser full physical TCAD (dopant diffusion, activation, carrier transport, electrostatics, stress, plasma chemistry), no unconditional general B-rep/voxel rewrite, no AI-generated paper-to-fabrication-accurate model guarantee. Independent physics integration can be evaluated once a validated geometry export exists.

See [Process benchmarks](PROCESS_BENCHMARKS.md), [Kernel v2](PROCESS_GEOMETRY_KERNEL_V2.md), [Morphology](ROUGHNESS_MORPHOLOGY.md), [Recipe tutorial](wiki/Recipe-Code-Tutorial.md).
