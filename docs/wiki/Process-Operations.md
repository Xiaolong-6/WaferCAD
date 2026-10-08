# Process Operations

[Home](Home) · [Process and Recipes](Process-and-Recipes)

> All diagrams are schematic. WaferCAD is a geometric process editor, not a calibrated process/electrical TCAD simulator.

The contextual schematic under **Apply** and this page use the same Process catalog. The current Area selection and active Mask ROI still control the real operation footprint.

## Deposit

<a id="deposit-directional"></a>
### Directional deposition

![Before and after schematic for Directional deposition](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/deposit-directional.svg?sanitize=true)

**Behavior:** Adds a new layer to exposed horizontal surfaces along Z.

Applies the requested thickness on local exposed horizontal faces inside the chosen area; vertical walls are not coated.

**Inputs:** Material · Thickness · Face · Area

**Changes:** canonical material geometry

**Modeling boundary:** No rate, shadowing, or transport physics is computed.

**Example:** Simplified sputtered contacts in the detector process.

<a id="deposit-conformal"></a>
### Conformal deposition

![Before and after schematic for Conformal deposition](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/deposit-conformal.svg?sanitize=true)

**Behavior:** Coats exposed horizontal surfaces and genuine sidewalls.

A shared kernel coats exposed horizontal faces and makes physical sidewall bands of the same lateral thickness.

**Inputs:** Material · Thickness · Face · Area

**Changes:** canonical material geometry

**Modeling boundary:** Rough surface coating is a render approximation; no ALD kinetics or pinch-off prediction.

**Example:** ALD Al₂O₃ passivation on nanostructured Si/Ge.

<a id="deposit-transfer-follow"></a>
### Transfer · Follow surface

![Before and after schematic for Transfer · Follow surface](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/deposit-transfer-follow.svg?sanitize=true)

**Behavior:** Transfers a new film onto each local exposed horizontal plane.

Every supported XY column uses its own exposed height. True voids stay empty; vertical sidewalls receive no film.

**Inputs:** Film thickness · Gap · Placement

**Changes:** canonical material geometry

**Modeling boundary:** No mechanical deformation, bonding, or sagging model.

**Example:** Local transfer of a 2D film onto stepped surfaces.

<a id="deposit-transfer-flat"></a>
### Transfer · Flat bridge

![Before and after schematic for Transfer · Flat bridge](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/deposit-transfer-flat.svg?sanitize=true)

**Behavior:** Transfers a flat membrane at one global exposed plane.

The front-side highest exposed Z (back-side lowest) defines the film plane; it may bridge openings without filling underneath.

**Inputs:** Film thickness · Gap · Placement

**Changes:** canonical material geometry

**Modeling boundary:** No membrane sag or fracture. Legacy Transfer without placement replays as Flat bridge.

**Example:** Bridge a patterned gap with a suspended sheet.

## Extend

<a id="extend-directional"></a>
### Directional extension

![Before and after schematic for Directional extension](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/extend-directional.svg?sanitize=true)

**Behavior:** Thickens the exposed horizontal part of an existing layer.

Uses the target layer identity and extends only currently exposed horizontal target surfaces.

**Inputs:** Target layer · Thickness · Area

**Changes:** canonical material geometry

**Modeling boundary:** A covered target and exposed sidewalls do not grow in this mode.

**Example:** Continue an exposed metal/contact layer.

<a id="extend-conformal"></a>
### Conformal extension

![Before and after schematic for Conformal extension](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/extend-conformal.svg?sanitize=true)

**Behavior:** Continues an existing layer over exposed faces and real sidewalls.

Uses the same conformal kernel as Deposit, retaining the selected layer ID. The target must be exposed in the selected area.

**Inputs:** Target layer · Thickness · Area

**Changes:** canonical material geometry

**Modeling boundary:** May cover neighboring exposed surfaces; rough shells are display approximations.

**Example:** Add another conformal increment of a passivation film.

## Etch

<a id="etch-directional"></a>
### Directional etch

![Before and after schematic for Directional etch](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/etch-directional.svg?sanitize=true)

**Behavior:** Vertically subtracts exposed materials through the selected footprint.

Without a target material, subtraction progresses through adjacent contiguous materials in stack order, stopping at true voids.

**Inputs:** Depth · Face · Area

**Changes:** canonical material geometry

**Modeling boundary:** No measured etch rates, aspect-ratio or plasma chemistry.

**Example:** Open a patterned contact hole through oxide.

<a id="etch-selective"></a>
### Material-selective etch

![Before and after schematic for Material-selective etch](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/etch-selective.svg?sanitize=true)

**Behavior:** Etches only a selected exposed material and stops at another layer.

Directional subtraction stops once the chosen material is no longer exposed, or when it reaches a real cavity.

**Inputs:** Target material · Depth · Area

**Changes:** canonical material geometry

**Modeling boundary:** Material selectivity is an ideal geometric choice, not a rate prediction.

**Example:** Remove oxide without subtracting underlying silicon.

<a id="etch-isotropic"></a>
### Isotropic release

![Before and after schematic for Isotropic release](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/etch-isotropic.svg?sanitize=true)

**Behavior:** Expands a curved etch front into and laterally under exposed target material.

A distance-based geometric removal front forms real cavities and supported overhangs while preserving other materials.

**Inputs:** Exposed target material · Radius · Area

**Changes:** canonical material geometry

**Modeling boundary:** A bounded Z-sliced approximation; no calibrated wet/dry release chemistry.

