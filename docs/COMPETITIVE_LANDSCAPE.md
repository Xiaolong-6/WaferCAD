# Competitive landscape and product direction

> Research snapshot: 2026-09-30  
> Scope: products and projects that overlap with WaferCAD in layout import, layer-stack construction, geometric process emulation, 3D inspection, or cross-section generation.

## Purpose

This document records what WaferCAD is comparable to, which external tools are useful references, and where WaferCAD should deliberately stop.

It is a product and engineering reference, not a claim of numerical parity with any commercial simulator. The current geometry contract remains defined by [PROCESS_BENCHMARKS.md](PROCESS_BENCHMARKS.md). When this document and a tested WaferCAD geometry contract disagree, the tested contract is authoritative until an explicit contract change is made.

The main conclusion is that WaferCAD occupies a useful middle layer between layout viewers / static layer-stack extruders and full semiconductor process TCAD:

**WaferCAD is a browser-based, mask-driven virtual-fabrication editor for rapidly building and inspecting layered micro- and nanofabricated structures.**

A shorter internal description is:

**Visual Process CAD: layout + process steps + evolving 2.5D geometry + synchronized inspection.**

WaferCAD should not be described as a general TCAD process simulator unless physics-based process models are actually introduced.

---

## 1. Current WaferCAD position

As of this research snapshot, the application combines capabilities that are often split across several tools:

- GDSII and OASIS import with hierarchy and global layer/datatype selection.
- Vector XY geometry rather than rasterized mask state.
- A physical Z stack in micrometres.
- Front- and back-face processing.
- Selected-mask, inverted-mask, and whole-face operation areas.
- Direct Grow, Conformal Grow, and vertical Etch.
- Synchronized Main, Mask, 3D, and arbitrary Section A-B views.
- Project save/open, undo/revert, and named snapshots.
- Browser-only deployment with no native application or TCAD installation required.

The present process model is intentionally geometric. Direct changes the exposed local face vertically. Conformal currently adds the same vertical thickness as Direct and then extends the coating around newly exposed step boundaries by the physical coating thickness in XY, filling the adjacent vertical sidewall interval. Etch removes material vertically from the selected face.

This model can represent useful process topology such as steps, trenches, islands, sidewall coatings, front/back processing, and multi-material stacks. It does not currently solve deposition transport, plasma or chemical kinetics, implantation, diffusion, oxidation, stress, shadowing, aspect-ratio-dependent coverage, pinch-off, or arbitrary overhang topology.

That boundary is important: WaferCAD is currently a **geometric process emulator**, not a predictive fabrication simulator.

---

## 2. Closest products and projects

### 2.1 KLayout 2.5D View

KLayout's built-in 2.5D view is a strong reference for lightweight layout-to-3D inspection. It extrudes polygon layers to specified Z positions and thicknesses and supports a separate visual Z scale.

Its own documentation explicitly says that it is not a full 3D process model and cannot model process topology. This makes it a useful comparison point for what WaferCAD has already moved beyond: WaferCAD's structure evolves after Grow and Etch instead of simply extruding each source layout layer independently.

**Reference value for WaferCAD**

- Layout navigation and layer handling.
- Visual Z exaggeration separated from physical coordinates.
- Large-layout interaction expectations.
- A clear conceptual boundary between layer extrusion and process topology.

**Do not copy as the WaferCAD process model**

Static layer extrusion is insufficient for sequential process history, etched topography, or coatings whose final geometry depends on previously created surfaces.

Source:

- https://www.klayout.de/doc/about/25d_view.html

### 2.2 KLayout XSection

XSection is the closest open reference to WaferCAD's geometric process semantics.

XSection uses a step-by-step process recipe to turn a planar layout into a cross-section. Its script model includes lithographic masks, grow/deposit, etch, material conversion, backside processing, planarization, snapshots, and material targeting. Grow and etch accept both vertical and lateral dimensions, with profile modes such as round, square, and octagon.

