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
