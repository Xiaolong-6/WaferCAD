import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { substrateShadowFootprint, polygonAreaUm2 } = await import('../shadow-exposure-geometry.js');
const { rectMulti, pointInMulti } = await import('../vector-geometry.js');

const rect = (width, centerX = 0) => rectMulti(width, 10, centerX, 0);
const layers = (bottom, top) => [
  { bottomUm: 0, topUm: 0.5, opening: bottom },
  { bottomUm: 0.5, topUm: 0.9, opening: top },
];
const evalMask = (stack, thetaDeg, azimuthDeg, heightStepUm = 0.05) =>
  substrateShadowFootprint(stack, { thetaDeg, azimuthDeg, heightStepUm });

// For convex rectangular apertures, endpoint intersection is mathematically exact.
test('zero tilt gives intersection of both resist openings independent of sampling', () => {
  const out = evalMask(layers(rect(4), rect(2)), 0, 70);
  assert.ok(Math.abs(polygonAreaUm2(out.footprint) - 20) < 1e-8);
  assert.equal(out.sampleCount, 2);
});

test('45-degree shadow footprint responds to azimuth and undercut', () => {
  const stack = layers(rect(4), rect(2));
  const east = evalMask(stack, 45, 0),
    west = evalMask(stack, 45, 180);
  assert.ok(pointInMulti([-1.4, 0], east.footprint));
  assert.ok(!pointInMulti([1.4, 0], east.footprint));
  assert.ok(pointInMulti([1.4, 0], west.footprint));
  assert.ok(!pointInMulti([-1.4, 0], west.footprint));
  const narrowBase = evalMask(layers(rect(2), rect(2)), 45, 0);
  assert.ok(polygonAreaUm2(east.footprint) > polygonAreaUm2(narrowBase.footprint));
});

test('interior samples catch obstructing gap missed by two endpoint samples', async () => {
  const { unionGeometries } = await import('../vector-geometry.js');
  const twoSlots = unionGeometries([rect(0.5, -1), rect(0.5, 1)]);
  const stack = [{ bottomUm: 0, topUm: 1, opening: twoSlots }];
  const out = evalMask(stack, (Math.atan(2) * 180) / Math.PI, 0, 0.1);
  assert.ok(!pointInMulti([-1, 0], out.footprint));
});

test('invalid tilt, missing layers and discontinuous resist fail closed', () => {
  assert.throws(() => evalMask(layers(rect(2), rect(1)), 89), RangeError);
  assert.throws(() => evalMask([], 45), RangeError);
  assert.throws(() => evalMask([{ bottomUm: 0.1, topUm: 0.5, opening: rect(1) }], 0), RangeError);
  assert.throws(
    () =>
      substrateShadowFootprint(layers(rect(2), rect(1)), {
        thetaDeg: 45,
        heightStepUm: 1e-6,
        maxSamples: 100,
      }),
    RangeError,
  );
});

test('author 180 nm cross-mask yields converging two-angle candidate overlap', async (t) => {
  const source = process.env.WAFERCAD_TRANSMON_GDS;
  if (!source)
    return t.skip('Set WAFERCAD_TRANSMON_GDS to the original verified Zenodo sample.gds.');
  const { readFileSync } = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const { parseGDS, flattenGDS } = await import('../gds.js');
  const { unionGeometries, intersection } = await import('../vector-geometry.js');
  const bytes = readFileSync(source);
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02',
  );
  const parsed = parseGDS(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const local = flattenGDS(parsed, 'jj_width0p18').elements;
  assert.equal(local.length, 17);
  const opening = (datatype) =>
    unionGeometries(
      local.filter((p) => p.layer === 8 && p.datatype === datatype).map((p) => [[p.points]]),
    );
  const highDose = opening(1);
  const undercut = unionGeometries([opening(0), highDose]);
  const resist = layers(undercut, highDose);
  const overlapAtStep = (heightStepUm) => {
    const first = evalMask(resist, 45, -45, heightStepUm);
    const second = evalMask(resist, 45, 45, heightStepUm);
    return polygonAreaUm2(intersection(first.footprint, second.footprint));
  };
  const coarse = overlapAtStep(0.15);
  const fine = overlapAtStep(0.0375);
  assert.ok(fine > 0.025 && fine < 0.04);
  assert.ok(Math.abs(fine - coarse) < 0.0001);
  // The 180 x 180 nm figure refers to the mask, not measured Al/AlOx overlap.
  assert.ok(Math.abs(fine - 0.18 * 0.18) < 0.001);
});

test('rotating the reticle and incident azimuth together preserves visibility area', async () => {
  const { transformMulti } = await import('../vector-geometry.js');
  const originalStack = layers(rect(4), rect(2));
  const rotatedStack = originalStack.map((layer) => ({
    ...layer,
    opening: transformMulti(layer.opening, ([x, y]) => [-y, x]),
  }));
  const original = evalMask(originalStack, 45, 0, 0.05);
  const rotated = evalMask(rotatedStack, 45, 90, 0.05);
  assert.ok(
    Math.abs(polygonAreaUm2(original.footprint) - polygonAreaUm2(rotated.footprint)) < 1e-9,
  );
});