The important distinction is that XSection primarily generates a cross-section from a cut through the layout, whereas WaferCAD maintains an evolving XY + Z structure that is shared by Main, 3D, and arbitrary Section A-B views.

**Reference value for WaferCAD**

- Primary semantic reference for Grow and Etch vocabulary.
- Reference cases for lateral growth and underetch.
- Material-targeting concepts such as "on", "into", and "through".
- Backside-process semantics.
- Planarization semantics.
- Recipe history and snapshots as a process-debugging concept.

**Important caution**

WaferCAD should not claim XSection compatibility unless explicit parity tests exist. XSection has richer grow/etch parameterization than the current WaferCAD operation model.

Sources:

- https://klayoutmatthias.github.io/xsection/
- https://klayoutmatthias.github.io/xsection/DocReference.html
- https://klayoutmatthias.github.io/xsection/DocGrow.html
- https://klayoutmatthias.github.io/xsection/DocEtch.html

### 2.3 Synopsys Sentaurus Process Explorer

Synopsys positions Sentaurus Process Explorer as a fast 3D process emulator for finding process-integration issues. Synopsys states that it can use GDSII mask data and a process recipe to produce realistic 3D process structures.

Conceptually, this is one of the closest commercial product categories to the long-term WaferCAD direction: **mask data + recipe -> evolving 3D structure -> interactive analysis**.

Sentaurus Process Explorer sits inside a much larger commercial TCAD ecosystem and targets advanced-node development and DTCO. WaferCAD should not try to match that scope.

**Reference value for WaferCAD**

- Product framing around process emulation rather than only layout visualization.
- A recipe/process-flow-centered workflow.
- Interactive inspection of intermediate fabricated states.
- Clear distinction between fast process emulation and deeper physics-based process simulation.

**Do not copy as near-term scope**

- DTCO infrastructure.
- High-accuracy extraction flows.
- Enterprise simulation data management.
- Claims of predictive process fidelity.

Sources:

- https://www.synopsys.com/manufacturing/tcad.html
- https://www.synopsys.com/manufacturing/tcad/process-emulation.html

### 2.4 Synopsys Sentaurus Process

Sentaurus Process is useful mainly as a boundary marker. It is a physics-based 1D/2D/3D process simulator with models for implantation, diffusion and activation, oxidation, stress, epitaxy, and related process physics.

That is a different product class from current WaferCAD.

**Reference value for WaferCAD**

- Defines the point at which "geometric process emulation" becomes "process TCAD".
- Useful vocabulary for future export/interoperability.
- Reminds us that a visually plausible structure is not automatically a physically predictive result.

**Out of scope unless the project changes direction**

- Dopant transport.
- Implantation and damage.
- Thermal diffusion and activation.
- Oxidation kinetics.
- Stress evolution.
- Predictive material-process calibration.

Sources:

- https://www.synopsys.com/manufacturing/tcad/process-simulation/sentaurus-process.html
- https://www.synopsys.com/manufacturing/tcad/process-simulation.html

### 2.5 Lam Research SEMulator3D

SEMulator3D is a commercial virtual-fabrication platform built around complete process flows. Lam describes it as using physics-driven voxel modeling to transform input design data and integrated process-flow descriptions into the 3D structures that would be created in fabrication.

It represents the mature industrial version of the "virtual fabrication" product idea. It is especially relevant as a workflow and product-design reference, not as an implementation target.

**Reference value for WaferCAD**

- Process timeline as the central object.
- Intermediate-state inspection.
- Virtual fabrication as a product category.
- Process integration debugging before fabrication.
- Structure evolution as the source of truth rather than independent source-mask extrusion.

**Do not copy as near-term scope**

- Full industrial process-window modeling.
- Yield/HVM workflows.
- Large proprietary material/process libraries.
- Full voxel/physics infrastructure.

Source:

- https://www.lamresearch.com/product/semulator3d/

