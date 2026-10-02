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
Apply records the exposed surface patches intersected by the requested area. It does **not** create a material layer and does not modify the underlying layer stack.

## Rendering

- **Main**: the implanted surface footprint is overlaid with a translucent implant color.
- **Section A–B**: the implant is rendered as a color gradient from the outermost tagged surface inward to the empirical depth. Material boundaries do not restart or stop the implant zone. Rough exposed topography is captured at Apply time so the implant starts at the visible outer surface rather than the ideal mean plane. Tilt shifts the inner edge geometrically along the global X direction.
- **3D**: the tagged exposed surface is shown as a translucent colored overlay.
- **Section Border** is a view-level toggle. When enabled, material boundaries use solid lines and implant boundaries use dashed black lines. Border styling is not stored per implant.
- **Layers legend** lists implants alongside material layers. Each implant can be renamed, recolored with a gradient swatch, and shown or hidden independently.

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
├─ visible
└─ patches[]
   ├─ geom
   ├─ z
   ├─ zMin / zMax
   ├─ layerId (provenance only)
   └─ surfaceAppearance
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
