# Suspended silica microdisk example candidate

Status: **staging only**. Do not register on the Welcome page yet and do not open a PR until the example project is packaged and reviewed.

Baseline: current `main`, which already contains PR #89 (isotropic release / undercut etch).

## Source reconstruction

Target structure: suspended spoked silica microdisk from Basiri-Esfahani et al., *Nature Communications* (2019), “Precision ultrasound sensing on a chip”.

Paper-reported geometry used by the reconstruction:

- outer disk radius: 148 µm
- inner disk radius: 82 µm
- thermal SiO₂ thickness: ~1.8 µm
- Si substrate released by selective XeF₂ etch

WaferCAD reconstruction parameters that are **not** reported by the paper:

- central hub radius: 55 µm
- spoke width: 10 µm
- spoke span: 180 µm
- isotropic release radius: 36 µm

These inferred values are chosen only to reproduce the visible suspended topology and central support. They must stay labelled as reconstruction parameters.

## Intended process flow

1. Si substrate
2. grow ~1.8 µm thermal SiO₂
3. photolithography for the spoked circular oxide structure
4. directional/selective oxide etch through the exposed field
5. resist strip
6. selective isotropic XeF₂ release of Si beneath the silica annulus/spokes
7. final suspended silica structure with a central Si pedestal and canonical air gap

## Acceptance already demonstrated

The release implementation was accepted before merge with:

- canonical Z gaps, not render-only voids
- suspended SiO₂ above deeper Si
- central Si support retained
- Directional Etch stops at the release void instead of jumping across air
- Implant fragments do not fill the physical release gap
- Section and 3D consume the same canonical released geometry
- project export/restore path accepted by the v14 schema
- Quality, UI smoke, product regression and KLayout compatibility green on PR #89

## Production-example plan

When promoted:

- create a dedicated `.wafercad` project under `site/examples/`;
- preserve a compact process history from oxide growth through release;
- save three useful presentation states: full overview, 3D release view, and A–B Section across the annulus + central pedestal;
- add a new literature family appropriate to MEMS / optomechanical / ultrasound devices rather than mixing it into the photodetector family;
- add structural example regression that asserts a true annular air gap and surviving center support.

No Welcome-page registration or CI-triggering PR is part of this staging step.