### 2.6 Silvaco Victory Process

Victory Process spans both fast geometrical process models and deeper physical process simulation. Silvaco documents direct GDSII-driven process simulation and supports geometrical etch/deposition as well as physical conformal, non-conformal, directional, selective, and shadowing-aware models.

This makes Victory Process particularly useful for keeping WaferCAD's operation vocabulary clean. For example, "conformal", "directional", "selective", and "isotropic" should not be collapsed into one generic Grow mode.

**Reference value for WaferCAD**

- Separating geometric prototyping from physical models.
- Distinct deposition modes.
- Distinct etch modes.
- Sidewall/profile control.
- Material selectivity.
- Directionality and shadowing as explicit advanced concepts.

**Do not copy as near-term scope**

- Physical deposition particle models.
- Beam/sticking models.
- Transport physics.
- Predictive oxidation or epitaxy.
- Full TCAD meshing.

Sources:

- https://silvaco.com/tcad/victory-process-3d/
- https://silvaco.com/simulation-standard/developing-custom-etching-deposition-models-in-victory-process/

### 2.7 Ansys Lumerical Layer Builder

Lumerical Layer Builder combines pattern information from GDS with vertical process information. It supports layer ordering, thickness, material information, translations, sidewall angles, and import/export of a process file.

Layer Builder is not a complete sequential virtual-fabrication engine, but it occupies an important middle ground: a designer can turn layout plus process-stack metadata into simulation-ready geometry without running full process TCAD.

**Reference value for WaferCAD**

- Compact layer/process parameter UI.
- Material, thickness, order, and sidewall-angle controls.
- Exportable process-stack definitions.
- Clean handoff from fabrication geometry into optical/electrical simulation.

**Potential future interoperability idea**

A WaferCAD process recipe could eventually export a simplified final geometry/process description for downstream simulation, while remaining clear that the export is geometry, not process-physics history.

Source:

- https://optics.ansys.com/hc/en-us/articles/360034382394-Layer-builder-Simulation-object

### 2.8 gdsfactory / kfactory technology models

gdsfactory provides LayerMap and LayerStack abstractions that connect GDS layers to physical thickness, Z position, materials, derived layers, and 3D rendering. Current gdsfactory documentation also describes sequential processes acting on a wafer stack, while kfactory exposes physical layer-stack metadata including sidewall angles.

This is a useful architecture reference because the design layers, physical stack, display metadata, and process description are separate concepts.

**Reference value for WaferCAD**

- Separation of layout identity from fabricated material identity.
- Explicit layer-map and layer-stack abstractions.
- Derived geometry instead of mutating source-mask meaning.
- Process definitions that can generate final layer stacks.
- Simulation/export-oriented metadata without embedding simulator logic into layout parsing.

Sources:

- https://gdsfactory.github.io/gdsfactory/notebooks/03_layer_stack/
- https://gdsfactory.github.io/gdsfactory/api/
- https://gdsfactory.github.io/kfactory/3.0.3/concepts/layers/

---

## 3. Capability matrix

Legend:

- **Yes**: central documented capability.
- **Partial**: capability exists, but with a different abstraction or narrower purpose.
- **No / not central**: outside the tool's main documented role.
- **Current**: implemented in WaferCAD at the time of this document.
- **Future**: useful direction but not current product behavior.

