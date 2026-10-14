# M3D-LIME (Li et al., 2023): geometric reconstruction contract

**Source:** Y. Li et al., _Nature Communications_ **14**, 7140 (2023), DOI [10.1038/s41467-023-42981-1](https://doi.org/10.1038/s41467-023-42981-1).

**Builder:** `scripts/build-m3d-lime-example.mjs`; focus test: `node --test site/tests/m3d-lime-builder.test.mjs`.

**Scope:** first-pass, representative local **geometric** replay of a _fabricated M3D-LIME prototype_, not a transistor-level circuit simulator, original author GDS or a fully integrated/fully functional inference accelerator. Three functional tiers are required. The third tier contains both buffer and TCAM regions and **must not be counted as two separate tiers**.

## Source-mapped layer and process ledger

All lengths below are physical nanometres unless noted. The builder converts nm to internal micrometres. “Inferred” values are not fabrication claims.

| Tier               | Material/process                                                                                                | Source                        | Implementation / boundary                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Si CMOS            | 130 nm foundry process stopped at M4 with exposed W vias                                                        | Main paper p. 7, Methods      | 2 µm substrate surrogate; only patterned landing pads, not FEOL transistors or foundry routing                                      |
| CIM / analog 1T1R  | TiN BE 30 / HfAlOₓ RSL 8 / TaOₓ TEL 45 / TiN TE 30; HfAlOₓ ALD at 300°C                                         | Main pp. 3, 7, Fig. 2c        | Mask-local real film sequence; process temperature recorded in Step labels                                                          |
| CIM backend        | PECVD SiO₂ 400, W contacts + CMP, Al 500 BL, SiO₂ 100 / Si₃N₄ 900 + CMP                                         | Main pp. 7–8, Methods         | Film lengths sourced; CMP absolute Z values and local via/mask coordinates inferred                                                 |
| CNTFET             | Ti 10 / Pd 15 / Ti 1 gate; HfO₂ 10 at 250°C; wet transferred CNT; Ti 1 / Pd 45 source/drain                     | Main p. 8, Methods; SI Fig. 4 | Rectangular channel exactly 20 µm wide × 2 µm long in XY; tube film 1 nm _visual surrogate_                                         |
| CNTFET protection  | Y 10 nm naturally oxidized at 250°C to Y₂O₃; Al₂O₃ 35 / HfO₂ 10 at 250°C                                        | Main pp. 4, 8, Methods        | Oxidation as **Record**; Y₂O₃ geometry 10 nm surrogate, not predicted grown-oxide thickness                                         |
| Buffer / 2T2R TCAM | Pd BE / TaOₓ 20 / Ta₂O₅ 10 / Pt 10; Pd hard-mask 60; Al₂O₃ protection 45 at 150°C; Ti 20 / Pd 120 interconnects | Main pp. 4, 8, Methods        | One top-tier process for both buffer and TCAM; Pd hard-mask and dry etch are **Record** because surviving final mask is unspecified |

For detailed source circuit topology see **main Fig. 1b–3** and **Supplementary Fig. 1, 4 and 6**. The 1k-bit CIM in Fig. 2 has 8 BL × 128 SL, and a 512-bit 1T1R buffer is stacked in the third tier alongside the fabricated 5 × 1 2T2R TCAM. The generator preserves these as _documented design context_, with **eight analog CIM sites, four digital buffer sites and all five local TCAM cells** explicitly materialized. It must never claim to materialize the full 1k+512-bit arrays.

## Unpublished/assumed information

- The authors' precise GDS/OASIS, unit pitches, full M4 logic layout, pad shapes, local via XY alignment, metal routing, and full-chip placements are **not supplied** by the article or supplement. The exported layout is an illustrative geometric inference with eleven intentionally named Mask layers.
- The paper provides a structural TEM, but no complete transistor-by-transistor CMOS process stack. The 2 µm Si body is a visualization device; it is not a reported CMOS substrate thickness.
- CMP target planes at Z = 1.25, 1.43, 2.20 µm are geometric closure assumptions, measured from the reconstructed 2 µm base; they are **not** literature metrology.
- Dense CNT nanotube film morphology and CNT/oxide electrostatics are not simulated. Thin CNT is represented as a contiguous 1 nm film solely for inspecting material ownership.
- Y oxidation chemistry and possible volume expansion are **not** simulated by the Process Kernel.
- CIM-to-buffer _electrical interlayer via connections_ are not geometrically proven. The paper's Fig. 1b itself omits these ILVs. Their fabrication is recorded, while local device examples remain physically distinguishable.
- The fabricated prototype relies on **off-chip** ADC/programming/read circuitry, with no on-chip TCAM sense amplifier; do not insert those as fabricated structures. See paper discussion and public peer review file (reviewer 1 responses 1/5).
- Hardware accuracy, Hamming-distance, CNN execution time and energy-efficiency values are from measurements combined with system-level simulation. WaferCAD models **geometry** and cannot recalculate those metrics.

## Generation and acceptance

Run on a checkout of the feature branch:

```bash
node scripts/build-m3d-lime-example.mjs
node --test site/tests/m3d-lime-builder.test.mjs
node scripts/build-m3d-lime-example.mjs --write-repo
npm run check
```

`--write-repo` deterministically generates the committed `site/examples/m3d-lime-rram-cntfet.wafercad`. The generator validates each material stage with the real Process Kernel, recipe preflight, project schema and a storage round-trip before writing. The dedicated CI workflow also loads the file into the real UI v2 Chromium Workstation, runs the full 49-Step Recipe from a fresh Base and exports and reopens the resulting project. This is a representative geometry acceptance, **not** full-array or exact-layout verification. Do not add this family to `site/bundled-examples.js` or claim it is deployed before the remaining source/visual/release gates are satisfied.

The builder now asserts that inferred M4 W and CIM TiN contacts remain exposed after selective etch and CMP. Browser project Open, actual Recipe `Run All`, and project Export/Reopen passed on the representative local device in the [M3D-LIME acceptance run](https://github.com/Xiaolong-6/WaferCAD/actions/runs/38532631408). Next, inspect physical Sections through both analogue and digital cells, verify GDS/OAS mask export and local wiring continuity, and consider canonical array translation to reconstruct the complete 1Kb CIM / 512-bit Buffer only after bounding the runtime. Dedicated Section/3D visual acceptance, accurate inferred routing, full-array replay and a real preview/thumbnail remain **unpassed publication gates**.

## Working branch and status

- Branch: `feat/m3d-rram-cntfet-lime-20261014`.
- Committed deliverables: source ledger, real Kernel builder and regression, eleven inferred mask layers, editable 49-Step Recipe / 50 History nodes with nine bookmarks, and the generated representative `.wafercad` asset.
- Dedicated Kernel and UI v2 Chromium acceptance passed for the local sample; the complete CI Quality gate and desktop/human visual acceptance are tracked separately on Draft PR [#226](https://github.com/Xiaolong-6/WaferCAD/pull/226).
- No proof of full array connectivity, original lithographic coordinates, device performance or electrical simulation is claimed.
