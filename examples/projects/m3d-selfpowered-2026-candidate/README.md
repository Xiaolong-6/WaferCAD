# M3D self-powered heterogeneous IC — reconstruction candidate v2

Paper: **Monolithic three-dimensional integration of heterogeneous electronics for self-powered sensing and processing**, Nature Electronics 9 (2026), 775–787.

This folder is a **paper-reconstructed** WaferCAD mask/recipe package, not the authors' original GDS. The paper publishes the process sequence, material stack and critical dimensions, but not the complete mask polygons.

## Corrections from the first reconstruction audit

- PVM M01 polarity is explicit: black means etch/remove and leaves a 20 × 20 µm Si island.
- Tier-1 Pt rails include full 5 × 5 µm landing pads under the 5 × 5 µm vias.
- HfO₂ contact openings are aligned inside local gate islands.
- WSe₂ and MoS₂ channel masks use published LCH = 0.2 µm and WCH = 0.5 µm.
- Comparator metal has real XY overlap with WSe₂ landing metal, the lower power-via footprint and the central data-via footprint.
- Graphene metal has real XY overlap with both power-via footprints and the central data-via footprint.

## Coordinates and polarity

- PVM masks use a 30 × 30 µm unit cell.
- M3D masks share one 28 × 18 µm representative-cell coordinate system.
- One SVG viewBox unit equals 1 µm.
- Black polygons are operation regions. For etch/open masks black is removed/opened; for additive masks black is deposited.

The package is intended for process/geometry regression and visual reconstruction. Exact comparator routing remains an inference from the published schematic/SEM.