| Capability                        | WaferCAD                        | KLayout 2.5D          | XSection                                | Process Explorer                        | SEMulator3D                             | Victory Process                | Lumerical Layer Builder  | gdsfactory               |
| --------------------------------- | ------------------------------- | --------------------- | --------------------------------------- | --------------------------------------- | --------------------------------------- | ------------------------------ | ------------------------ | ------------------------ |
| GDS-driven geometry               | Current                         | Yes                   | Yes via KLayout                         | Yes                                     | Yes / design data                       | Yes                            | Yes                      | Yes                      |
| OASIS workflow                    | Current                         | Yes via KLayout       | Yes via KLayout                         | Not used as reference here              | Not used as reference here              | Not used as reference here     | GDS-focused              | Yes through layout stack |
| Layer stack / physical Z          | Current                         | Yes                   | Yes                                     | Yes                                     | Yes                                     | Yes                            | Yes                      | Yes                      |
| Sequential process history        | Current, small operation set    | No                    | Yes                                     | Yes                                     | Yes                                     | Yes                            | No / stack-oriented      | Partial / programmable   |
| Process topology changes          | Current                         | No                    | Yes in section                          | Yes                                     | Yes                                     | Yes                            | Partial                  | Partial                  |
| Interactive 3D structure          | Current                         | Yes, extrusion        | No, section-centered                    | Yes                                     | Yes                                     | Yes                            | Yes                      | Yes                      |
| Arbitrary interactive A-B section | Current                         | No                    | Cut-driven output                       | Analysis-oriented, not parity reference | Analysis-oriented, not parity reference | Simulator-dependent            | Simulation geometry      | Code-driven              |
| Direct vertical grow              | Current                         | No                    | Yes equivalent                          | Yes                                     | Yes                                     | Yes                            | Layer construction       | Programmable             |
| Conformal sidewall coating        | Current geometric approximation | No                    | Expressible with grow/lateral semantics | Yes category                            | Yes category                            | Yes, including physical models | Sidewall profile support | Stack/process dependent  |
| Vertical etch                     | Current                         | No                    | Yes                                     | Yes                                     | Yes                                     | Yes                            | Layer construction       | Programmable             |
| Material-selective process        | Future                          | No                    | Yes                                     | Yes                                     | Yes                                     | Yes                            | Material metadata        | Programmable             |
| Lateral grow / overgrow control   | Future explicit parameter       | No                    | Yes                                     | Yes                                     | Yes                                     | Yes                            | Pattern/profile controls | Programmable             |
| Underetch / isotropic etch        | Future                          | No                    | Yes                                     | Yes                                     | Yes                                     | Yes                            | No                       | Programmable             |
| Sidewall angle / taper            | Future                          | Static extrusion only | Profile modes                           | Yes category                            | Yes category                            | Yes                            | Yes                      | Yes metadata             |
| Planarize / CMP-like geometry     | Future                          | No                    | Yes                                     | Yes category                            | Yes                                     | Yes                            | No                       | Programmable             |
| Backside process                  | Current active-face model       | No                    | Yes                                     | Yes category                            | Yes category                            | Yes category                   | Stack dependent          | Programmable             |
| Full process physics              | No                              | No                    | No                                      | No / emulator category                  | Partial physics-driven model            | Yes                            | No                       | No                       |
| Browser-only application          | Current                         | No                    | No                                      | No                                      | No                                      | No                             | No                       | Python/code-first        |
| Zero-install static deployment    | Current                         | No                    | No                                      | No                                      | No                                      | No                             | No                       | No                       |

The matrix is deliberately conservative. It does not infer undocumented parity from screenshots or marketing terminology.

---

## 4. The market/product gap WaferCAD can occupy

The useful gap is between two common extremes.

### Extreme A: layout viewer / static stack extrusion

Typical workflow:

layout -> assign layer heights -> extrude -> inspect

This is fast and understandable, but the result does not naturally encode sequential fabrication. An etched trench, a later blanket coating, and a backside step cannot always be represented correctly as independent source-layer extrusions.

KLayout 2.5D is the clearest example of this category.

### Extreme B: industrial process TCAD / virtual fabrication

Typical workflow:

layout + detailed process recipe + material/process models -> large process model -> calibrated 3D result -> device/extraction flow

This is powerful, but expensive in setup, compute, licensing, learning curve, and model calibration.

Sentaurus Process, SEMulator3D, and Victory Process occupy parts of this space.

### WaferCAD target

