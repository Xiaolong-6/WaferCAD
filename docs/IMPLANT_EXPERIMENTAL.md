# Experimental Implant structural marker

> **Status: experimental.** This feature is intentionally a structural/process-visualization primitive. It is not a dopant-physics or TCAD model and its output must not be interpreted as a predicted concentration profile.

## Purpose

Implant lets a user annotate the currently exposed structure using the same mask-area selection used by the other process operations. The user supplies an empirical implant depth, for example a range estimated externally from SRIM or another process reference. WaferCAD stores the resulting implant as a visual structural zone attached to the exposed surface state at the time of Apply.

The feature deliberately avoids process inputs that would imply physical prediction. There is no dopant species, dose, energy, projected-range solver, straggle, channeling, activation, diffusion, annealing, or electrical model.

## v1 behavior

Inputs:

- **Name** — free user label such as `P+ source/drain`, `Deep implant`, or `B implant`.
- **Area** — Selected mask, Invert mask, or Whole face, with Mask ROI limiting the operation when active.
- **Depth** — empirical physical depth in the current display unit. Internally stored in µm.
- **Tilt X** — signed geometric display tilt from the surface normal toward +X, limited to -80°…+80°.
- **Color** — visualization color for this implant marker.
- **Border** — optional black dashed outline.

Apply records the exposed surface patches intersected by the requested area. It does **not** create a material layer and does not modify the underlying layer stack.

## Rendering

- **Main**: the implanted surface footprint is overlaid with a translucent implant color. Optional border is black and dashed.
- **Section A–B**: the implant is rendered as a color gradient from the tagged surface inward to the empirical depth. Tilt shifts the inner edge geometrically along the global X direction. The zone is clipped to the Z extent of material that existed in the tagged region when the implant was applied.
- **3D**: the tagged exposed surface is shown as a translucent colored overlay. Optional border is rendered as a dashed black line.

The gradient is a visualization convention only. It is not a concentration profile.

## Data model

Implants are stored separately from material layers in `model.implants`.

Each implant stores its identity and display parameters plus the exposed surface patches captured at Apply time:

```text
implant
├─ id
├─ name
├─ color
├─ face
├─ thickness
├─ tilt
├─ border
└─ patches[]
   ├─ geom
   ├─ z
   ├─ zMin / zMax
   └─ layerId
```

This separation prevents an implant from being mistaken for deposited material and leaves room for a future scalar-field implementation without changing the material stack contract.

## Experimental limitations

The v1 marker is intentionally lightweight.

- Later Deposit/Extend/Etch operations do not recompute historical implant transport or damage.
- The stored patch geometry represents the exposed surface state at Apply time. Complex subsequent geometry edits may therefore make an old implant annotation less physically intuitive.
- Tilt is a single signed X tilt; azimuth is not modeled.
- 3D shows the tagged surface footprint rather than a volumetric concentration field.
- Overlapping implants remain separate annotations; no concentration blending is performed.

These limitations are acceptable for the current structural-model scope. Any future physics-aware implementation should be introduced as a separate opt-in model rather than silently changing the meaning of existing implant records.
