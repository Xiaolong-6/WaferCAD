import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { rectMulti, pointInMulti } = await import('../vector-geometry.js');
const { directIncidenceArea } = await import('../direct-incidence-geometry.js');
const lower = rectMulti(6, 8, -3, 0);
const upper = rectMulti(6, 8, 3, 0);
const area = rectMulti(12, 8);
const model = {
  regions: [
    { geom: lower, stack: [{ z0: 0, z1: 5 }] },
    { geom: upper, stack: [{ z0: 0, z1: 5.8 }] },
  ],
};
const beam = (opening) => ({
  tiltDeg: 45,
  azimuthDeg: 0,
  heightStepUm: 0.1,
  apertureStack: [{ bottomZUm: 5, topZUm: 5.9, opening }],
});
test('fixed-angle Direct lets only lower illuminated material grow below a resist ceiling', () => {
  const result = directIncidenceArea(model, area, beam(rectMulti(2, 2, -3)), {
    depositedThicknessUm: 0.15,
  });
  assert.ok(result.sampleCount > 0);
  assert.equal(pointInMulti([-3.4, 0], result.area), true);
  assert.equal(pointInMulti([3, 0], result.area), false);
});
test('an illuminated tall target reaching the resist ceiling still fails closed', () => {
  assert.throws(
    () =>
      directIncidenceArea(model, area, beam(rectMulti(2, 2, 3)), {
        depositedThicknessUm: 0.15,
      }),
    /resist top/,
  );
});
test('a tall shadowed target must not invalidate zero-degree lower-surface deposition', () => {
  const result = directIncidenceArea(
    model,
    area,
    {
      ...beam(rectMulti(2, 2, -3)),
      tiltDeg: 0,
    },
    { depositedThicknessUm: 0.15 },
  );
  assert.equal(pointInMulti([-3, 0], result.area), true);
  assert.equal(pointInMulti([3, 0], result.area), false);
});
