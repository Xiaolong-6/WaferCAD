import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProcessRecipe,
  normalizeRecipeBase,
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

test('unit-bearing Recipe lengths reject numeric and conversion overflow', () => {
  assert.throws(() => recipeLengthUm('1e309 um'), /must be finite/);
  assert.throws(() => recipeLengthUm('1e308 mm'), /must be finite/);
  assert.throws(
    () => parseProcessRecipeSource('deposit({ material: "Bad", thickness: "1e309 um" });'),
    /must be finite/,
  );
});

test('Recipe preserves sub-0.01 nm material lengths rather than rounding to an arbitrary physics floor', () => {
  const recipe = parseProcessRecipeSource(
    'deposit({ material: "SiO2", thickness: "0.005 nm" });\n' +
      'extend({ material: "SiO2", thickness: "0.005 nm" });\n' +
      'etch({ depth: "0.005 nm", profile: "directional" });',
  );
  for (const step of recipe.steps) assert.equal(step.params.thicknessUm, 5e-6);
  const replay = parseProcessRecipeSource(serializeProcessRecipe(recipe));
  assert.deepEqual(replay.steps, recipe.steps);
});

test('Recipe rejects unrepresentable material segments without constraining annotation depths', () => {
  for (const operation of [
    'deposit({ material: "SiO2", thickness: "0.0000001 nm" });',
    'extend({ material: "SiO2", thickness: "0.0000001 nm" });',
    'etch({ depth: "0.0000001 nm" });',
  ]) {
    assert.throws(() => parseProcessRecipeSource(operation), /cannot be represented/i);
  }
  const annotation = parseProcessRecipeSource(
    'implant({ depth: "0.0000001 nm" });\n' + 'electrical({ depth: "0.0000001 nm" });',
  );
  for (const step of annotation.steps) assert.equal(step.params.depthUm, 1e-10);
});

test('Recipe serialization preserves more than eight significant digits when necessary', () => {
  const requested = 0.00000512345678901234;
  const recipe = normalizeProcessRecipe({
    name: 'Precision',
    steps: [{ command: 'deposit', params: { material: 'SiO2', thicknessUm: requested } }],
  });
  const roundTrip = parseProcessRecipeSource(serializeProcessRecipe(recipe));
  assert.equal(roundTrip.steps[0].params.thicknessUm, requested);
});

test('Lift-off recipe round-trips without synthetic thickness and validates required material', () => {
  const source =
    'deposit({ material: "PMMA", thickness: "200 nm" });\n' +
    'liftoff({ sacrificial: "PMMA", face: "front", area: "full" });';
  const parsed = parseProcessRecipeSource(source);
  assert.equal(parsed.steps[1].command, 'liftoff');
  assert.equal(parsed.steps[1].params.sacrificial, 'PMMA');
  assert.equal(Object.hasOwn(parsed.steps[1].params, 'thicknessUm'), false);
  const replay = parseProcessRecipeSource(serializeProcessRecipe(parsed));
  assert.deepEqual(replay.steps, parsed.steps);
  assert.throws(
    () => parseProcessRecipeSource('liftoff({ area: "full" });'),
    /sacrificial is required/,
  );
});

test('rectangular GRID Base normalizes without changing circular wafer contracts', () => {
  const base = {
    shape: 'rect',
    width: 30,
    height: 30,
    thickness: 2,
    material: 'Glass',
    array: {
      kind: 'rect-grid',
      rows: 80,
      columns: 80,
      pitchX: 0.375,
      pitchY: 0.375,
      activeSites: 4725,
    },
  };
  assert.deepEqual(normalizeRecipeBase(base), base);
  assert.throws(() => normalizeRecipeBase({ ...base, array: { ...base.array, rows: 79 } }));
  assert.throws(() =>
    normalizeRecipeBase({ ...base, array: { ...base.array, activeSites: 6401 } }),
  );
  const wafer = {
    shape: 'circle',
    width: 100,
    height: 100,
    thickness: 2,
    material: 'Si',
    array: { rows: 3, columns: 3, pitchX: 5, pitchY: 5, diameter: 100 },
  };
  assert.deepEqual(normalizeRecipeBase(wafer), wafer);
});

test('Exact Continuous Etch Recipe preserves front and physical lengths through code round-trip', () => {
  for (const [shape, lateral] of [
    ['circular', '2 µm'],
    ['elliptical', '5 µm'],
    ['vertical', '4 µm'],
  ]) {
    const script = `etch({ target: "Base", depth: "2 µm", profile: "continuous", shape: "${shape}", lateral: "${lateral}", face: "front", area: "full" });`;
    const parsed = parseProcessRecipeSource(script);
    const p = parsed.steps[0].params;
    assert.equal(p.profile, 'continuous');
    assert.equal(p.continuousShape, shape);
    assert.equal(p.thicknessUm, 2);
    assert.equal(p.continuousLateralUm, Number(lateral.split(' ')[0]));
    const restored = parseProcessRecipeSource(serializeProcessRecipe(parsed));
    assert.deepEqual(restored.steps[0].params, p);
  }
});

test('Exact Continuous Etch Recipe rejects invalid material, face, shape and reach', () => {
  const source = (fields) =>
    `etch({ profile: "continuous", depth: "2 µm", target: "Base", ${fields} });`;
  assert.throws(
    () => parseProcessRecipeSource('etch({ profile: "continuous", depth: "2 µm" });'),
    /target is required/,
  );
  assert.throws(() => parseProcessRecipeSource(source('face: "both"')), /Front or Back/);
  assert.throws(() => parseProcessRecipeSource(source('shape: "circle"')), /etch.shape/);
  assert.throws(
    () => parseProcessRecipeSource(source('shape: "elliptical"')),
    /lateral must be positive/,
  );
  assert.throws(
    () => parseProcessRecipeSource(source('shape: "circular", lateral: "3 µm"')),
    /equal lateral/,
  );
});


test('Direct fixed-angle Recipe round-trips θ/φ without a new process type', () => {
  const source = 'deposit({ material: "Al", thickness: "40 nm", coverage: "direct", area: "full", tiltDeg: 45, azimuthDeg: -45, face: "front" });';
  const recipe = parseProcessRecipeSource(source);
  assert.equal(recipe.steps[0].params.coverage, 'direct');
  assert.equal(recipe.steps[0].params.tiltDeg, 45);
  assert.equal(recipe.steps[0].params.azimuthDeg, -45);
  const restored = parseProcessRecipeSource(serializeProcessRecipe(recipe));
  assert.equal(restored.steps[0].params.tiltDeg, 45);
  assert.equal(restored.steps[0].params.azimuthDeg, -45);
  const legacy = parseProcessRecipeSource('deposit({ material: "Al", thickness: "40 nm", coverage: "direct" });');
  assert.equal(legacy.steps[0].params.tiltDeg, undefined);
  assert.equal(serializeProcessRecipe(legacy).includes('tiltDeg'), false);
});

test('angled recipe validation rejects invalid incidence and non-Direct modes', () => {
  for (const parameters of [
    'coverage: "conformal", tiltDeg: 45',
    'coverage: "direct", tiltDeg: 90',
    'coverage: "direct", tiltDeg: -3',
    'coverage: "direct", tiltDeg: 45, face: "back"',
  ]) {
    assert.throws(() => parseProcessRecipeSource(
      'deposit({ material: "Al", thickness: "40 nm", ' + parameters + ' });'
    ));
  }
});
