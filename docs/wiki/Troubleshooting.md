# Troubleshooting

[Home](Home) · [Getting Started](Getting-Started)

![Schematic of conformal coverage](https://raw.githubusercontent.com/Xiaolong-6/WaferCAD/main/docs/wiki/assets/process/deposit-conformal.svg?sanitize=true)

*For coating problems, first compare the displayed Section against this idealized before/after illustration.*

**Why does Apply change the wrong part?** Check File/Draw mask source, selected Cells and Layers, Selected versus Invert mask, active Front/Back face and Mask ROI. Main ROI affects 3D inspection, not Process.

**Why is the conformal shell wider in Section?** Section Auto may exaggerate Z; switch to 1:1 to inspect physical dimensions. Conformal sidewall bands have physical XY offsets equal to thickness, not the display Z scale.

**Why is there no sidewall material after Directional?** Directional coating is limited to exposed horizontal faces; choose Conformal for true sidewalls.

**Why does Release remove material outside the opening?** Isotropic release and Undercut deliberately grow the lateral removal front. Choose Directional Etch if you want a vertical-only footprint.

**Why does a rough or pyramidal etch look different in Section and 3D?** Both views sample deterministic appearance metadata, while 3D uses adaptive mesh detail. They do not alter the ideal material stack. Inspect Quality and ROI for local detail.

**Why doesn't Record annealing grow oxide or change dopant distributions?** Record only stores chronological metadata. WaferCAD does not solve thermal or chemical reactions.

**Why is an implant hidden in opaque 3D?** It is an internal annotation. A 3D ROI cut through the implant can expose its colored cut face; transparency can show the inner annotation volume.

**Why does the current project vanish in another browser?** Save stores checkpoints in the current browser profile only. Export `.wafercad` for portable backup.

**Why does a reused Recipe alter geometry again?** Recipe execution applies each operation to its current starting model. Rebuild the Base first to obtain a fresh lineage.
