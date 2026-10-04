# Suspended spoked silica microdisk — process-flow provenance

## Mask

- file: `microdisk_release_mask.gds`
- cell: `MICRODISK_RELEASE_MASK`
- layer/datatype: 1/0
- SHA-256: `fc9bf4343e43005dfdc8ff28e5fa50c2f6c950baf3e9a68fbc71ef81c4cde0d3`
- meaning: photoresist-protected region / SiO₂ retained after BHF
- outer radius 148 µm; inner radius 82 µm
- 55 µm hub radius, 10 µm spoke width and 180 µm spoke span are WaferCAD reconstruction choices

## Process

1. Create local Si validation substrate, 400 × 400 × 80 µm.
2. Deposit 1.8 µm thermal SiO₂ on Front, Directional.
3. Record photoresist coating.
4. Record UV lithography using GDS 1/0 retained region.
5. Etch exposed thermal SiO₂, Directional and material-selective, with a 2 µm clearing budget.
6. Record acetone resist strip.
7. Record protective resist / dicing / protection removal.
8. Etch Base Si using Isotropic release, Front, Whole face, Radius 36 µm.
9. Record the final suspended spoked silica microdisk.

Paper-derived inputs are Si substrate, 1.8 µm thermal SiO₂, UV lithography, BHF oxide removal, acetone strip, dicing, XeF₂ selective release, and 148/82 µm outer/inner radii. The local model bounds and 36 µm release radius are reconstruction parameters.
