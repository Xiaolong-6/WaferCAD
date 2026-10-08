import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProcessRecipe,
  parseProcessRecipeSource,
  recipeLengthUm,
  serializeProcessRecipe,
} from '../process-recipe.js';

test('Process Recipe parses safe command syntax, units, and mask context', () => {
  const recipe = parseProcessRecipeSource(`
    deposit({
      material: "SiO2",
      thickness: "100 nm",
      coverage: "directional",
      area: "full"
    });
    etch({
      target: "SiO2",
      depth: "2 µm",
      profile: "directional",
      area: "mask",
      mask: { source: "file", cell: "TOP", layers: ["3|0"] }
    });
    snapshot("After etch");
  `);

  assert.equal(recipe.steps.length, 3);
  assert.equal(recipe.steps[0].command, 'deposit');
  assert.equal(recipe.steps[0].params.thicknessUm, 0.1);
  assert.equal(recipe.steps[1].params.thicknessUm, 2);
  assert.deepEqual(recipe.steps[1].params.mask.layerKeys, ['3|0']);
  assert.equal(recipe.steps[2].params.name, 'After etch');
});

test('Process Recipe rejects arbitrary JavaScript and identifiers', () => {
  assert.throws(
    () => parseProcessRecipeSource('fetch("https://example.com");'),
    /Unsupported recipe command/,
  );
  assert.throws(
    () => parseProcessRecipeSource('deposit({ material: foo, thickness: "1 µm" });'),
    /Unsupported literal/,
  );
});

test('Process Recipe rejects prototype keys and excessive nesting', () => {
  assert.throws(
    () =>
      parseProcessRecipeSource('deposit({ material: "SiO2", thickness: "1 µm", __proto__: {} });'),
    /Unsupported object key/,
  );
  const nested = '['.repeat(40) + '0' + ']'.repeat(40);
  assert.throws(
    () => parseProcessRecipeSource(`record({ process: "custom", label: "x", note: ${nested} });`),
    /nested too deeply/,
  );
});

test('Process Recipe generated source round-trips normalized steps', () => {
  const original = normalizeProcessRecipe({
    name: 'Round trip',
    steps: [
      {
        command: 'deposit',
        params: {
          material: 'Al2O3',
          thickness: '30 nm',
          coverage: 'conformal',
          face: 'front',
          area: 'full',
        },
      },
      {
        command: 'implant',
        params: {
          name: 'B implant',
          depth: '500 nm',
          tilt: 7,
          face: 'front',
          area: 'mask',
          mask: { sourceMode: 'file', cell: 'TOP', layerKeys: ['7|0'] },
        },
      },
    ],
  });

  const serialized = serializeProcessRecipe(original);
  const reparsed = parseProcessRecipeSource(serialized, { name: original.name });
  const renormalized = normalizeProcessRecipe(original);

  assert.equal(reparsed.steps.length, original.steps.length);
  assert.equal(renormalized.steps.length, original.steps.length);
  assert.equal(reparsed.steps[0].params.thicknessUm, 0.03);
  assert.equal(reparsed.steps[1].params.depthUm, 0.5);
  assert.equal(reparsed.steps[1].params.tilt, 7);
  assert.deepEqual(reparsed.steps[1].params.mask.layerKeys, ['7|0']);
});

test('Process Recipe preserves Transfer placement and rough Etch parameters', () => {
  const recipe = normalizeProcessRecipe({
    name: 'Surface recipe',
    steps: [
      {
        command: 'deposit',
        params: {
          material: 'Polymer',
          thickness: '2 µm',
          coverage: 'transfer',
          placement: 'flat',
          area: 'full',
        },
      },
      {
        command: 'etch',
        params: {
          target: 'Base',
          depth: '1 µm',
          profile: 'directional',
          surface: {
            morphology: 'pyramid',
            polarity: 'normal',
            featureSize: '400 nm',
            meanHeight: '800 nm',
            featureCv: 25,
            heightCv: 0.4,
            seed: 4242,
          },
          area: 'full',
        },
      },
    ],
  });

  assert.equal(recipe.steps[0].params.coverage, 'transfer');
  assert.equal(recipe.steps[0].params.placement, 'flat');
  assert.equal(recipe.steps[1].params.surface.morphology, 'pyramid');
  assert.equal(recipe.steps[1].params.surface.polarity, 'normal');
  assert.equal(recipe.steps[1].params.surface.featureSize, 0.4);
  assert.equal(recipe.steps[1].params.surface.meanHeight, 0.8);
  assert.equal(recipe.steps[1].params.surface.featureCv, 0.25);
  assert.equal(recipe.steps[1].params.surface.heightCv, 0.4);
  assert.equal(recipe.steps[1].params.surface.seed, 4242);

  const reparsed = parseProcessRecipeSource(serializeProcessRecipe(recipe));
  assert.equal(reparsed.steps[0].params.placement, 'flat');
  assert.deepEqual(reparsed.steps[1].params.surface, recipe.steps[1].params.surface);
});

test('recipeLengthUm accepts supported units', () => {
  assert.equal(recipeLengthUm('30 nm'), 0.03);
  assert.equal(recipeLengthUm('2.5 um'), 2.5);
  assert.equal(recipeLengthUm('2.5 µm'), 2.5);
  assert.equal(recipeLengthUm('0.1 mm'), 100);
});
