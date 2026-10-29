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
3. Deposit a temporary 1 µm photoresist film on Front (modeling assumption; not a reported thickness).
4. Model UV lithography and ideal positive-tone development by selectively removing PR from the inverted GDS 1/0 footprint. The retained spoked disk region remains physically coated with PR; exposure chemistry is not simulated.
5. Directionally etch only exposed thermal SiO₂ across the Full face with a 2 µm clearing budget. Remaining PR physically masks the oxide below it; the GDS mask is **not** applied again to the oxide.
6. Remove the first PR with a full-face material-selective etch (ideal acetone-strip geometry).
7. Deposit a second, temporary 1 µm protective PR coating over the patterned surface.
8. Record dicing as a non-geometric operation on the local 400 × 400 µm crop.
9. Strip the second protective PR before release.
10. Etch Base Si using the published Continuous circular release mode with the original inverted GDS 1/0 footprint and 36 µm assumed lateral/vertical reach; the historical baseline retains the older isotropic mode.
11. Record the final suspended spoked silica microdisk.

Paper-derived inputs are Si substrate, 1.8 µm thermal SiO₂, UV lithography, BHF oxide removal, acetone strip, dicing, XeF₂ selective release, and 148/82 µm outer/inner radii. The local model bounds, both 1 µm PR coating thicknesses, and the 36 µm release radius are reconstruction parameters. Photoresist layers remain addressable historical material entities after strip, but there is no surviving polymer solid in the final model.
