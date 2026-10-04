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

## Welcome preview contract

Every Welcome example card should use a **representative screenshot from the real WaferCAD UI**. Literature examples must not use a schematic branch diagram, generated illustration, or paper figure as their primary card image.

- Store compact delivery assets under `site/example-previews/`; retain the original capture in the candidate/review package when available.
- Prefer a stable final or diagnostically useful restored state that makes the device recognizable at card size. Overview screenshots with Main / Mask / 3D / Section are preferred; a focused 3D or Section view is acceptable when that is the defining geometry.
- Cropping, resizing, and JPEG/WebP compression are presentation-only. Do not redraw or synthesize the device for the Welcome card.
- Define preview path, alt text, caption, and optional object position in `site/bundled-examples.js`. The renderer falls back to the legacy generated preview only when an example has no screenshot metadata.
- Screenshot pixels are presentation assets, not regression truth. Structural/process invariants remain the acceptance contract.

## Regression contract

Bundled examples are production acceptance fixtures, not presentation-only files.

`site/tests/example-regression.test.mjs` validates every restorable literature Step and Variant HEAD against the current project schema and renderer-facing geometry. It also locks the known high-value process invariants:

- Black-Si FINAL strips most blanket front Al without removing the protected ALD;
- front roughness remains on Front and cannot ghost onto Back;
- the QA overetch branch remains intentionally destructive;
- Ge Fig. 15 A/B keeps real B/P implants as Implant while induced inversion/accumulation remain Electrical Regions;
- Electrical Regions remain constrained to their original Ge host material.

`scripts/example-regression.mjs` complements this with a real Chromium path: open the bundled family from Welcome, switch Variants, restore representative Steps, and require the 3D scene/model/process revision to settle on the restored state.

When a new example family is added, add family-specific structural invariants here rather than relying only on screenshots. Pixel-perfect screenshots are deliberately not the primary contract because renderer and typography changes should not invalidate correct process topology.

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
