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

test('Local relief map is strictly monotone, bounded in Z and reversible at ×1', async () => {
  const { createThreeRoughReliefDisplayTransform, normalizeThreeRoughReliefFactor } =
    await import('../three-z-display.js');
  const base = createCollapsedZDisplayTransform({
    zMin: -10,
    zMax: 15,
    collapse: { enabled: true, top: 0, bottom: -9 },
    breakFraction: 0,
  });
  const bands = [[9, 10.5]];
  const original = JSON.stringify(bands);
  const identity = createThreeRoughReliefDisplayTransform(base, bands, 1);
  assert.equal(identity.reliefActive, false);
  for (const z of [-10, 0, 5, 9.3, 10.5, 15]) assert.equal(identity.mapZ(z), base.mapZ(z));
  assert.equal(normalizeThreeRoughReliefFactor(999), 1);
  const enlarged = createThreeRoughReliefDisplayTransform(base, bands, 30);
  assert.equal(enlarged.reliefBands, 1);
  assert.equal(enlarged.reliefActive, true);
  let previous = -Infinity;
  for (let z = -8.95; z <= 14.99; z += 0.01) {
    const displayed = enlarged.mapZ(z);
    assert.ok(displayed >= previous - 1e-10, 'Z mapping must never reverse vertical ownership');
    previous = displayed;
  }
  // A 50 nm conformal layer in the relief band becomes 1.5 displayed µm
  // before the global 3D fit. Its physical volume and ordering remain intact.
  const film = enlarged.mapZ(10.05) - enlarged.mapZ(10);
  assert.ok(Math.abs(film - 30 * 0.05) < 1e-10);
  assert.ok(Math.abs(enlarged.mapZ(12) - enlarged.mapZ(11) - 1) < 1e-10);
  assert.deepEqual(bands, JSON.parse(original));
});

test('Relief mapping cannot enable GPU-only displacement without remapping its vertices', async () => {
  const { canUseGpuRoughTask } = await import('../gpu-rough-surface.js');
  const surface = { kind: 'rough', featureSize: 0.3, meanHeight: 0.5, etchDepth: 0.7 };
  assert.equal(canUseGpuRoughTask({ appearance: surface }), true);
  assert.equal(
    canUseGpuRoughTask({ appearance: surface, zDisplay: { reliefActive: true } }),
    false,
  );
});
