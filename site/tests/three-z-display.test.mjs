import assert from 'node:assert/strict';
import test from 'node:test';
import {
  THREE_Z_DISPLAY_FACTORS,
  normalizeThreeZDisplayFactor,
  threeZDisplayScale,
} from '../three-z-display.js';
import { createCollapsedZDisplayTransform } from '../section-z-collapse.js';

// A shared monotone map cannot open artificial air gaps at a conformal edge.
test('3D display-only factors are finite, bounded and reversible', () => {
  assert.deepEqual(THREE_Z_DISPLAY_FACTORS, [1, 2, 5, 10]);
  for (const invalid of [-10, 0, 1.1, 100, Infinity, NaN, undefined, null])
    assert.equal(normalizeThreeZDisplayFactor(invalid), 1);
  assert.equal(threeZDisplayScale(37, 10), 370);
  assert.equal(threeZDisplayScale(37, 1), 37);
  assert.equal(threeZDisplayScale(37, Infinity), 37);
});

test('3D scene Z scaling preserves gaps, conformal interfaces and physical values', () => {
  const physical = [-5, 5, 9, 9.05, 9.3, 9.5, 11];
  const original = structuredClone(physical);
  const transform = createCollapsedZDisplayTransform({
    zMin: -5,
    zMax: 11,
    collapse: { enabled: true, top: 4, bottom: -4 },
    breakFraction: 0,
  });
  for (const factor of THREE_Z_DISPLAY_FACTORS) {
    const scale = threeZDisplayScale(37, factor);
    const display = physical.map((z) => transform.mapZ(z) * scale);
    for (let i = 1; i < display.length; i++)
      assert.ok(display[i] > display[i - 1], `monotone at ${i}`);
    assert.equal(display[3], transform.mapZ(9.05) * scale);
    assert.ok(display[4] > display[3], 'thin conformal film has nonzero thickness');
  }
  assert.deepEqual(physical, original);
});