WaferCAD can intentionally focus on:

layout -> simple visual process recipe -> immediate evolving geometry -> 2D/3D/section inspection

The target user does not need a calibrated plasma or diffusion model to answer questions such as:

- What will this mask opening remove?
- Does this blanket coating reach the sidewall?
- Which layer is exposed after this etch?
- What does the stack look like at this arbitrary cut?
- Does a backside operation intersect the front-side structure?
- Did I accidentally invert the mask polarity?
- What geometry should I export to an optical or device simulator?
- How will a simple proposed process flow change the fabricated topology?

This is especially suitable for:

- research process planning;
- photonics;
- MEMS;
- detectors and sensors;
- teaching;
- early device prototyping;
- communication between design and fabrication teams;
- checking a process concept before moving to a heavier simulator.

---

## 5. Product principles derived from the comparison

### 5.1 Keep source masks separate from fabricated geometry

The imported GDS/OASIS hierarchy is design intent. The processed WaferCAD model is fabricated state.

A process step may consume, grow, remove, or create physical material, but should not rewrite the meaning of the imported mask hierarchy.

This separation is consistent with the stronger architecture patterns visible in XSection, gdsfactory, and commercial process tools.

### 5.2 Make process history a first-class object

Long term, a saved WaferCAD project should be understandable as a sequence:

1. Base / substrate.
2. Mask reference.
3. Grow or deposit.
4. Etch.
5. Additional material.
6. Backside operation.
7. Planarize or other geometric step.
8. Final structure.

Snapshots already provide state capture, but snapshots and process history serve different purposes:

- **Process history** explains how the structure was created.
- **Snapshots** are user-managed bookmarks/checkpoints.

A future Process Flow panel should not simply replace snapshots.

### 5.3 Separate physical geometry from display exaggeration

WaferCAD already stores physical XYZ values while allowing 3D/Section display scaling. This should remain invariant.

KLayout 2.5D independently demonstrates why a separate Z visual scale is useful, but process operations must always consume physical geometry, never visual Z exaggeration.

### 5.4 Do not overload "Conformal"

"Conformal" should have a narrow, testable meaning: a nominal coating thickness follows accessible surfaces.

For a vertical wall, a thickness T implies approximately T vertical thickness on horizontal faces and T lateral thickness on vertical walls.

It should not silently become a synonym for:

- arbitrary mask overgrow;
- isotropic bulk growth;
- directional deposition;
- tapered deposition;
- material diffusion;
- sidewall-angle control.

Those should be separate parameters or operation modes.

### 5.5 Prefer explicit capability over hidden physical assumptions

If WaferCAD cannot model shadowing, it should say so.

If an etch is not selective, the UI and documentation should say "vertical, non-selective etch".

If sidewall geometry is an approximation, its benchmark should define that approximation.

This keeps WaferCAD scientifically useful without pretending to have fidelity it does not possess.

---

## 6. Process-semantics reference for WaferCAD

This section defines the vocabulary that future design work should use. It does not automatically change the current tested geometry contract.

### 6.1 Direct Grow — current

**Meaning**

Add the requested physical Z amount on the exposed active face inside the operation footprint.

**Characteristics**

- No deliberate lateral extension.
- Follows the selected Front or Back processing direction.
- Uses existing exposed structure as the local starting face.
- Suitable for idealized directional/vertical construction.

**Reference analogy**

Closest to a zero-lateral geometric grow/extrusion, not to a physical directional-deposition model with visibility/shadowing.

### 6.2 Conformal Grow — current geometric approximation

**Intended meaning**

Create a nominal coating of thickness T over accessible horizontal surfaces and vertical sidewalls.

**Current WaferCAD approximation**

1. Perform the Direct vertical thickness change inside the selected operation area.
2. Re-evaluate step boundaries.
3. Offset qualifying XY boundaries laterally by T.
4. Fill the sidewall interval back to the adjacent surface.
5. Merge the top and sidewall pieces as one material.

