# WaferCAD project examples

This directory keeps project fixtures that are useful for regression and development review.

## Production bundled example families

The Welcome page is driven by `site/bundled-examples.js`. Public, editable bundled examples live under `site/examples/` and should be grouped by **device/application family**, not one card per paper.

The current literature family is:

- `site/examples/photodetector-literature-examples.wafercad`
  - **Black-Si Fig. 1a** common process
    - FINAL · protected active ALD
    - QA · overetch
  - **Ge Fig. 15** common nanostructured Ge
    - A · full-area Al₂O₃
    - B · inactive SiO₂/Al₂O₃
    - induced p-type inversion / n-type accumulation are stored as first-class Electrical Regions, not Implant placeholders

The family project opens on the Black-Si FINAL Variant while retaining the complete restorable Variant tree. This structure is intentional: future examples should normally add a new family project (for example solar cell, MEMS, MOS, microfluidic) rather than adding one Welcome card for every publication.

## Black-Si photodiode regression fixture — ACS Photonics 2023

`black-si-photodiode-acs-photonics-2023.wafercad` is the recovered process project supplied during the rough-surface regression investigation.

It remains here as a regression fixture and is not the Welcome-page production copy.

Regression value:

- rough black-Si surface;
- front B implant following the rough entry surface;
- conformal ALD Al₂O₃;
- front/rear metal;
- selective metal strip that re-exposes a pre-existing rough conformal interface;
- snapshots covering the fabrication sequence.

The stored copy repairs the already-corrupted re-exposed Al₂O₃ surface metadata in the recovered project so that the final state matches the intended process topology. The kernel regression prevents the same corruption from being produced by future edits.
