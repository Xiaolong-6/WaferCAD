# Split-waveguide-crossing photonic MEMS — reconstruction candidate

## Scope and provenance

- Article: Yinpeng Hu *et al.*, **Silicon photonic MEMS switches based on split waveguide crossings**, *Nature Communications* **16**, 331 (2025), [DOI](https://doi.org/10.1038/s41467-024-55528-9).
- Sources supplied: main article, Supplementary Information, Source Data workbook, and peer-review file.
- Source manuscript: `s41467-024-55528-9.pdf`, especially Methods and Figures 1–3.
- Supplementary mechanical/photonic design: `41467_2024_55528_MOESM1_ESM.pdf`, especially Sections 2–4 and Figures S2, S6–S9.
- Source Data: `41467_2024_55528_MOESM3_ESM.xlsx`, measured/model curves; **not** original GDS/OAS.
- Peer-review file: `41467_2024_55528_MOESM2_ESM.pdf`; context only.

This staged project models a **representative elementary 2×2 switch**, not the entire 64×64 Benes network. Mask polygons are an explicitly **illustrative, dimension-constrained reconstruction**; the article does not release the photomask layout.

## Reported dimensions (physical micrometres)

| Component | Reported dimension | Source |
| --- | ---: | --- |
| SOI silicon device / BOX | 0.220 / 2.000 | Article Methods |
| Ridge partial / strip full etch | 0.150 / 0.220 | Article Methods |
| Evaporated Cr / Au electrodes | 0.050 / 0.300 | Article Methods |
| SWX optical / full switch footprint | 23×23 / approximately 95×100 | Article Fig. 3 / text |
| SWT pitch / lateral groove depth | 0.290 / 0.300 | Article Fig. 2, Supplement S2 |
| OFF / ON facet gap | 0.900 / 0.015 | Article Fig. 2, Supplement S2 |
| Input waveguide core / MMI width | 0.400 / 2.680 | Supplement S1/S6 |
| Folded spring beam width | 0.200 | Supplement S7 |
| Folded spring long/short beams; inter-beam clearance | 30 / 22 / 1.5 | Supplement S7 |
| Structural aligner beam length / beam width / truss | 7 / 0.1 / 1 | Supplement S7 |
| Shuttle mechanical width | 6 | Supplement Section 3 |
| Comb finger length / width / nominal gap | 3.200 / 0.500 / 0.300 | Supplement S9 |
| Electrostatic comb unit cells | 40 | Supplement Section 4 |

The 15 nm figure is **lateral separation** and must not be reinterpreted as a vertical film thickness. The 300 nm SWT depth is **in-plane tooth depth**, not an etch depth into the 220 nm silicon film.

## Explicit reconstruction assumptions

- Local computational XY window: **112×104 µm** with a 5 µm display surrogate for the handle silicon (the actual handle thickness is not reported in the article).
- Paper-inspired, simplified V-reflector, bends, waveguide meanders, aligner/anchor, folded spring, shuttle, and comb-finger **placement**. The published Figs. 1–3 and S2/S6–S9 do not define every contour, electrical contact or routing coordinate.
- **One manufactured device** with two restorable History Variants: OFF = 900 nm gap and ON = 15 nm gap. The original lithographic Mask, Process Recipe, and released BOX geometry are shared by both states. The 885 nm actuation is a post-release Si geometry surrogate with stationary anchors and parameterized flexure, not an electrostatic FEM solver or physical process Step.
- BOX release uses the existing kernel's material-selective **undercut** with an illustrative **2 µm lateral reach**. The paper reports HF-vapor removal, but not a calibrated lateral etch distance or rate.
- Electrode evaporation + lift-off is represented by patterned Cr and Au geometries, with process Records documenting the resist/lift-off stages.
- The mask named “150 nm ridge etch” contains representative transition areas; array-level interconnect is excluded from this single-unit model.
- Two **illustrative grating couplers** and their waveguide feed lines are drawn to illustrate optical input coupling. Their positions, sector arc radii, pitch and routing are **not source-authenticated**; no full four-port fiber interface, optical coupling efficiency or array topology is claimed.
- Two **mechanical stop pairs**, placed just outside the toothed reflector region, have their own fixed/movable silicon links. The 15 nm ON clearance and 900 nm OFF clearance are reported. Stop locations and pad dimensions are inferred, since no measured source layout is available.
- Structural aligner links and folded springs now use the reported 7 µm/0.1 µm aligner beam and 30/22 µm, 0.2 µm folded beams with 1.5 µm edge clearance. Their routing is an engineering illustration; no elastic equilibrium is computed.
- Known limitations: no exact 4-port optical routing/coupler mask, no optical FDTD or measured transmission calculation, no FEM deformation, no Si stiction/adhesion model, no released microstructure buckling, no original author GDS, no complete wafer packaging.

## Source-faithful process skeleton

1. Initialize a silicon-handle model (explicitly illustrative thickness).
2. Add a 2 µm buried SiO₂ layer and a 220 nm silicon device layer.
3. Record EBL patterning and perform the 150 nm ridge etch.
4. Record full-strip/MEMS EBL patterning and etch 220 nm of silicon **outside** the surviving device mask.
5. Record contact photolithography, pattern 50 nm Cr and 300 nm Au, and record lift-off.
6. Expose the patterned BOX through the device openings and execute selective **HF-vapor undercut** as a canonical material removal (not a fake transparent shader).
7. Check material ownership: silicon suspended at the test beam point, BOX absent below it, BOX retained under fixed anchors, optical air gap unfilled, and no mask mutation after pose activation.
8. Branch the released shared History into OFF and ON states within **one project**. Save a non-replayable ON pose inspection node and preserve the common Recipe, original Mask and fully restorable state history. The ON node must not masquerade as an etch/deposition step.

## Reproducibility and acceptance

Source of truth: `scripts/swx-mems-geometry.mjs` and `scripts/build-swx-mems-example.mjs`.

Run from the repository root:

```bash
npm ci
node --test site/tests/swx-mems-geometry.test.mjs
node scripts/build-swx-mems-example.mjs
```

The builder emits a single draft `swx-photonic-mems.wafercad` project (with OFF and ON Variants) and a `validation.json` in `test-results/swx-mems/`. `--write-repo` is intentionally reserved for a later **reviewed** example promotion, after visual/browser science acceptance.

The dedicated `SWX MEMS Reconstruction` CI workflow runs the parametric geometry/Variant tests, generates one unbundled project, imports it through UI v2, switches to the ON Variant, verifies canonical model/Mask equality, exports both GDS/OAS, exercises 3D, re-exports the entire project, and replays the **shared fabrication Recipe from new Base** on the relaxed OFF variant. CI also captures separate four-view screenshots of OFF and ON under `test-results/swx-mems/browser/`.

**Important:** Run All reconstructs the as-fabricated OFF geometry; it does not reproduce electrostatic ON movement. The ON state is a non-replayable, explicitly tagged post-release geometric pose stored in a restorable Variant. This reflects the capabilities of the current Kernel and avoids mislabelling actuation as a Process operation.

Still required before Welcome promotion: detailed visual comparison of both poses against article Figure 1 and Supplementary Figures S6–S9 (including connected shuttle/comb springs, mechanical stops, aligners and couplers); human inspection of the Section BOX undercut/anchors, and an external GDS/OAS interoperability review. The arrangement is illustrative wherever author coordinates are unavailable. **Do not merge, deploy, or register** this candidate automatically.

## Planned scale-up (separate gate)

The paper's 64×64 Benes network uses **352** elementary switch cells, **1824** waveguide crossings, and approximately **10 mm×5.3 mm** chip area (article Figure 4 and Supplementary Section 12). At array scale, use hierarchical Cells and canonical repeated parts where possible, with independently verified routing and waveguide-crossing geometry. The source-data workbook provides loss curves but does not contain the full routed GDS. No full-array scientific fidelity is claimed for this candidate.
