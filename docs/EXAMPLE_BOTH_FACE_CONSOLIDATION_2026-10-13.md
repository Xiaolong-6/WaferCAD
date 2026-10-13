# Both-face bundled-example consolidation (2026-10-13)

Repository: `Xiaolong-6/WaferCAD`. Base: `main@1e34da5`. Integration: [Draft PR #194](https://github.com/Xiaolong-6/WaferCAD/pull/194).

## Scope and scientific decisions

| Project / saved branches                                      | Consolidation                                                                                                                                  | Intentional exception                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Black-Si photodetector (common, FINAL, QA)                    | Initial 650 nm thermal SiO₂ now uses `face: 'both'`. A dedicated rear oxide strip precedes rear P implantation                                 | The journal reconstruction explicitly documents the front mask. Back oxidation and the oxide removal step are a geometric fabrication assumption, not a measured oxide-thickness profile. O₂ drive-in remains a non-geometric Record; no unspecified grown oxide is invented |
| PERC (baseline, GDS contacts, source-order)                   | The 110 nm front and rear conformal SiO₂ passivation deposits become one atomic Both Deposit. It creates separate, linked Front/Back layer IDs | GDS front-window layer `4                                                                                                                                                                                                                                                    | 0`and back-window layer`5 | 0` remain distinct Etch operations. Existing front/rear colors are retained in saved states, and original region geometry is held invariant |
| Fully textured Perovskite–Si Tandem (nc-Si:H and ITO control) | Two consecutive 4.5 µm Si pyramid Etches become one Both Etch with face-specific appearance, seeds and profile IDs                             | Front seed 2018 and Back seed 2019 retain their own profile IDs. Front a-Si:H(n) and rear a-Si:H(p) remain separate; the separated intrinsic a-Si:H(i) steps stay unchanged because an intervening front doped-film step prevents an order-preserving simple consolidation   |

## Kernel and Recipe contract

An optional `faceSurfaces` member is accepted only for a directional `etch` with `face: 'both'`. Each of its `front` and `back` entries carries one full rough/pyramid appearance profile, including its deterministic `seed` and optional `profileId`.

```js
etch({
  target: 'n-type FZ c-Si [paper 260 um]',
  depth: '4.5 µm',
  profile: 'directional',
  face: 'both',
  area: 'full',
  faceSurfaces: {
    front: {
      kind: 'rough',
      morphology: 'pyramid',
      polarity: 'normal',
      featureSize: 6.4,
      meanHeight: 4.5,
      featureCv: 0.3,
      heightCv: 0,
      seed: 2018,
      profileId: 'pyramid-front-2018',
    },
    back: {
      kind: 'rough',
      morphology: 'pyramid',
      polarity: 'normal',
      featureSize: 6.4,
      meanHeight: 4.5,
      featureCv: 0.3,
      heightCv: 0,
      seed: 2019,
      profileId: 'pyramid-back-2019',
    },
  },
});
```

Both still executes Front → Back atomically. One logical History node may increment the internal `processRevision` twice. Neither face is an extra Main/Mask inspection face. `faceSurfaces` changes display morphology metadata, **not** physical, stochastic etched topography; the base 2.5D geometry remains ideal. A thermal oxidation **Deposit** remains a geometry surrogate without Si consumption or a reaction/diffusion solver.

## Authoritative regeneration

```sh
node scripts/maintenance/rebuild-photodetectors.mjs --write
node scripts/maintenance/consolidate-perc-both-face.mjs --write
node scripts/maintenance/consolidate-tandem-texture-both.mjs --write
node scripts/maintenance/backfill-example-recipes.mjs --write --id=perc-solar-cells-point-contacts
node scripts/maintenance/backfill-example-recipes.mjs --write --id=fully-textured-perovskite-silicon-tandem
node scripts/build-example-previews.mjs --write --id=photodetector-literature
node scripts/build-example-previews.mjs --write --id=perc-point-contact-solar-cell
node scripts/build-example-previews.mjs --write --id=fully-textured-perovskite-silicon-tandem
node scripts/maintenance/sync-example-recipe-previews.mjs --write
```

The migration scripts are designed to run only on the eligible legacy stage shape, and to exit without further transformations on already-consolidated files. They validate scientific region geometry before writing. Do not independently edit packed `.wafercad` History/Recipe metadata.

## Acceptance gates

- `site/tests/examples-both-face-migration.test.mjs`: paired independent IDs, backside strip order, PERC mask ownership, both pyramid seeds, complete History/Variant/bookmark ancestry.
- `site/tests/example-recipe-audit.test.mjs` and `site/tests/example-structure.test.mjs`: executable Recipe/Mask/Base and morphology contracts.
- `site/tests/process-both-face.test.mjs`: atomic Kernel and paired material contract.
- Global Quality enforces all Node tests, lint and Prettier; the dedicated scientific gate runs six independent Chromium `Rebuild Base → Run All` scenarios across Black-Si FINAL/QA, PERC source-order/GDS, and Tandem ITO/nc-Si:H.
- Preview regeneration and `tests/fixtures/project-io/example-thumbnails.json` source checksums.
- Original baselines must not be blindly replaced; inspect any changed Section/3D output.

The reusable, read-only CI workflow is `.github/workflows/examples-both-face.yml`. It regenerates assets in an ephemeral checkout, verifies they are **byte-for-byte identical to the committed files**, runs focused science/persistence checks, and then replays six Chromium Variant scenarios in parallel. It never auto-commits or pushes. Global Quality provides the full repository-wide Node/lint/format gates. Previous green tests for old assets do not qualify the new fixtures.
