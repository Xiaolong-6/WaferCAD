import test from 'node:test';
import assert from 'node:assert/strict';
import {
  convertPolygonPointUnits,
  syncDisplayUnitFields,
} from '../ui-v2/view-kit/display-units.js';

test('an open polygon editor retains physical vertices through nm, mm and µm switches', () => {
  const label = { textContent: 'Points · µm (one x, y pair per line)' };
  const control = {
    dataset: { displayPoints: 'um' },
    value: '1, -2\n-0.125, 0.5',
    closest: () => ({ querySelector: () => label }),
  };
  const root = {
    querySelectorAll: (selector) => (selector === '[data-display-points]' ? [control] : []),
  };
  syncDisplayUnitFields(root, 'nm');
  assert.equal(control.value, '1000, -2000\n-125, 500');
  assert.match(label.textContent, /nm/);
  syncDisplayUnitFields(root, 'mm');
  assert.equal(control.value, '0.001, -0.002\n-0.000125, 0.0005');
  syncDisplayUnitFields(root, 'um');
  assert.equal(control.value, '1, -2\n-0.125, 0.5');
  assert.equal(control.dataset.displayPoints, 'um');
});

test('unit conversion preserves polygon separators and invalid draft tokens', () => {
  assert.equal(convertPolygonPointUnits('1, bad\n 2, 3', 'um', 'nm'), '1000, bad\n 2000, 3000');
  assert.equal(convertPolygonPointUnits('1e-3, -2.5e+1', 'um', 'nm'), '1, -25000');
});

test('open Mask shape inputs, polygon drafts and angles switch without changing physical geometry', () => {
  const model = {
    layers: [{ id: 'oxide-front', name: 'SiO2' }],
    shapes: [
      {
        id: 'shape-9',
        type: 'polygon',
        points: [
          [1.2346, -0.125],
          [0, 2],
        ],
      },
    ],
    processRevision: 12,
  };
  const original = structuredClone(model);
  const control = (value, unit, label, key = 'displayLength') => ({
    value,
    dataset: { [key]: unit },
    step: 'any',
    closest: () => ({ querySelector: () => ({ textContent: label }) }),
  });
  const position = control('1.2346', 'um', 'Center X · µm');
  const radius = control('0.0001', 'um', 'Radius · µm');
  const points = control('1.2346, -0.125\n0, 2', 'um', 'Points · µm', 'displayPoints');
  const angle = { value: '67.5', dataset: {} };
  const root = {
    querySelectorAll: (selector) => {
      if (selector === '[data-display-length]') return [position, radius];
      if (selector === '[data-display-points]') return [points];
      return [];
    },
  };
  for (const [unit, x, r, first] of [
    ['nm', 1234.6, 0.1, 1234.6],
    ['mm', 0.0012346, 0.0000001, 0.0012346],
    ['um', 1.2346, 0.0001, 1.2346],
  ]) {
    syncDisplayUnitFields(root, unit);
    assert.ok(Math.abs(Number(position.value) - x) < 1e-12);
    assert.ok(Math.abs(Number(radius.value) - r) < 1e-12);
    assert.ok(Math.abs(Number(points.value.split(',')[0]) - first) < 1e-12);
    assert.equal(angle.value, '67.5');
    assert.deepEqual(model, original, 'switching display units must not mutate the model');
  }
  assert.equal(points.value, '1.2346, -0.125\n0, 2');
  assert.equal(position.dataset.displayLength, 'um');
  assert.equal(points.dataset.displayPoints, 'um');
});

test('invalid and overflow Mask drafts remain for validation rather than becoming Infinity', () => {
  assert.equal(
    convertPolygonPointUnits('1e309, 3\ninvalid, 4', 'um', 'nm'),
    '1e309, 3000\ninvalid, 4000',
  );
  const length = {
    value: '1e308',
    dataset: { displayLength: 'mm' },
    closest: () => null,
    step: 'any',
  };
  const root = {
    querySelectorAll: (selector) => (selector === '[data-display-length]' ? [length] : []),
  };
  syncDisplayUnitFields(root, 'nm');
  assert.equal(length.value, '1e308');
  assert.equal(length.dataset.displayLength, 'nm');
});
