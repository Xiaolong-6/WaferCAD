# Process Operations

[Home](Home) · [Process and Recipes](Process-and-Recipes) · [Interactive Before → After diagrams](https://xiaolong-6.github.io/WaferCAD/guide/)

> All diagrams are schematic. WaferCAD is a geometric process editor, not a calibrated process/electrical TCAD simulator.

The contextual schematic under **Apply** and this page use the same Process catalog. The current Area selection and active Mask ROI still control the real operation footprint.

## Deposit

<a id="deposit-directional"></a>
### Directional deposition

**Behavior:** Adds a new layer to exposed horizontal surfaces along Z.

Applies the requested thickness on local exposed horizontal faces inside the chosen area; vertical walls are not coated.

**Inputs:** Material · Thickness · Face · Area

**Changes:** canonical material geometry

**Modeling boundary:** No rate, shadowing, or transport physics is computed.

**Example:** Simplified sputtered contacts in the detector process.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#deposit-directional)

<a id="deposit-conformal"></a>
### Conformal deposition

**Behavior:** Coats exposed horizontal surfaces and genuine sidewalls.

A shared kernel coats exposed horizontal faces and makes physical sidewall bands of the same lateral thickness.

**Inputs:** Material · Thickness · Face · Area

**Changes:** canonical material geometry

**Modeling boundary:** Rough surface coating is a render approximation; no ALD kinetics or pinch-off prediction.

**Example:** ALD Al₂O₃ passivation on nanostructured Si/Ge.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#deposit-conformal)

<a id="deposit-transfer-follow"></a>
### Transfer · Follow surface

**Behavior:** Transfers a new film onto each local exposed horizontal plane.

Every supported XY column uses its own exposed height. True voids stay empty; vertical sidewalls receive no film.

**Inputs:** Film thickness · Gap · Placement

**Changes:** canonical material geometry

**Modeling boundary:** No mechanical deformation, bonding, or sagging model.

**Example:** Local transfer of a 2D film onto stepped surfaces.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#deposit-transfer-follow)

<a id="deposit-transfer-flat"></a>
### Transfer · Flat bridge

**Behavior:** Transfers a flat membrane at one global exposed plane.

The front-side highest exposed Z (back-side lowest) defines the film plane; it may bridge openings without filling underneath.

**Inputs:** Film thickness · Gap · Placement

**Changes:** canonical material geometry

**Modeling boundary:** No membrane sag or fracture. Legacy Transfer without placement replays as Flat bridge.

**Example:** Bridge a patterned gap with a suspended sheet.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#deposit-transfer-flat)

## Extend

<a id="extend-directional"></a>
### Directional extension

**Behavior:** Thickens the exposed horizontal part of an existing layer.

Uses the target layer identity and extends only currently exposed horizontal target surfaces.

**Inputs:** Target layer · Thickness · Area

**Changes:** canonical material geometry

**Modeling boundary:** A covered target and exposed sidewalls do not grow in this mode.

**Example:** Continue an exposed metal/contact layer.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#extend-directional)

<a id="extend-conformal"></a>
### Conformal extension

**Behavior:** Continues an existing layer over exposed faces and real sidewalls.

Uses the same conformal kernel as Deposit, retaining the selected layer ID. The target must be exposed in the selected area.

**Inputs:** Target layer · Thickness · Area

**Changes:** canonical material geometry

**Modeling boundary:** May cover neighboring exposed surfaces; rough shells are display approximations.

**Example:** Add another conformal increment of a passivation film.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#extend-conformal)

## Etch

<a id="etch-directional"></a>
### Directional etch

**Behavior:** Vertically subtracts exposed materials through the selected footprint.

Without a target material, subtraction progresses through adjacent contiguous materials in stack order, stopping at true voids.

**Inputs:** Depth · Face · Area

**Changes:** canonical material geometry

**Modeling boundary:** No measured etch rates, aspect-ratio or plasma chemistry.

**Example:** Open a patterned contact hole through oxide.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#etch-directional)

<a id="etch-selective"></a>
### Material-selective etch

**Behavior:** Etches only a selected exposed material and stops at another layer.

Directional subtraction stops once the chosen material is no longer exposed, or when it reaches a real cavity.

**Inputs:** Target material · Depth · Area

**Changes:** canonical material geometry

**Modeling boundary:** Material selectivity is an ideal geometric choice, not a rate prediction.

**Example:** Remove oxide without subtracting underlying silicon.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#etch-selective)

<a id="etch-isotropic"></a>
### Isotropic release

**Behavior:** Expands a curved etch front into and laterally under exposed target material.

A distance-based geometric removal front forms real cavities and supported overhangs while preserving other materials.

**Inputs:** Exposed target material · Radius · Area

**Changes:** canonical material geometry

**Modeling boundary:** A bounded Z-sliced approximation; no calibrated wet/dry release chemistry.

**Example:** MEMS-style release beneath a protective mask.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#etch-isotropic)

<a id="etch-undercut"></a>
### Undercut release

**Behavior:** Laterally removes an exposed sacrificial layer from access openings.

Expands the access area in XY and subtracts only the selected sacrificial material, leaving upper structures suspended.

**Inputs:** Exposed sacrificial material · Undercut distance

**Changes:** canonical material geometry

**Modeling boundary:** Uses 2.5D lateral removal, not a fully 3D advancing front.

**Example:** BOX / sacrificial-spacer removal.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#etch-undercut)

<a id="etch-planarize"></a>
### Planarize / CMP

**Behavior:** Clips the existing stack to a physical target Z plane.

Only material beyond Target Z on the chosen face is removed. Depressions remain and no fill is invented.

**Inputs:** Target Z · Face · Area

**Changes:** canonical material geometry

**Modeling boundary:** No CMP polishing rate, dishing, or erosion computation.

**Example:** Level a stepped multi-material stack.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#etch-planarize)

## Surface

<a id="etch-rough-normal"></a>
### Rough · Normal peaks

**Behavior:** Renders stochastic correlated outward surface relief after directional etch.

Feature size, mean height, coefficients of variation, and seed define a deterministic roughness heightfield.

**Inputs:** Depth · Feature XY · Height · CV · Seed

**Changes:** display morphology only (ideal 2.5D stack unchanged)

**Modeling boundary:** Render-only morphology: subsequent Process actions use the ideal stack.

**Example:** Schematic RIE-like black-Si surface.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#etch-rough-normal)

<a id="etch-rough-inverted"></a>
### Rough · Inverted pits

**Behavior:** Renders inward valleys from the same stochastic surface profile.

Inverted mirrors the Normal vertical field without moving its lateral feature positions.

**Inputs:** Depth · Feature XY · Height · CV · Seed

**Changes:** display morphology only (ideal 2.5D stack unchanged)

**Modeling boundary:** Render-only. No measured black-Si profile is implied.

**Example:** Schematic recessed texture, e.g. MACE-like.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#etch-rough-inverted)

<a id="etch-pyramid-normal"></a>
### Pyramid · Normal

**Behavior:** Renders outward square-pyramid texture after directional etch.

The shared deterministic XY heightfield creates outward pyramidal relief on the displayed surface.

**Inputs:** Depth · Pyramid XY · Height · Orientation

**Changes:** display morphology only (ideal 2.5D stack unchanged)

**Modeling boundary:** Render-only; it does not alter the canonical etch boundary.

**Example:** Idealized textured silicon pyramids.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#etch-pyramid-normal)

<a id="etch-pyramid-inverted"></a>
### Pyramid · Inverted

**Behavior:** Renders recessed square pyramidal pits.

A vertical mirror of Normal pyramid relief creates regular inward pits.

**Inputs:** Depth · Pyramid XY · Height · Orientation

**Changes:** display morphology only (ideal 2.5D stack unchanged)

**Modeling boundary:** Render-only; crystallographic etch kinetics are outside scope.

**Example:** Idealized inverted-pyramid antireflective texture.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#etch-pyramid-inverted)

## Annotation

<a id="implant"></a>
### Implant

**Behavior:** Adds a depth-graded structural marker beneath exposed surfaces.

Stores a separately named annotation with empirical depth and signed X tilt. Later etches clip the surviving annotation.

**Inputs:** Name · Depth · Tilt X · Face · Area

**Changes:** non-material annotation only

**Modeling boundary:** Does not compute species, dose, energy, activation, diffusion or electrical junctions.

**Example:** Front B implant and guard ring in the photodetector.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#implant)

<a id="electrical"></a>
### Electrical Region

**Behavior:** Annotates induced, doped, p/n, depletion or interface zones.

Anchors a non-material schematic zone to the exposed face. It follows later geometrical clipping.

**Inputs:** Name · Type · Source · Depth · Area

**Changes:** non-material annotation only

**Modeling boundary:** No electrostatics, carrier concentration or transport simulation.

**Example:** Dielectric-induced inversion region on Ge.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#electrical)

## History

<a id="record"></a>
### Record process step

**Behavior:** Stores fabrication metadata without changing geometry.

Adds an ordered History event for Anneal, Clean, Oxidation, Surface treatment, Activation or a custom operation.

**Inputs:** Process · Label · Temperature · Duration · Ambient · Notes

**Changes:** History metadata only

**Modeling boundary:** Recording an anneal does not perform diffusion or add an oxide layer.

**Example:** 1050 °C drive-in or forming-gas anneal in the detector example.

[View diagram ↗](https://xiaolong-6.github.io/WaferCAD/guide/#record)

## More documentation

See [Mask and ROI](Masks-and-ROI), [History and Recovery](History-Variants-and-Recovery), and [Examples and Modeling Limits](Examples-and-Modeling-Limits).
