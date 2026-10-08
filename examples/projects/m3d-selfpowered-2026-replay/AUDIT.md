# M3D corrected kernel full replay - 2026-10-08

Base: fix/photodetector-reconstruction-v2

Replay branch: fix/m3d-conformal-microcracks-20261008

The project was rebuilt directly through the current Process Geometry Kernel from S00 through S26 using the committed corrected v2 masks. The browser Process UI is not part of this reconstruction path.

Acceptance results:

- 27 named stage bookmarks from 00_SOI through 26_Final_Sensing_Windows.
- WSe2, MoS2 and graphene Follow-surface transfers have zero canonical support gap.
- S25 70 nm conformal Al2O3 completed successfully.
- S26 removes only the final Al2O3 layer; all non-target layer volumes are unchanged within numeric tolerance.
- Graphene remains present at every sampled sensing-window overlap.
- Lossless WaferCAD project storage reopens with exact canonical-model equality.
- Compact 0.1 nm export is still blocked by a persistence-grid geometry issue: Project cannot be stored safely at 0.0001 µm precision: Invalid project: model.regions[60].geom overlaps model.regions[58].geom.

Scientific boundary: the mask package is a paper-derived reconstruction. Exact unpublished routing polygons are not claimed to be the authors original layout.
