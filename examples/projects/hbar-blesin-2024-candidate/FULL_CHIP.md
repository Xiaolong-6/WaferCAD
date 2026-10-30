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
SiO2/Si3N4/Mo/AlN/Mo stack. Provisional role assignments use
layers 2 and 3 (1 µm optical bus/taper candidates), 8 (Si3N4 ring
candidates), 9 (oxide-opening candidates) and 11 (assumed Mo/AlN/Mo footprint).
These are layout-based interpretations, not author-certified layer purposes.

The remaining source layers are retained in Mask but are NOT given invented
material/process meanings. In particular, no fictitious XeF2 cavity,
through-wafer DRIE, Damascene relief, release kinetics, feedline, separate
electrode mask, or active acoustic/optical simulation is included.

This full-chip final-state model does NOT claim the ROI candidate's 11-step
replayable process or History. Native Mask/Main/Section/3D performance, exact
Open/Save/Recovery and independent full-chip screenshots must be verified
before replacing the published Welcome example. A successful file conversion
does not by itself establish native visual acceptance.

## Dense GDS layer display (view-only)

Layer 2 comprises 488 original, predominantly one-micrometre-wide rectangles.
They are physical source polygons; do not discard or merge them into an
invented material layer. Layer 12 contains 3,017 fractured/overlapping GDS
polygons. Drawing a stroke around each polygon creates nonphysical internal
seams, and filling each with opacity independently darkens overlaps.

The full-chip project therefore selects **12/0 only** by default,
hides the provisional structure background in the Mask view, and opts layer
12 into an **additive, once-per-layer Canvas silhouette fill**. The nonzero
fill rule normalizes individual polygon winding, so opposite orientations do
not erase overlaps. This is a raster presentation operation, not a change to
source Mask polygons, Process area semantics, GDS export, or exact 3D owner.
Other checked layers still use the ordinary renderer and remain selectable.

Source GDS geometry may contain self-intersecting boundaries; they remain
unaltered and require separate author-purpose/topological review before
being promoted into material process geometry. No unverified material meaning
is assigned to layers 2 or 12.

## Layer-purpose evidence review (2026-10-30)

The source-GDS mask has ten layers, but a GDS number does not imply a
material. The authors explicitly report 1 µm straight Si3N4 bus waveguides,
2.1 µm ring waveguides, SiO2 release holes and 12/14 µm electrodes in the
paper Methods. The following remain geometry-based *candidates*:

| GDS | Source polygons | Physical interpretation | Evidence level |
| --- | ---: | --- | --- |
| 2 | 488 | 1 µm straight optical routing candidate | inferred from dimensions/connectivity |
| 3 | 732 | bent/taper optical routing candidate | inferred from continuity with L2 |
| 4 | 1,748 | unknown fine lithographic structures | not assigned |
| 6 | 1 | exact 5 mm square chip outline | geometric identity |
| 8 | 2,684 | Si3N4 microring candidate | inferred from ring morphology |
| 9 | 244 | oxide release openings candidate | inferred from location/count |
| 11 | 488 | piezoelectric actuator footprint candidate | inferred from arc geometry |
| 12 | 3,017 | broad mask field with interconnecting voids | geometry only; not a material |
| 13 | 122 | repeated ~100 µm local structures | unknown |
| 14 | 122 | repeated ~12 µm structures | unknown |

The full-chip 3D presentation therefore includes L2+L3+L8 as an
**inferred Si3N4 optical-routing union**. The remaining layers are
retained in the original Mask, not coerced into guessed process materials.
This is not a completed author-verified full-chip Recipe.

## Topology-correct Layer 12 visual silhouette

The 3,017 native Layer 12 polygons contain 8 self-intersections and many
overlaps. Their topological Boolean union has 23 connected components with
131 genuine internal holes (Shapely 2.1.2 reference on the original GDS).
The previous per-polygon fill-without-stroke approach could still leave
invalid-ring artifacts or misrepresent holes. The builder now creates a
**premerged, read-only silhouette**, retaining all original source elements,
and the Mask painter fills this with the even-odd winding rule in one call.
It never uses the derived silhouette for Process, export, 3D materials or
geometry ownership. Union runs at build time, *not on zoom or pan*.

### Screenshot root-cause distinction

On the simultaneous `2/0 + 12/0` Mask view, the long green
horizontal 1 µm traces are genuine **Layer 2** GDS polygons. Layer 12 is
the blue mask field. The cross-layer green traces must not disappear from
GDS export or the editable source. The default view now selects only L12,
so its fractured blue polygon edges can be inspected independently; an
optional filled-only L2 style suppresses artificial 1-pixel polygon strokes
when the user enables the real traces.

### Full-chip spatial overlay audit

The 122 repeated-device pattern is measurable in the exact GDS (not a
confirmed lithographic run-card mapping):

- L8, L9, L11, L13, and L14 each form exactly **122** disconnected source-mask
  clusters after geometry union; counts per individual source layer differ
  because GDS drawing boundaries have been fractured.
- L8 intersects L11 across approximately **72.2% of L8's footprint**, while
  L9 and L8/L11 do **not** overlap in XY. This is compatible with a peripheral
  actuator around the optical ring and separate oxide-release openings, but
  by itself does not identify separate top/bottom electrode masks.
- L2 and L3 each consist mostly of 1 µm features and do not overlap in
  area; their end-to-end geometric continuity makes a combined optical
  routing **candidate** reasonable, not proven.
- L11 lies wholly inside the large L12 region in XY. This does **not**
  prove L12 is an electrode or deposited film; the layer could be an
  inverted/coverage mask. GDS polygons alone carry no deposition polarity.
- L4 contains 1,748 disconnected small regions, and L13/14 each have 122
  clusters. These remain unassigned until a layer legend, original design
  script, or mask process record substantiates their meaning.

The figures are derived from planar polygon sets; their percentages are
not measured process tolerances or 3D overlap volumes. **Do not** assign
L4/L12/L13/L14 a physical material merely to maximize the modeled layer
count.