**Known geometric limitations**

- Not a full normal-offset surface solver.
- Rounded XY offsets are polygonal approximations.
- Z corners remain piecewise horizontal/vertical.
- No transport, shadowing, sticking probability, pinch-off, or aspect-ratio effects.
- A fully through-etched empty XY region currently has no adjacent stack from which to generate a freestanding coating wall.

This behavior must remain locked by tests until deliberately revised.

### 6.3 Lateral Grow / Overgrow — recommended future feature

XSection demonstrates why lateral extension should be explicit rather than hidden inside "Conformal".

Recommended future parameters:

- vertical thickness Tz;
- lateral extension Txy;
- profile mode: square / round, with more modes only if justified.

This would allow cases such as:

- 300 nm vertical deposition with 50 nm lateral overgrowth;
- zero-height lateral mask bias;
- process-bias exploration independent of conformal coating.

### 6.4 Etch — current

**Meaning**

Remove material vertically from the exposed active face within the operation footprint, crossing material interfaces as required.

**Current characteristics**

- Vertical.
- Non-selective.
- No lateral undercut.
- No process physics.
- No independent sidewall angle.

This is a useful primitive and should remain available even after richer etch modes are added.

### 6.5 Selective Etch — recommended future feature

XSection's "into" / "through" concepts and Victory Process material-selectivity concepts show a useful next step.

Potential model:

- target materials: only these materials are removable;
- stop materials: stop at these materials;
- optional pass-through masking semantics where needed.

This is more valuable than adding plasma-process parameters that WaferCAD cannot physically solve.

### 6.6 Isotropic / undercut Etch — recommended future feature

Add an explicit lateral etch distance rather than changing current Etch semantics.

A geometric version can remain deterministic and benchmarkable:

- vertical depth;
- lateral undercut;
- profile mode.

This would support common MEMS, wet-etch, lift-off, and release-process sketches without claiming chemistry or crystal-orientation physics.

### 6.7 Sidewall angle / taper — recommended future feature

Lumerical Layer Builder and modern layer-stack models expose sidewall angle because it materially affects simulation geometry.

For WaferCAD, sidewall angle is a strong candidate after the current vertical geometry is stable.

It should be represented as geometry, not as a material-process physics claim.

### 6.8 Planarize — recommended future feature

A simple geometric planarize operation would have high value:

- choose a target Z plane or removal amount;
- remove material above/below the plane according to active face;
- preserve material ordering below the cut.

This can cover many conceptual CMP/etch-back workflows without pretending to model CMP mechanics.

### 6.9 Backside processing — current concept, retain

WaferCAD already has explicit Front/Back active faces.

Future operations should preserve this as a general process-direction abstraction rather than creating duplicate "backside grow" and "backside etch" tools.

---

## 7. Benchmark strategy

External tools should be used as **references**, not as unqualified truth.

### 7.1 Tier 1 — analytic WaferCAD contracts

Keep exact internal fixtures for:

- step;
- trench;
- isolated island;
- dense repeated openings;
- front/back mirrors;
- multi-material interface crossing;
- through-etched void;
- physical-unit invariance;
- independence from visual Z scale.

These remain the strongest regression tests because expected volumes and intervals can be calculated directly.

### 7.2 Tier 2 — XSection reference corpus

Create small public comparison cases whose geometry can be reproduced in both WaferCAD and XSection.

Candidate cases:

1. Zero-lateral grow on a rectangular mask.
2. Grow with known lateral extension.
3. Round versus square lateral profile.
4. Blanket deposit.
5. Vertical etch.
6. Etch with lateral undercut.
7. Material-targeted etch.
8. Backside flip/process.
9. Planarize.

For overlapping semantics, compare numerical cross-section coordinates and material intervals, not only screenshots.

A mismatch must be classified as one of:

- WaferCAD bug;
- intentionally different semantic contract;
- approximation/resolution difference;
- feature not yet supported.

