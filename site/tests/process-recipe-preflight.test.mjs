import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProcessRecipe } from '../process-recipe.js';
import { normalizeRecipeLayerKey, validateRecipeExecution } from '../process-recipe-preflight.js';

const model = {
  layers: [
    { id: 'base', name: 'Base' },
    { id: 'film', name: 'Film A' },
  ],
};
const layout = {
  root: 'TOP',
  hierarchy: { CHILD: {} },
  elements: [
    { layer: 0, datatype: 0 },
    { layer: 7, datatype: 2 },
  ],
};
const deposit = (name) => ({
  command: 'deposit',
  params: { material: name, thickness: '20 nm', area: 'full' },
});
const extend = (name) => ({
  command: 'extend',
  params: { material: name, thickness: '10 nm', area: 'full' },
});
const step = (command, params) => normalizeProcessRecipe({ steps: [{ command, params }] }).steps[0];

test('preflight accepts valid execution prefix while a later Step is invalid', () => {
  const steps = [
    step('deposit', deposit('Film B').params),
    step('extend', extend('Missing material').params),
  ];
  assert.deepEqual(validateRecipeExecution(steps, { model, limit: 1 }).errors, []);
  assert.match(validateRecipeExecution(steps, { model, limit: 2 }).errors[0], /Step 2/);
});

test('preflight simulates rebuilt Base instead of depending on films removed by rebuild', () => {
  const steps = [step('extend', extend('Film A').params)];
  assert.deepEqual(validateRecipeExecution(steps, { model, startMode: 'continue' }).errors, []);
  assert.match(
    validateRecipeExecution(steps, { model, startMode: 'new-base' }).errors[0],
    /Film A/,
  );
});

test('array Recipe without array Base cannot destructively rebuild to a scalar model', () => {
  const arrayModel = { ...model, kernel: 'vector-2.5d-array-v1' };
  const steps = [step('deposit', deposit('New film').params)];
  assert.deepEqual(
    validateRecipeExecution(steps, { model: arrayModel, startMode: 'continue' }).errors,
    [],
  );
  assert.match(
    validateRecipeExecution(steps, {
      model: arrayModel,
      startMode: 'new-base',
      base: { material: 'Base', shape: 'rect', width: 30, height: 30, thickness: 2 },
    }).errors[0],
    /no verified reconstructible Base/,
  );
  assert.deepEqual(
    validateRecipeExecution(steps, {
      model: arrayModel,
      startMode: 'new-base',
      base: { material: 'Base', array: { rows: 25, columns: 25 } },
    }).errors,
    [],
  );
});

test('preflight lets Steps use films deposited by an earlier Step', () => {
  const steps = [
    step('deposit', deposit('New film').params),
    step('extend', extend('New film').params),
  ];
  assert.deepEqual(validateRecipeExecution(steps, { model, startMode: 'new-base' }).errors, []);
});

test('preflight rejects absent or empty captured masks for masked Steps', () => {
  const masked = (mask) =>
    step('implant', { name: 'Junction', depth: '20 nm', area: 'mask', mask });
  assert.match(validateRecipeExecution([masked(null)], { model }).errors[0], /capture a Mask/);
  assert.match(
    validateRecipeExecution([masked({ source: 'draw', drawMask: { shapes: [] } })], { model })
      .errors[0],
    /no shapes/,
  );
  assert.match(
    validateRecipeExecution([masked({ source: 'file', cell: 'TOP', layers: [] })], {
      model,
      maskState: { layout },
    }).errors[0],
    /no selected layers/,
  );
});

test('preflight resolves printed layer/datatype keys and validates current layout', () => {
  assert.equal(normalizeRecipeLayerKey(' 07 / 2 '), '7|2');
  assert.equal(normalizeRecipeLayerKey('7/2'), '7|2');
  const makeMaskStep = (key, cell = 'TOP') =>
    step('implant', {
      name: 'Junction',
      depth: '20 nm',
      area: 'mask',
      mask: { source: 'file', cell, layers: [key] },
    });
  const valid = makeMaskStep('7/2');
  assert.deepEqual(valid.params.mask.layerKeys, ['7|2']);
  assert.deepEqual(validateRecipeExecution([valid], { model, maskState: { layout } }).errors, []);
  assert.match(
    validateRecipeExecution([makeMaskStep('9/9')], { model, maskState: { layout } }).errors[0],
    /Mask layer "9\|9" is missing/,
  );
  assert.match(
    validateRecipeExecution([makeMaskStep('7/2', 'UNKNOWN')], { model, maskState: { layout } })
      .errors[0],
    /Mask cell "UNKNOWN"/,
  );
});

test('preflight marks missing layout as unverified and does not mutate inputs', () => {
  const masked = step('implant', {
    name: 'Junction',
    depth: '20 nm',
    area: 'mask',
    mask: { source: 'file', cell: 'TOP', layers: ['7/2'] },
  });
  const initial = JSON.stringify(masked);
  const result = validateRecipeExecution([masked], { model, maskState: {} });
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings[0], /could not be verified/);
  assert.equal(JSON.stringify(masked), initial);
});

test('legacy 80x80 GRID Base inference accepts only complete matching role ownership', async () => {
  const { createModel } = await import('../model.js');
  const { createRectangularGridArrayModel } = await import('../model-array-construction.js');
  const { inferRectangularGridRecipeBase } = await import('../process-recipe-preflight.js');
  const base = { shape: 'rect', width: 30, height: 30, thickness: 2, material: 'Base' };
  const desc = { kind: 'rect-grid', rows: 80, columns: 80, pitchX: 0.375, pitchY: 0.375, activeSites: 4725 };
  const model = createRectangularGridArrayModel(
    createModel({ shape: 'rect', width: 0.375, height: 0.375, thickness: 2 }),
    desc,
  );
  assert.deepEqual(inferRectangularGridRecipeBase(model, base), desc);
  assert.deepEqual(validateRecipeExecution([step('deposit', deposit('Oxide').params)], {
    model, base, startMode: 'new-base',
  }).errors, []);
  const altered = structuredClone(model);
  altered.array.instances[0].role = 'device';
  assert.equal(inferRectangularGridRecipeBase(altered, base), null);
  assert.match(validateRecipeExecution([step('deposit', deposit('Oxide').params)], {
    model: altered, base, startMode: 'new-base',
  }).errors[0], /no verified reconstructible Base/);
});
