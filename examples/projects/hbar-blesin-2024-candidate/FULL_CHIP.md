# Full-chip Chip2 author-GDS model

This is a complete 5 mm chip alternative to the 130 × 150 µm HBAR ROI.
The old ROI remains for detailed experimental release illustrations. This
full-chip model is not a calibrated digital twin.

## Author source provenance

- Paper: Blésin et al., Nature Communications 15, 6096 (2024),
  DOI https://doi.org/10.1038/s41467-024-49467-8
- Original data: https://doi.org/10.5281/zenodo.10965620
- GDS source: ChipLayout/D76_33_F2_Chip2.gds
- Source SHA-256: f76cc5217b1024dcd0f68b168f2fb67d6c57560bba3a604652d84257d10e3423
- Original cell: Chip2, 9,646 polygons, 1 nm GDS database unit
- Absolute source bounds (µm): x [-5030, -30], y [5090, 10090]
- Physical XY footprint: 5,000 × 5,000 µm

| Original GDS layer | Polygons |
| --- | ---: |
| 2 | 488 |
| 3 | 732 |
| 4 | 1,748 |
| 6 | 1 |
| 8 | 2,684 |
| 9 | 244 |
| 11 | 488 |
| 12 | 3,017 |
| 13 | 122 |
| 14 | 122 |
| **Total** | **9,646** |

The new full-chip builder preserves all author polygons, layer IDs, datatypes,
and vertices. It translates the coordinate origin to the geometric chip center
but does not crop, trace, duplicate, scale, or simplify any original mask shape.
The reversible original-to-local offset is retained as source provenance.

## Reproducible build

Run with the original downloaded GDS and locked project dependencies:

    npm ci
    node scripts/build-hbar-full-chip-example.mjs --source /path/to/ChipLayout/D76_33_F2_Chip2.gds --output test-results/hbar/hbar-chip2-full-author-mask.wafercad

The output is a native WaferCAD project plus an explicit provenance report.
The original 5.7 MB GDS input is not checked in to this repository.

## Model scope

The complete Mask is exact author geometry. The full-chip 3D model is a
disjoint 2.5D partition with a 525 µm starting Si wafer and a provisional
SiO2/Si3N4/Mo/AlN/Mo stack. Three **unverified** role assignments supply
physical material masks: layer 8 (Si3N4), layer 9 (oxide openings) and
layer 11 (common assumed bottom/top electrode plus AlN footprint).

The remaining source layers are retained in Mask but are NOT given invented
material/process meanings. In particular, no fictitious XeF2 cavity,
through-wafer DRIE, Damascene relief, release kinetics, feedline, separate
electrode mask, or active acoustic/optical simulation is included.

This full-chip final-state model does NOT claim the ROI candidate's 11-step
replayable process or History. Native Mask/Main/Section/3D performance, exact
Open/Save/Recovery and independent full-chip screenshots must be verified
before replacing the published Welcome example. A successful file conversion
does not by itself establish native visual acceptance.
