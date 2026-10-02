# Rough surface morphology contract

WaferCAD keeps rough-surface generation as a structural appearance layer on top of the ideal 2.5D process geometry.

## Current morphology

`morphology: "stochastic"` is the current generator. Its statistical controls stay unchanged:

- `featureSize`: mean lateral feature scale.
- `featureCv`: coefficient of variation of the lateral scale.
- `meanHeight`: mean generated relief before polarity mapping.
- `heightCv`: coefficient of variation of the generated relief.
- `etchDepth`: maximum roughness envelope / etch depth.
- `seed` and `profileId`: deterministic profile identity.

## Polarity

`polarity` controls only the vertical orientation of the same stochastic field.

- `inverted`: legacy WaferCAD behavior. Low excursions form inward pits/valleys.
- `normal`: vertical mirror of the same profile. Low excursions become outward peaks.

For the same seed and roughness parameters:

```
offsetNormal(x, y) + offsetInverted(x, y) = etchDepth
```

This keeps lateral statistics and feature locations identical while flipping the vertical morphology.

Projects from versions <= 11 migrate to:

```js
{
  morphology: "stochastic",
  polarity: "inverted"
}
```

so existing files retain their previous appearance.

## Extension point

Future deterministic morphologies should use the same two-axis model instead of adding morphology-specific booleans:

```
morphology: stochastic | pyramid | cone | ...
polarity:   normal | inverted
```

For example, a future pyramid generator can support both normal pyramids and inverted pyramids without changing the project-level surface contract.
