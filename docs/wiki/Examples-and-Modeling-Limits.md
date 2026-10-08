# Examples and Modeling Limits

[Home](Home) · [Process Operations](Process-Operations)

## Bundled examples

The Welcome screen contains editable example devices. The reconstructed photodetector project includes two literature-inspired families:

**Black-Si photodetector (Setälä 2023):** Si wafer, front SiO₂ mask, patterned window, schematic ICP-RIE roughness, B/P implant markers, oxide/Al₂O₃ and Al contacting, and non-geometric anneal records.

**Ge photodetector (Liu 2025 and 2026 thesis Fig. 15):** Ge substrate, SiNₓ implantation mask, contact-ring annotation, nanostructured Ge etch, chemical-clean records and alternate dielectric/contact structures. Fabrication branches can be kept as Variants.

Some layout widths, morphology heights, and inferred process masks in these examples are illustrative reconstruction assumptions, not exact published fabrication dimensions. Inspect individual Step metadata before treating a structure as experimentally sourced.

## What WaferCAD computes

WaferCAD evaluates **mask-conditioned 2.5D material geometry** using vector XY domains and Z stacks. It supports genuine buried interfaces, through-voids, conformal walls, and geometric undercut/release. Main, Section and 3D consume consistent geometric facts.

## What WaferCAD does not compute

It does not predict real ALD/sputter transport, etch rates, implantation profiles or activation, electrical fields, carrier transport, device I–V or optical responsivity. Rough/Pyramid is render-only surface morphology. Implant and Electrical Region are user-defined annotations; annealing and cleaning Record steps are process metadata without physical reaction simulation.

Use WaferCAD to explain structure sequences, review masks, teach process concepts and document design intent. Use calibrated physics tools or experiment to claim process yield or electronic/optical device performance.

## Research provenance

- Setälä et al., *ACS Photonics* (2023), DOI: 10.1021/acsphotonics.2c01984.
- Liu et al., *Light: Science & Applications* (2025), DOI: 10.1038/s41377-024-01670-4.
- For process assumptions and QA acceptance, consult [the reconstruction handoff](https://github.com/Xiaolong-6/WaferCAD/blob/main/docs/PHOTODETECTOR_RECONSTRUCTION_V2_2026-10-08.md).
