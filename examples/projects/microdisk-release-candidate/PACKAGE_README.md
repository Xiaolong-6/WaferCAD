# Supplied reconstruction package

Source package: `Microdisk_BasiriEsfahani2019_package.zip`

SHA-256: `8c06054cd1172d0ca177e931fcb9b152601a920694364ce9b132d3f669930dea`

The supplied package contains a WaferCAD v14 project built through the real browser UI on build `0fab3c0`, the original mask GDS, process-flow provenance, an export/round-trip audit, and review screenshots.

## Project identity

- project: `Microdisk_BasiriEsfahani2019_Fig2.wafercad`
- SHA-256: `b155dd0624c92c18fa329b1e2b1dfc6b737cb589f2a025159b0369dba5d792da`
- 1 branch
- 9 process nodes
- 9 bookmarks
- final process revision 9

The flow is linear: silicon substrate → 1.8 µm thermal SiO₂ → resist/lithography records → selective oxide pattern etch → resist strip/dicing records → 36 µm isotropic Si release → final suspended structure.

## Package acceptance evidence

The supplied audit records:

- 72 sampled annulus points with a real canonical air gap;
- sampled air-gap range 13.5–36 µm;
- center Si pedestal touching the oxide at z = 40 µm;
- preserved 1.8 µm oxide thickness;
- successful UI import and restore of M05 and M09;
- project round-trip preservation of model, layout, history, and bookmark identity.

The 36 µm release radius, 55 µm hub radius, 10 µm spoke width, 180 µm spoke span, and local 400 × 400 × 80 µm validation volume are reconstruction choices, not paper-reported fabrication dimensions.
