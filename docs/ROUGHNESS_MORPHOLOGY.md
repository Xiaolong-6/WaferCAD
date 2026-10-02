# Surface morphology contract

WaferCAD keeps etched-surface morphology as an appearance layer on top of the ideal 2.5D process geometry.

## Surface modes

The Etch surface selector currently supports:

- `smooth`: no surface appearance metadata.
- `rough`: stochastic correlated roughness.
- `pyramid`: deterministic square-pyramid array.

Both non-smooth modes use the same appearance contract:

```js
{
  kind: "rough",
  morphology: "stochastic" | "pyramid",
  polarity: "normal" | "inverted",
  featureSize,
  meanHeight,
  featureCv,
  heightCv,
  etchDepth,
  seed,
  profileId,
  geometryMode: "ideal"
}
```

The `kind: "rough"` field remains the compatibility marker used by the existing rendering pipeline. `morphology` selects the actual generator.

## Stochastic morphology

For `morphology: "stochastic"`:

- `featureSize`: mean lateral feature scale.
- `featureCv`: coefficient of variation of the lateral scale.
- `meanHeight`: mean generated relief before polarity mapping.
- `heightCv`: coefficient of variation of generated relief.
- `etchDepth`: maximum roughness envelope / etch depth.
- `seed` and `profileId`: deterministic profile identity.

This is the legacy roughness generator.

## Pyramid morphology

For `morphology: "pyramid"`:

- `featureSize`: square pyramid pitch and base width.
- `meanHeight`: apex-to-base pyramid height.
- `featureCv = 0` and `heightCv = 0`: the current pyramid array is deterministic and uniform.
- `etchDepth`: the vertical envelope in which the pyramid profile is placed.

The array is aligned to the global XY axes and tiles continuously with no gap between adjacent square bases.

For a Normal pyramid, the center of each cell is the apex and the cell boundaries are the base plane. Inverted uses the vertical mirror of the same field, producing square pyramid pits.

## Polarity

`polarity` controls vertical orientation without changing lateral feature placement.

- `normal`: outward peaks / pyramids.
- `inverted`: inward pits / inverted pyramids. This is also the legacy stochastic-roughness orientation.

For a fixed morphology and parameters:

```
offsetNormal(x, y) + offsetInverted(x, y) = etchDepth
```

For stochastic roughness this preserves the existing algorithm exactly when `polarity: "inverted"`. For pyramids it produces an exact analytic vertical mirror.

Projects from versions <= 11 migrate to:

```js
{
  morphology: "stochastic",
  polarity: "inverted"
}
```

so existing files retain their previous appearance.

Pyramid morphology is introduced with project format v13. v12 stochastic projects upgrade to v13 without changing their stored morphology or polarity.

## Renderer contract

All views consume the same deterministic `roughProfileOffsetAtPoint(x, y, appearance)` field, regardless of whether the morphology is stochastic or pyramid.

- **Section A–B** samples that field along the section line and remains the visual reference for surface relief.
- **3D** tessellates non-smooth boundaries within a bounded, view-scope-aware triangle budget, displaces their vertices with the same field, and uses profile-derived vertex normals to avoid large faceted patches in full-model views. ROI rendering keeps a smaller bounded budget because the clipped geometry already concentrates detail. It does not add a separate bump/noise texture.
- **Inherited interfaces** reuse the same deterministic XY profile on both sides of a material boundary. A conformal display shell therefore has a rough inner interface and a vertically offset rough outer surface instead of exposing an ideal internal plane. Horizontal ideal border lines are omitted where a displaced rough boundary is drawn.
- **Main** and **Mask** keep their existing colors and add only a subtle neutral darkening over non-smooth surface regions.
- Implant overlays inherit the active surface appearance so they remain aligned with etched topography.

Surface morphology remains render-only: process operations and canonical physical geometry stay ideal. The conformal visual shell is a shared-profile Z offset, not a true constant-normal-thickness surface and not a deposition-transport model. Physical GLB export therefore continues to use the ideal process solid rather than the display tessellation.

## Extension point

Future deterministic morphologies should continue using the same two-axis model:

```
morphology: stochastic | pyramid | cone | needle | ...
polarity:   normal | inverted
```

This avoids morphology-specific booleans such as `invertedPyramid` and keeps Section, 3D, inherited surfaces, implants, persistence, and future generators on the same contract.