Do not tune WaferCAD merely to make a screenshot look similar.

### 7.3 Tier 3 — layer-stack geometry references

Use Lumerical Layer Builder and gdsfactory/kfactory examples to check conventions for:

- material identity;
- layer thickness;
- Z origin;
- sidewall angle;
- pattern bias;
- simulation export geometry.

These are architecture and geometry references rather than process-history oracles.

### 7.4 Tier 4 — commercial virtual-fabrication references

SEMulator3D, Process Explorer, and Victory Process are useful for terminology, workflows, and product expectations.

Unless reproducible licensed comparison data is available, do not claim geometry parity with these tools.

---

## 8. UI/workflow ideas worth borrowing

### Process Flow / Recipe timeline

The highest-value long-term UI change is a process timeline separate from snapshots.

Example:

- 00 Base: Si, 500 µm
- 01 Etch: Mask 1/0, Front, 2 µm
- 02 Deposit: Al2O3, Conformal, 0.10 µm
- 03 Grow: Metal, Direct, Mask 3/0, 0.20 µm
- 04 Etch: Back, Whole face, 50 µm

Selecting a step should show:

- parameters;
- input mask/layer;
- active face;
- before/after structure;
- enable/disable or replay status.

This is more scalable than making every process primitive a permanent standalone panel.

### Process parameter inspector

Lumerical's layer-oriented parameter model suggests a compact inspector for:

- material;
- thickness/depth;
- direction/face;
- area/mask polarity;
- growth/etch mode;
- lateral amount when supported;
- sidewall/profile parameter when supported.

### State inspection

SEMulator3D/Process Explorer reinforce the value of immediately inspecting intermediate states.

WaferCAD already has an advantage here because Main, 3D, Mask, and Section share one model and can update together.

### Keep Section A-B central

XSection's existence demonstrates that process cross-sections are not a secondary visualization. They are a primary reasoning tool.

WaferCAD's arbitrary editable A-B section should remain a core differentiator rather than being hidden behind a generic 3D viewer.

---

## 9. What WaferCAD should explicitly not become

At the current project scale, avoid turning WaferCAD into any of the following.

### A replacement for KLayout as a full layout editor

KLayout already provides mature hierarchy editing, boolean operations, DRC, scripting, PCells, and broad layout workflows.

WaferCAD only needs enough mask interaction to drive fabrication geometry.

### A replacement for Sentaurus Process

Do not add placeholder fields for temperature, pressure, implant dose, plasma power, or diffusion time unless those parameters drive an implemented physical model.

Decorative process parameters would reduce scientific clarity.

### A simplified SEMulator3D clone

Voxel-scale industrial process modeling, variation/yield infrastructure, and advanced-node integration analysis would overwhelm the lightweight browser architecture and the project's current purpose.

### A photonics-only layer builder

Photonics is a strong use case, but the core geometry model is also useful for MEMS, sensors, detectors, simple semiconductor structures, and teaching. Keep the process primitives domain-neutral.

---

## 10. Recommended development order

### Near term: lock the existing model

1. Treat PROCESS_BENCHMARKS.md as the normative geometry contract.
2. Keep Direct, Conformal, Etch, and Front/Back behavior deterministic.
3. Add XSection-inspired reference fixtures for overlapping simple cases.
4. Prevent display Z scaling from ever feeding process calculations.
5. Keep UI labels explicit about non-selective or approximate operations.

### Next process primitives

1. Explicit lateral grow/overgrow.
2. Selective etch / stop material.
3. Isotropic or lateral underetch.
4. Sidewall angle / taper.
5. Planarize.

These extend geometric expressiveness while preserving the project's lightweight nature.

### Product-workflow stage

1. Introduce a Process Flow data model.
2. Show process steps as a timeline/list.
3. Allow selecting/replaying an intermediate state.
4. Keep snapshots as user bookmarks rather than conflating them with process history.
5. Consider recipe import/export once the operation schema is stable.

