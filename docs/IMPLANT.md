# Implant structural annotation

> **Scope.** Implant is a production structural/process-visualization primitive. It is not a dopant-physics or TCAD model and its output must not be interpreted as a predicted concentration profile.

## Purpose

Implant lets a user annotate the currently exposed structure using the same mask-area selection used by the other process operations. The user supplies an empirical implant depth, for example a range estimated externally from SRIM or another process reference. WaferCAD stores the resulting implant as a visual structural zone attached to the exposed surface state at the time of Apply.

The feature deliberately avoids process inputs that would imply physical prediction. There is no dopant species, dose, energy, projected-range solver, straggle, channeling, activation, diffusion, annealing, or electrical model.

## v1 behavior

Inputs:

- **Name** — free user label such as `P+ source/drain`, `Deep implant`, or `B implant`.
- **Area** — Selected mask, Invert mask, or Whole face, with Mask ROI limiting the operation when active.
- **Depth** — empirical physical depth in the current display unit. Internally stored in µm.
- **Tilt X** — signed geometric display tilt from the surface normal toward +X, limited to -80°…+80°.
  Apply records the exposed surface patches intersected by the requested area. It does **not** create a material layer and does not modify the underlying layer stack.

## Rendering

- **Main**: the surviving implant footprint is overlaid with a deliberately light translucent color so the underlying structure remains dominant.
- **Section A–B**: the implant is rendered as a color gradient from the surviving outer boundary inward. Material boundaries do not restart the implant zone. Later Etch operations clip the existing implant volume; they do not regenerate a fresh full-depth implant from the new surface. Rough Etch uses the current rough surface profile for the clipped implant boundary. Tilt shifts the remaining volume geometrically along global X.
- **3D**: Implant uses the same normalized surface-to-depth fade as Section A–B. The surviving outer boundary is strongest, the mid-depth intensity is reduced, and the inner boundary fades almost to zero; this is still a visualization convention, not a concentration calculation. At 100% material opacity, the buried implant body remains occluded. If a Main ROI actually cuts through that buried implant, the newly exposed ROI sidewall is drawn as a depth-gradient inspection face on top of the material cut, so an opaque 3D cross-section still shows the implant. A horizontal cap is shown in opaque mode only when later process geometry has genuinely exposed/cut the implant at the physical material surface. Reducing global 3D Opacity additionally reveals the full clipped internal implant body with the same depth-falloff curve at a lower overall alpha. Rough/Pyramid-derived implant boundaries reuse the same deterministic surface profile on the ROI sidewall, so the 3D cut and Section use the same outer/inner depth semantics.
- **Section Border** is a view-level toggle. When enabled, material boundaries use solid lines and implant boundaries use dashed black lines. Border styling is not stored per implant.
- **Layers legend** lists implants alongside material layers. Each implant can be renamed, shown/hidden, and recolored from the same active structure palette used by material layers. Built-in templates and Random palettes contain 20 colors and Random recolors implants as well as material layers.

The gradient is a visualization convention only. It is not a concentration profile.

### Section A–B versus 3D ROI cuts

Section A–B and the 3D ROI are synchronized to the same canonical model, but they are **different inspection geometries**. Section samples the exact A–B line. The 3D ROI keeps the area inside the ROI and exposes sidewalls along the ROI boundary. In a circular or annular device, an A–B line through the centre and an ROI edge displaced in Y can therefore intersect a metal ring or implant at different lateral positions even though both views are correct. For one-to-one visual comparison, place A–B on the same physical path as the ROI cut edge being inspected. The renderer does not silently move A–B or reinterpret the ROI to force a match.

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

## Modeling limits

The current structural model is intentionally lightweight.

- Later material operations do not model transport, diffusion, activation, or damage. They only geometrically clip the stored implant volume against the current material structure.
- The stored patch geometry represents the exposed surface state at Apply time; later deposition does not create new implant above that original volume.
- Tilt is a single signed X tilt; azimuth is not modeled.
- 3D is a translucent structural overlay volume, not a volumetric concentration field.
- Overlapping implants remain separate annotations; no concentration blending is performed.

These limitations are acceptable for the current structural-model scope. Any future physics-aware implementation should be introduced as a separate opt-in model rather than silently changing the meaning of existing implant records.
