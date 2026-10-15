# Literature fidelity of bundled examples — 2026-10-14

> Review evidence for issue [#241](https://github.com/Xiaolong-6/WaferCAD/issues/241).
> Scope: the eight families in `site/bundled-examples.js`. The observations below
> describe read-only inspection of the original `main` fixtures and targeted
> changes on `audit/example-literature-fidelity-20261014`; historical CI runs
> do not establish paper-figure acceptance for this branch.

## What was inspected

- Photodetector, PERC, fully textured tandem and suspended microdisk:
  the actual serialized Process Recipe, saved History/Variant chains, captured
  Draw/File Mask selections, and final canonical XY/Z material intervals.
- M3D, MAGIC-1000, three-tier JLFET and TiO2 full array: the owned
  process generators, source-provenance notes and previous regression
  contracts. The four large published assets were not expanded or rerun
  in this inspection environment.
- The primary Methods of Basiri-Esfahani _et al._,
  [Nature Communications 10, 132 (2019)](https://doi.org/10.1038/s41467-018-08038-4),
  directly specify oxide, resist, BHF, a second protective resist coating,
  wafer separation, second resist removal and XeF2 release.
- Sahli _et al._, [Nature Materials 17, 820–826 (2018)](https://doi.org/10.1038/s41563-018-0115-4),
  establish a fully textured SHJ/perovskite tandem, including conformal
  coatings on micrometre pyramids. See the existing paper-derived fixture
  and its engineering assumptions for individual film thicknesses.

The new `site/tests/example-literature-fidelity.test.mjs` uses direct physical
material ownership probes rather than screenshot pixels. It tests a suspended
disk/pedestal/air-gap triad, the exposed Si at a rear PERC point-contact hole,
the retained oxide at an adjacent point and both front contact metals, the
Tandem active field versus a representative Ag finger, and Photodetector
branch-specific Implant/Electrical operation semantics.

## Result, assumptions and remaining scientific uncertainty

| Family                    | Verified material/process evidence                                                                                                                                                          | Remaining paper acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Black-Si/Ge photodiodes   | Both-face 650 nm initial oxidation, a front 50 nm ALD passivation layer, front/rear implants and source-order records; Ge A has one induced Electrical Region, Ge B has two                 | Validate Ge Fig. 15 attribution and captured Draw Masks against original lithography; compare protected ALD and contact strip in real Section/3D                                                                                                                                                                                                                                                                                                                                                  |
| Blakers PERC              | Source-order branch: 17 actions, 100 rear contact mask apertures; at a representative aperture, rear Al touches Si. Adjacent oxide separates Si from rear Al; front stripe has Ti-Pd and Ag | Compare Fig. 1 pitch and contact pattern; assumed oxide/contact thickness and `0.5 µm` implant depth are geometry proxies, not source diffusion models                                                                                                                                                                                                                                                                                                                                            |
| Sahli tandem              | 440 nm perovskite, 1 nm LiF, 110 nm IZO in active center; 120 nm Ag over IZO along a saved stripe; 100 nm MgF2 at that stripe. Front/back texture is deterministic appearance metadata      | **Resolved static questions:** IZO and Ag use different selected Mask Cells (`M01_IZO_ACTIVE` versus `M02_AG_GRID_SURROGATE`) despite matching layer-key lists. The narrow 230 nm Ag and 220/330 nm MgF2 Z intervals are explicitly tagged `conformal-sidewall`, spanning physical steps, and are not planar deposition-thickness errors. **Still P1:** fresh complete Run All material occupancy parity and independent source-figure mask/Section overlay, plus true-facet geometry limitations |
| Basiri-Esfahani microdisk | Real silica disk 1.8 µm thick, central Si pedestal and 36 µm released void at sampled annulus point, with Mask 1/0 and inverted BHF/XeF2 removal                                            | The paper's **protective resist recoat → mechanical separation → protective resist removal** is now explicit in M07, a single three-substep Record in History and Recipe; its temporary resist is not modeled. The 36 µm etch radius and reconstruction hub/spokes are not author-measured process parameters                                                                                                                                                                                     |
| Ghosh M3D                 | Builder covers Si PV, WSe2/MoS2 logic, graphene sensing, selective vias, conformal oxides and transfers                                                                                     | Full 3D/Section source panel comparison, buried via continuity, and no unphysical film inside void; routing masks inferred                                                                                                                                                                                                                                                                                                                                                                        |
| Fan MAGIC-1000            | Builder includes M4→M1 Al, tungsten vias, W gate/HfO2, MoS2/Sb-Au pair and AlOx D-mode surrogate                                                                                            | Only a local 40×24 µm device, not 1,433-transistor GDS; figure-aligned contact/via cross-section and CMP geometry review                                                                                                                                                                                                                                                                                                                                                                          |
| Lam three-tier JLFET      | Existing 40-step local/625-site template checks address three Si/HfO2 gate tiers, selective contact windows and two CMP stages                                                              | Validate original paper Fig. 3 separately from assumed 90 nm inter-tier spacing drawn from a different figure; transfer chemistry not modeled                                                                                                                                                                                                                                                                                                                                                     |
| Wang TiO2 metalens        | Published surrogate has 4,725 active sites, 9-step TiO2/ITO/PMMA/Cr/RIE flow, full-array reconstruction CI evidence at prior revision                                                       | 80×80 grid and nanopillar dimensions are illustrative; not the unpublished optimized optical GDS or a validated achromatic optical response                                                                                                                                                                                                                                                                                                                                                       |

**Physical fidelity distinctions**

1. `Rough`/`Pyramid` morphology records alter displayed appearance;
   they do not introduce true faceted material interfaces in the 2.5D Kernel.
2. An Implant or induced Electrical Region is a structural annotation, not
   dopant diffusion, activation, carrier-density or junction-electrostatics TCAD.
3. A recorded oxidation Deposit is a geometric surrogate: it neither consumes
   substrate silicon nor calibrates the oxide-growth reaction.
4. Paper-unreported Mask pitches, process depths and local ILD sizes must
   remain labeled **assumed** or **illustrative**. A valid exportable GDS
   is not evidence of the authors' GDS.

## Quantitative saved-geometry follow-up

- Black-Si source-order metal before strip: approximately
  `8.813 × 10^6 µm³` front Al. FINAL retains approximately
  `1.054 × 10^6 µm³` (12% of the original) while preserving the
  same `2.277 × 10^6 µm³` ALD Al2O3 volume. The intentionally
  destructive QA branch leaves approximately `1.295 × 10^6 µm³`
  ALD Al2O3, 57% of the protected baseline, and removes some Si.
  These results are calculated from serialized XY polygon footprints
  and actual Z intervals; the resulting scientific regression is
  `site/tests/example-literature-fidelity.test.mjs`.
- PERC: all 100 rear Mask `5/0` opening centroids in the saved
  canonical model have a direct Si–Al interface. The physical probe
  distinguishes front-side passivation from interposed back oxide;
  checking whether any oxide exists in the entire two-face stack
  would be an incorrect rejection.

These results establish consistency of **saved** models. Browser
`Rebuild Base → Run All` parity and original manuscript cross-section
correspondence are still separate required gates.

## Changes and reproducibility

The Microdisk M07 Record now names the protective recoat, dicing and
second strip in chronological order in its canonical History operation,
all restorable Recipe states, named Step bookmark and Welcome Preview.
All material geometries, mask figures, History node IDs, process revisions,
Variant ancestry and other parameters remain unchanged. The companion
preview digest is updated in
`tests/fixtures/project-io/example-thumbnails.json`.

Acceptance commands (from repository root with dependencies installed):

```sh
node --test site/tests/example-literature-fidelity.test.mjs
node --test site/tests/example-recipe-audit.test.mjs site/tests/example-structure.test.mjs
node scripts/maintenance/backfill-example-recipes.mjs --id=suspended-silica
node scripts/maintenance/sync-example-recipe-previews.mjs
npm run check:ci
```

The above commands specify the intended CI checks; they are **not claimed to
have run locally** in the GitHub-only inspection environment. The separate
browser acceptance should execute `scripts/example-recipe-runall-acceptance.mjs`
with every Variant and save exported projects, plus Section/3D images at
paper-aligned cuts. Treat a CI-green result as a software gate, not scientific
agreement with the original SEM.

## Full Recipe replay scientific gate extension

The browser `scripts/example-recipe-runall-acceptance.mjs` now invokes
`assertSameMaterialGeometry` for every scalar production literature
example, instead of only checking material names/counts outside the
MAGIC-1000 special case. Every material's actual unioned XY occupancy
is compared for each physical Z interval. Repeated layer names produced
by independent Front/Back deposits are grouped by material class
without requiring identical layer IDs. The same gate explicitly bounds
possible 0.1 nm XY storage quantization area from the source/rebuilt
footprint perimeter (maximum `25 µm²` per slab). This is a quantitative
tolerance, not an exemption for a missing material or Z interval.

Native arrays remain subject to their separate array-oriented site/
template contracts. A passed stored-model regression or a browser
completion report without `geometryComparison.verified` is not
sufficient evidence of **strict** scalar 2.5D replay fidelity.

Primary Sahli 2018 supplementary figure correspondence:

- **Fig. S2d–i:** conformal precursor and fully converted
  perovskite on Si pyramids; compare the film sequence at a ridge
  and valley, acknowledging that current canonical XY/Z geometry
  does not explicitly facet its silicon base.
- **Fig. S3a–c:** Section between top Ag fingers; target the saved
  active center `(0,0)`.
- **Fig. S3d–e:** Section at a grid finger; compare the saved
  `(0,2000)` probe with the Ag/MgF2/IZO sequence.
  The EDX Mg/F signal is seen in the grid-finger cross section:
  MgF2 over the Ag is therefore not, on its own, a demonstrated
  mismatch.
- **Fig. S5:** evaporated 400 nm PbI2 corresponds to roughly
  235 nm on pyramids after the morphology factor ~1.7 and
  approximately 440 nm of final perovskite. The recorded
  235 nm Deposit plus 205 nm Extend reaches 440 nm.

Source: [Sahli 2018 supporting information](https://media.springernature.com/original/springer-static/esm/art%3A10.1038%2Fs41563-018-0115-4/MediaObjects/41563_2018_115_MOESM1_ESM.pdf).
These are paper-panel targets, not completed screenshot overlays.

## Basiri-Esfahani 2019 Fig. 2a — paper-to-mask quantitative check

The [published Results and device micrograph](https://www.nature.com/articles/s41467-018-08038-4)
explicitly specify a spoked silica microdisk with an **outer radius of
148 µm**, **inner radius of 82 µm**, and **device thickness approximately
1.8 µm**. The saved `MICRODISK_RELEASE_MASK` sectors' actual XY vertices
reach **148.0000005 µm** and **81.9999996 µm** in radial distance;
the saved vertical oxide interval is **1.8 µm**. The regression checks
both radii across all four sectors, not merely the existence of a layer.

Paper Methods also prescribe thermally oxidized Si, photoresist,
UV lithography, buffered HF oxide patterning, first resist removal,
protective resist recoat for chip dicing, second resist removal,
and XeF2 gas Si undercut in precisely that order. These operations
are now represented by the saved Recipe and M07 narrative record.

**Limits:** the 36 µm XeF2 numerical release setting, the nominal
55 µm central mask hub, and the eight radial depth slices are engineering
reconstruction parameters. The source paragraph does not determine
these numerically. Fig. 2a is an SEM of a *similar* device, so matching
148/82 µm photomask design values must not be reported as full pixel-level
SEM overlay acceptance. A source-aligned cut and real browser screenshot
remain pending.

## Intermediate saved History vs independent Kernel replay

The Recipe browser acceptance now has an opt-in `--history-parity`
gate for the Microdisk, PERC source-order and Sahli Tandem. Following
a clean Base → Run All, it compares *each saved History step's*
model with the corresponding independently regenerated History step:
all material names, per-material XY unions and physical Z slabs, plus
Electrical Region metadata. Failure produces a per-step report under
`test-results/example-recipe-runall/*-history-parity.json` identifying
the first mismatched physical interval, without increasing tolerances
or overwriting the paper-derived asset. This is more stringent than
the existing final-state parity gate.

## Remaining implementation gates

1. **P1** — Tandem: compare Recipe-replayed canonical per-material occupancy
   with the published target and perform an original paper image/Mask/Section
   overlay. Distinct IZO/Ag Mask Cells and conformal-sidewall roles already
   explain the apparent matching layer-key lists and tall edge Z intervals;
   preserve these distinctions during replay. Avoid editing packed material
   slices or rewriting the Kernel solely to enforce a nominal sidewall Z span.
2. **P1** — PERC: evaluate all 100 rear contact openings and pitch with source,
   and verify the front metal/window alignment on distinct masks.
3. **P1** — Photodetector: validate Black-Si FINAL/QA selective Al removal and
   Ge A/B masks and electrical host after fresh replay.
4. **P1** — Large array replays and original paper figure comparisons for
   M3D, MAGIC-1000 and Lam JLFET. Track paper-supported versus inferred
   masks; sample multiple actual interfaces, not only thumbnail views.
5. **P2** — TiO2 metalens: preserve explicit illustrative-grid disclaimer;
   no scientific optical performance claim without a supplied optical
   phase/dispersion design.

No original article figures are copied into the repository by this change.

## 2026-10-15 reproducibility gate — exact PR head 87fd3543

The eight workflows recorded for commit `87fd3543c6b7e4d9625c96d63e17187381077dd4` **all completed successfully**: Quality (38699594881), Browser regression (38699594883), Example Recipe Reconstruction (38699594873), Both-face examples integration (38699594855), Native Fig3 full replay (38699594856), UI v2 D1 (38699594853), UI v2 Stage C/M4 (38699594854), and UI v2 Main/Mask/Mobile (38699594864).

The Both-face browser matrix individually passed PERC `gds-contacts` and `source-order`, Tandem `ito-control` and `ncsi`, and Photodetector `final` and `qa-overetch`, as well as fixture reproducibility. Recipe Reconstruction separately passed scalar Kernel Run All for Microdisk, PERC, Tandem, Photodetector/Ge A/Ge B, M3D, and three-tier JLFET. These are **software/geometry reconstruction** results, not independent matches to the publications.

Remaining evidence before scientific acceptance:

1. For each paper figure, record figure/panel, device coordinate, Section cut endpoints, expected material sequence, observed material sequence and deviation with explicit source-versus-assumption flags. Do not infer physical dimensional accuracy from an attractive 3D preview.
2. For PERC, match the entire rear aperture grid's pitch, contact-window mask and source illustration; distinguish source-provided values from the 100-site engineering reconstruction. For Tandem, verify ridge/valley and Ag-grid cross sections against Sahli supplement S2/S3/S5, with the planar 2.5D/facet approximation clearly labeled.
3. For Black-Si/Ge, review front/rear oxide, protected ALD and selective Al strip at intermediate as well as final states, and confirm original masks/Ge A/B attribution. For Microdisk, check the resist recoat/dice/strip chronology and release profile against paper figures; the resist transient remains record-only.
4. For M3D, MAGIC-1000 and three-tier JLFET, review local contacts, buried via ownership and CMP height at multiple real Section cuts; the simulator's subset is not the published full chip. For TiO2, explicitly retain the illustrative-grid and absent-optical-validation disclaimer.
5. Compare **intermediate** saved History and Variant nodes to stepwise Recipe replay at each physical operation, not merely final geometry; preserve pre-existing node IDs/revisions and shared ancestry. Capture independent Section/3D visual evidence for mismatches.

**Merge policy:** Do not merge on CI-green alone. Preserve this PR head for independent scientific/visual acceptance; request owner approval before merge.
