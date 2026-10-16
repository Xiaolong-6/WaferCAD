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

Pyramid morphology is introduced with project format v13. v12 stochastic projects migrate through v13 to the current v14 schema without changing their stored morphology or polarity; v14 adds Electrical Region annotations.

## Renderer contract

All views consume the same deterministic `roughProfileOffsetAtPoint(x, y, appearance)` field, regardless of whether the morphology is stochastic or pyramid.

- **Section A–B** samples that field along the section line and remains the visual reference for surface relief.
- **3D** uses screen-space adaptive tessellation. Camera distance, projected feature size, viewport dimensions/DPR, ROI extent, and the current camera-focus region feed one LOD estimator. The expanded focus region receives the detail required by the projected rough feature size, while geometry outside that region is kept at a lower LOD. Every rough cap/zone draws from one scene-wide subdivision budget, preventing multiple visible rough patches from each claiming the former per-cap maximum. LOD is rebuilt only when a quantized camera/view signature changes, and that update replaces only rough meshes rather than reconstructing smooth geometry or Kernel-v2 ownership. Physical rough skirts are generated only on true cap boundaries; internal high/low-LOD boundaries are reconciled as collinear intervals before a stitch strip connects the fine heightfield to the coarse piecewise-linear edge. This handles long edges split into shorter clipping segments while preventing T-junction cracks and ideal-plane curtains. The displaced vertices still sample the same deterministic morphology field and use profile-derived normals; no separate bump/noise texture is added.
- **Owned interfaces** are derived before Three.js mesh creation. Rough caps, smooth caps, buried material interfaces, sidewalls, and borders use one deterministic ownership plan. A shared material interface is emitted once, buried interfaces are only additionally exposed for transparent inspection, and physical borders do not inherit artificial camera-focus/LOD seams. Inherited rough interfaces reuse the same deterministic XY profile as the corresponding exposed surface.
- **Main** and **Mask** keep their existing colors and add only a subtle neutral darkening over non-smooth surface regions.
- Implant overlays inherit the active surface appearance so they remain aligned with etched topography.

Surface morphology remains render-only with respect to process simulation: process operations and the canonical physical 2.5D stack stay ideal. The conformal visual shell is a shared-profile Z offset, not a true constant-normal-thickness surface and not a deposition-transport model. **GLB export is an inspection/handoff surface mesh**, so it deliberately embeds the deterministic Rough/Pyramid relief derived from the same topology-owned surface plan used by 3D. Export tessellation is camera-independent, uses a strict 900,000-triangle hard cap, preserves ROI clipping and interface ownership, and never feeds displaced vertices back into the process kernel.

## Extension point

Future deterministic morphologies should continue using the same two-axis model:

```
morphology: stochastic | pyramid | cone | needle | ...
polarity:   normal | inverted
```

This avoids morphology-specific booleans such as `invertedPyramid` and keeps Section, 3D, inherited surfaces, implants, persistence, and future generators on the same contract.