### Interoperability stage

Potential future exports could target:

- simplified layer-stack/process metadata;
- final triangulated/mesh geometry;
- simulator-oriented structure formats where practical;
- cross-section coordinate/material tables.

Any export should identify whether it represents source layout, geometric process history, or final fabricated geometry.

---

## 11. Proposed product language

### Recommended one-line description

**WaferCAD is a browser-based, mask-driven virtual-fabrication editor for building and inspecting layered micro- and nanofabricated structures.**

### More technical description

**WaferCAD is a browser-only vector 2.5D geometric process emulator that combines GDSII/OASIS masks, sequential material operations, synchronized 3D inspection, and arbitrary cross-sections.**

### Terms to prefer

- geometric process emulation;
- virtual fabrication editor;
- process geometry;
- fabricated structure;
- physical layer stack;
- process step;
- mask-driven operation;
- conformal coating approximation.

### Terms to avoid without further implementation

- predictive process simulator;
- physical deposition simulation;
- TCAD process simulator;
- accurate fabrication outcome;
- physically calibrated conformal deposition.

---

## 12. Decision summary

The competitive landscape does not suggest that WaferCAD should compete feature-for-feature with a single existing product.

Instead, different tools should serve different reference roles:

| Reference                  | What to learn from it                                                         |
| -------------------------- | ----------------------------------------------------------------------------- |
| KLayout                    | layout and mask handling; physical vs visual Z separation                     |
| XSection                   | process-operation semantics and cross-section reference cases                 |
| Sentaurus Process Explorer | process-emulation product framing and recipe workflow                         |
| SEMulator3D                | mature virtual-fabrication workflow and intermediate-state thinking           |
| Victory Process            | clean taxonomy of geometric vs physical deposition/etch modes                 |
| Lumerical Layer Builder    | layer/process parameter UI and simulation-ready geometry                      |
| gdsfactory/kfactory        | separation of layout, layer map, physical stack, process, and export metadata |
| Sentaurus Process          | the boundary beyond which real process TCAD begins                            |

The distinctive WaferCAD opportunity is the combination of:

**browser accessibility + real layout input + sequential geometric fabrication + shared 2D/3D/section state + low setup cost.**

That combination is valuable on its own. The project should increase geometric expressiveness and workflow quality before considering any physics-based simulation.

---

## Source notes

Sources were checked on 2026-09-30. Product capabilities change; refresh this document before using it for external market claims.

Primary references:

- KLayout 2.5D View: https://www.klayout.de/doc/about/25d_view.html
- XSection home: https://klayoutmatthias.github.io/xsection/
- XSection reference: https://klayoutmatthias.github.io/xsection/DocReference.html
- XSection Grow: https://klayoutmatthias.github.io/xsection/DocGrow.html
- XSection Etch: https://klayoutmatthias.github.io/xsection/DocEtch.html
- Synopsys TCAD overview: https://www.synopsys.com/manufacturing/tcad.html
- Synopsys Process Explorer: https://www.synopsys.com/manufacturing/tcad/process-emulation.html
- Synopsys Sentaurus Process: https://www.synopsys.com/manufacturing/tcad/process-simulation/sentaurus-process.html
- Lam SEMulator3D: https://www.lamresearch.com/product/semulator3d/
- Silvaco Victory Process: https://silvaco.com/tcad/victory-process-3d/
- Ansys Lumerical Layer Builder: https://optics.ansys.com/hc/en-us/articles/360034382394-Layer-builder-Simulation-object
- gdsfactory LayerStack / process overview: https://gdsfactory.github.io/gdsfactory/notebooks/03_layer_stack/
- gdsfactory API: https://gdsfactory.github.io/gdsfactory/api/
- kfactory layers / LayerStack: https://gdsfactory.github.io/kfactory/3.0.3/concepts/layers/
