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

| Family                    | Verified material/process evidence                                                                                                                                                          | Remaining paper acceptance                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Black-Si/Ge photodiodes   | Both-face 650 nm initial oxidation, a front 50 nm ALD passivation layer, front/rear implants and source-order records; Ge A has one induced Electrical Region, Ge B has two                 | Validate Ge Fig. 15 attribution and captured Draw Masks against original lithography; compare protected ALD and contact strip in real Section/3D                                                                                                                                                                                                                                                                                             |
| Blakers PERC              | Source-order branch: 17 actions, 100 rear contact mask apertures; at a representative aperture, rear Al touches Si. Adjacent oxide separates Si from rear Al; front stripe has Ti-Pd and Ag | Compare Fig. 1 pitch and contact pattern; assumed oxide/contact thickness and `0.5 µm` implant depth are geometry proxies, not source diffusion models                                                                                                                                                                                                                                                                                       |
| Sahli tandem | 440 nm perovskite, 1 nm LiF, 110 nm IZO in active center; 120 nm Ag over IZO along a saved stripe; 100 nm MgF2 at that stripe. Front/back texture is deterministic appearance metadata | **Resolved static questions:** IZO and Ag use different selected Mask Cells (`M01_IZO_ACTIVE` versus `M02_AG_GRID_SURROGATE`) despite matching layer-key lists. The narrow 230 nm Ag and 220/330 nm MgF2 Z intervals are explicitly tagged `conformal-sidewall`, spanning physical steps, and are not planar deposition-thickness errors. **Still P1:** fresh complete Run All material occupancy parity and independent source-figure mask/Section overlay, plus true-facet geometry limitations |
| Basiri-Esfahani microdisk | Real silica disk 1.8 µm thick, central Si pedestal and 36 µm released void at sampled annulus point, with Mask 1/0 and inverted BHF/XeF2 removal                                            | The paper's **protective resist recoat → mechanical separation → protective resist removal** is now explicit in M07, a single three-substep Record in History and Recipe; its temporary resist is not modeled. The 36 µm etch radius and reconstruction hub/spokes are not author-measured process parameters                                                                                                                                |
| Ghosh M3D                 | Builder covers Si PV, WSe2/MoS2 logic, graphene sensing, selective vias, conformal oxides and transfers                                                                                     | Full 3D/Section source panel comparison, buried via continuity, and no unphysical film inside void; routing masks inferred                                                                                                                                                                                                                                                                                                                   |
| Fan MAGIC-1000            | Builder includes M4→M1 Al, tungsten vias, W gate/HfO2, MoS2/Sb-Au pair and AlOx D-mode surrogate                                                                                            | Only a local 40×24 µm device, not 1,433-transistor GDS; figure-aligned contact/via cross-section and CMP geometry review                                                                                                                                                                                                                                                                                                                     |
| Lam three-tier JLFET      | Existing 40-step local/625-site template checks address three Si/HfO2 gate tiers, selective contact windows and two CMP stages                                                              | Validate original paper Fig. 3 separately from assumed 90 nm inter-tier spacing drawn from a different figure; transfer chemistry not modeled                                                                                                                                                                                                                                                                                                |
| Wang TiO2 metalens        | Published surrogate has 4,725 active sites, 9-step TiO2/ITO/PMMA/Cr/RIE flow, full-array reconstruction CI evidence at prior revision                                                       | 80×80 grid and nanopillar dimensions are illustrative; not the unpublished optimized optical GDS or a validated achromatic optical response                                                                                                                                                                                                                                                                                                  |

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