**Example:** MEMS-style release beneath a protective mask.

<a id="etch-undercut"></a>
### Undercut release

![Before and after schematic for Undercut release](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/etch-undercut.svg?sanitize=true)

**Behavior:** Laterally removes an exposed sacrificial layer from access openings.

Expands the access area in XY and subtracts only the selected sacrificial material, leaving upper structures suspended.

**Inputs:** Exposed sacrificial material · Undercut distance

**Changes:** canonical material geometry

**Modeling boundary:** Uses 2.5D lateral removal, not a fully 3D advancing front.

**Example:** BOX / sacrificial-spacer removal.

<a id="etch-planarize"></a>
### Planarize / CMP

![Before and after schematic for Planarize / CMP](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/etch-planarize.svg?sanitize=true)

**Behavior:** Clips the existing stack to a physical target Z plane.

Only material beyond Target Z on the chosen face is removed. Depressions remain and no fill is invented.

**Inputs:** Target Z · Face · Area

**Changes:** canonical material geometry

**Modeling boundary:** No CMP polishing rate, dishing, or erosion computation.

**Example:** Level a stepped multi-material stack.

## Surface

<a id="etch-rough-normal"></a>
### Rough · Normal peaks

![Before and after schematic for Rough · Normal peaks](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/etch-rough-normal.svg?sanitize=true)

**Behavior:** Renders stochastic correlated outward surface relief after directional etch.

Feature size, mean height, coefficients of variation, and seed define a deterministic roughness heightfield.

**Inputs:** Depth · Feature XY · Height · CV · Seed

**Changes:** display morphology only (ideal 2.5D stack unchanged)

**Modeling boundary:** Render-only morphology: subsequent Process actions use the ideal stack.

**Example:** Schematic RIE-like black-Si surface.

<a id="etch-rough-inverted"></a>
### Rough · Inverted pits

![Before and after schematic for Rough · Inverted pits](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/etch-rough-inverted.svg?sanitize=true)

**Behavior:** Renders inward valleys from the same stochastic surface profile.

Inverted mirrors the Normal vertical field without moving its lateral feature positions.

**Inputs:** Depth · Feature XY · Height · CV · Seed

**Changes:** display morphology only (ideal 2.5D stack unchanged)

**Modeling boundary:** Render-only. No measured black-Si profile is implied.

**Example:** Schematic recessed texture, e.g. MACE-like.

<a id="etch-pyramid-normal"></a>
### Pyramid · Normal

![Before and after schematic for Pyramid · Normal](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/etch-pyramid-normal.svg?sanitize=true)

**Behavior:** Renders outward square-pyramid texture after directional etch.

The shared deterministic XY heightfield creates outward pyramidal relief on the displayed surface.

**Inputs:** Depth · Pyramid XY · Height · Orientation

**Changes:** display morphology only (ideal 2.5D stack unchanged)

**Modeling boundary:** Render-only; it does not alter the canonical etch boundary.

**Example:** Idealized textured silicon pyramids.

<a id="etch-pyramid-inverted"></a>
### Pyramid · Inverted

![Before and after schematic for Pyramid · Inverted](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/etch-pyramid-inverted.svg?sanitize=true)

**Behavior:** Renders recessed square pyramidal pits.

A vertical mirror of Normal pyramid relief creates regular inward pits.

**Inputs:** Depth · Pyramid XY · Height · Orientation

**Changes:** display morphology only (ideal 2.5D stack unchanged)

**Modeling boundary:** Render-only; crystallographic etch kinetics are outside scope.

**Example:** Idealized inverted-pyramid antireflective texture.

## Annotation

<a id="implant"></a>
### Implant

![Before and after schematic for Implant](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/implant.svg?sanitize=true)

**Behavior:** Adds a depth-graded structural marker beneath exposed surfaces.

Stores a separately named annotation with empirical depth and signed X tilt. Later etches clip the surviving annotation.

**Inputs:** Name · Depth · Tilt X · Face · Area

**Changes:** non-material annotation only

**Modeling boundary:** Does not compute species, dose, energy, activation, diffusion or electrical junctions.

**Example:** Front B implant and guard ring in the photodetector.

<a id="electrical"></a>
### Electrical Region

![Before and after schematic for Electrical Region](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/electrical.svg?sanitize=true)

**Behavior:** Annotates induced, doped, p/n, depletion or interface zones.

Anchors a non-material schematic zone to the exposed face. It follows later geometrical clipping.

**Inputs:** Name · Type · Source · Depth · Area

**Changes:** non-material annotation only

**Modeling boundary:** No electrostatics, carrier concentration or transport simulation.

**Example:** Dielectric-induced inversion region on Ge.

## History

<a id="record"></a>
### Record process step

![Before and after schematic for Record process step](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/record.svg?sanitize=true)

**Behavior:** Stores fabrication metadata without changing geometry.

Adds an ordered History event for Anneal, Clean, Oxidation, Surface treatment, Activation or a custom operation.

**Inputs:** Process · Label · Temperature · Duration · Ambient · Notes

**Changes:** History metadata only

**Modeling boundary:** Recording an anneal does not perform diffusion or add an oxide layer.

**Example:** 1050 °C drive-in or forming-gas anneal in the detector example.

## More documentation

See [Mask and ROI](Masks-and-ROI), [History and Recovery](History-Variants-and-Recovery), and [Examples and Modeling Limits](Examples-and-Modeling-Limits).
