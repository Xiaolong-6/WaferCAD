# TiO₂ metalens paper-derived reconstruction — experimental

Primary source: Wang et al., *Nature Communications* **12**, 5560 (2021), DOI [10.1038/s41467-021-25797-9](https://doi.org/10.1038/s41467-021-25797-9). Source of process details: Supplementary Note 4 in the published supporting information.

## What is source-supported

- NA 0.24 demonstrator, **30 µm** diameter, **4,725** TiO₂ nanopillars.
- Four fourfold-symmetric XY families: **circle, square, ring and bipolar concentric ring**.
- Substrate: glass with **13 nm ITO**; **1,500 nm TiO₂** e-beam-evaporated film.
- Spin coat **200 nm PMMA A2**; electron-beam lithography, development with MIBK/IPA; deposit **30 nm Cr** directionally and lift off PMMA plus unwanted Cr.
- RIE TiO₂ using patterned Cr as hard mask; strip Cr. Nominal pillars **1.5 µm** tall with near-vertical walls. Source reports **40 nm** minimum feature.

## What is illustrated, not reproduced

**The main article and supplied supplement do not disclose the full 4,725-site numerical XY/GDS mask and parameter assignment.** Accordingly the script outputs two distinct artifacts:

1. **Four-unit local 5 × 5 µm process project** with executable Recipe, Mask layer, material History and checkpoints from cleaning to final pillars. Its four XY sizes and positions are explicitly *illustrative*. The glass thickness shown (2 µm) is a visualization surrogate.
2. **30 µm / 4,725-site deterministic full-aperture GDS** and CSV: illustrates geometry, source-compatible families, hierarchical topology/annular voids and Mask IO performance. The positions use a golden-angle distribution and **are not the authors' optimized phase/group-delay assignment**. Optical achromatism and focusing efficiency cannot be inferred from this artwork.

The full-aperture GDS is intentionally a separate Mask artifact. The small, complete Process project can be **Run all** from Base; do not call this a full 4,725-site physical-process replay until the full layout has been coupled to the canonical-array process pipeline and tested.

## Build

```bash
npm ci
node scripts/build-tio2-metalens-example.mjs
# Outputs under test-results/metalens/:
#  * tio2-metalens-four-unit-process.wafercad
#  * tio2-four-unit-mask.gds
#  * tio2-30um-4725-sites-ILLUSTRATIVE.gds
#  * tio2-30um-4725-sites-ILLUSTRATIVE.csv
#  * reconstruction-report.json
```

No project database schema bump, no special case in the Kernel, and no optical physics functionality is introduced.
