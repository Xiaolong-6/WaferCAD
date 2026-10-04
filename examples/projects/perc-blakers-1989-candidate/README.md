# PERC / Blakers 1989 example candidate

Status: **staging only**. This branch is intentionally not wired into `site/bundled-examples.js` and is not opened as a PR yet.

Baseline: `main@0fab3c05e5adc1691775519332be3553dc4fb33e`.

## Supplied reconstruction package

Source package supplied for review:

- `PERC_Blakers1989_reconstruction_package.zip`
- SHA-256: `c5e72f2f206c089ad95491b006dd96f7598a1899a27e507f5c50582c062f98de`
- Candidate project: `PERC_Blakers1989_Fig1.wafercad`
- Project SHA-256: `e56e10e938e940558f189cf650eb3886d3fa393563327c0df5ab2ac4d7018773`
- Mask GDS SHA-256: `9de5edbcbbb6f580e62441aff1c22340347356400faf05a043278edb6c21ed41`

The project is WaferCAD schema v14 and contains 6 branches, 40 process nodes, 40 bookmarks, and an 18-step active corrected source-order path.

## What looks good

- The active process order is coherent: temporary oxide mask -> KOH texture proxy -> heavy-P contact diffusion -> light-P surface diffusion -> mask strip -> front/rear passivation -> contact openings -> Ti/Pd -> rear Al -> front Ag -> final sinter.
- The temporary mask oxides are absent from the final material stacks.
- Rear point contacts use the reported 200 um diameter / 2 mm pitch geometry.
- Front contact geometry is explicitly marked as an inference chosen to match the reported 0.5% contact-area fraction.
- Paper-derived values and reconstruction assumptions are separated in the supplied notes.
- The six GDS layers have a clear process-role map.

## Blocker before production example promotion

The current candidate still contains a specific stale Implant annotation in the corrected branch:

- the light-P diffusion annotation has 5 patches hosted by base Si;
- **8 additional narrow patches remain attached to the temporary second-oxide layer (`layer-2`) at z = 140 um**;
- that oxide is later stripped, so these annotation patches should not survive as host-owned implant geometry.

This should be repaired before the project becomes a production Welcome-page example. The final example regression should explicitly assert that every Implant patch resolves to surviving host material after later etch/strip steps.

## Presentation work before promotion

A full-wafer fit hides the 25 um front stripes, so the production example should save useful presentation states:

1. full-wafer overview;
2. front contact-stripe ROI;
3. rear 200 um point-contact section crossing a hole center.

The supplied screenshots also show occasional stale-frame timing after restore/ROI/maximize. Treat that as a separate renderer/UI timing investigation; do not encode screenshot pixels as the example contract.

## Promotion plan

When the reconstruction is repaired and accepted:

- place the final project under `site/examples/`;
- add a **solar-cell literature** family entry to `site/bundled-examples.js` rather than mixing it into the photodetector family;
- add structural invariants to `site/tests/example-regression.test.mjs`;
- add a Chromium restore/variant check to `scripts/example-regression.mjs`;
- only then open the branch as a PR and run CI.

No production example registration has been made on this staging branch.
