import assert from 'node:assert/strict';
import test from 'node:test';
import {
  THREE_Z_DISPLAY_RANGE,
  normalizeThreeZDisplayFactor,
  threeZDisplayScale,
} from '../three-z-display.js';
import { createCollapsedZDisplayTransform } from '../section-z-collapse.js';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

// A shared monotone map cannot open artificial air gaps at a conformal edge.
test('3D display-only factors are finite, bounded and reversible', () => {
  assert.deepEqual(THREE_Z_DISPLAY_RANGE, { min: 0.25, max: 20, step: 0.05 });
  for (const invalid of [-10, 0, Infinity, NaN, undefined, null])
    assert.equal(normalizeThreeZDisplayFactor(invalid), 1);
  assert.equal(normalizeThreeZDisplayFactor(1.75), 1.75);
  assert.equal(normalizeThreeZDisplayFactor(0.1), 0.25);
  assert.equal(normalizeThreeZDisplayFactor(100), 20);
  assert.equal(threeZDisplayScale(37, 1.75), 64.75);
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
  for (const factor of [0.25, 0.6, 1, 1.75, 2, 5, 10, 17.35, 20]) {
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

test('Local relief only magnifies rough surfaces intersecting the selected ROI', async () => {
  const { difference, rectMulti, intersection } = await import('../vector-geometry.js');
  const { threeRoughReliefBands, createThreeRoughReliefDisplayTransform } =
    await import('../three-z-display.js');
  const patch = { kind: 'rough', morphology: 'stochastic', etchDepth: 0.7 };
  const model = {
    regions: [
      {
        geom: rectMulti(20, 20, -30, 0),
        stack: [{ z0: -5, z1: 5, frontSurface: patch }],
      },
      { geom: rectMulti(20, 20, 30, 0), stack: [{ z0: -5, z1: 5 }] },
      {
        geom: difference(rectMulti(20, 20, 0, 30), rectMulti(10, 10, 0, 30)),
        stack: [{ z0: -5, z1: 5, frontSurface: patch }],
      },
    ],
  };
  const emptyRoi = rectMulti(5, 5, 30, 0);
  const roughRoi = rectMulti(5, 5, -30, 0);
  const holeRoi = rectMulti(3, 3, 0, 30);
  const base = createCollapsedZDisplayTransform({
    zMin: -5,
    zMax: 6,
    collapse: { enabled: false },
  });
  const snapshot = JSON.stringify(model);
  let polygonChecks = 0;
  const matchesRoi = (roi) => (region) => {
    polygonChecks++;
    return intersection(region.geom, roi).length > 0;
  };
  assert.equal(threeRoughReliefBands(model, 0.12, matchesRoi(emptyRoi)).length, 0);
  assert.equal(polygonChecks, 2, 'Smooth owners must not trigger ROI Booleans');
  assert.equal(threeRoughReliefBands(model, 0.12, matchesRoi(holeRoi)).length, 0);
  const rough = threeRoughReliefBands(model, 0.12, matchesRoi(roughRoi));
  assert.equal(rough.length, 1);
  assert.ok(Math.abs(rough[0][0] - 4.88) < 1e-10);
  assert.ok(Math.abs(rough[0][1] - 5.82) < 1e-10);
  assert.equal(createThreeRoughReliefDisplayTransform(base, [], 30).reliefActive, false);
  assert.equal(createThreeRoughReliefDisplayTransform(base, rough, 30).reliefActive, true);
  assert.equal(JSON.stringify(model), snapshot, 'ROI diagnostics must not mutate physical owner');
});

test('3D dashed structural borders update cumulative visible distances after nonlinear relief Z', async () => {
  const THREE = await import('three');
  const { refreshThreeDashedBorderDistances } = await import('../three-z-display.js');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, 0, 0, 3, 0, 4, 3, 0, 4, 6, 0, 4], 3),
  );
  const border = new THREE.LineSegments(geometry, new THREE.LineDashedMaterial());
  border.computeLineDistances();
  assert.equal(geometry.getAttribute('lineDistance').getX(1), 5);
  assert.equal(refreshThreeDashedBorderDistances(border, 2), true);
  const distances = geometry.getAttribute('lineDistance');
  assert.ok(Math.abs(distances.getX(1) - Math.sqrt(73)) < 1e-6);
  assert.equal(distances.getX(2), distances.getX(1), 'next border starts where prior ends');
  assert.ok(Math.abs(distances.getX(3) - Math.sqrt(73) - 3) < 1e-6);
  // Restore the same unchanged geometry at ×1, including dash frequencies.
  assert.equal(refreshThreeDashedBorderDistances(border, 1), true);
  assert.equal(distances.getX(1), 5);
  assert.equal(distances.getX(3), 8);
  const solid = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial());
  assert.equal(refreshThreeDashedBorderDistances(solid, 30), false);
  assert.equal(distances.getX(3), 8, 'solid borders must not be touched');
  geometry.dispose();
  border.material.dispose();
  solid.material.dispose();
});
