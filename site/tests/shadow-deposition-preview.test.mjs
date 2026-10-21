import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { makeShadowAlPreview } = await import('../shadow-deposition-preview.js');
const { rectMulti, pointInMulti } = await import('../vector-geometry.js');

const layers = [
  { bottomUm: 0, topUm: 0.5, opening: rectMulti(4, 6) },
  { bottomUm: 0.5, topUm: 0.9, opening: rectMulti(2, 6) },
];
const beams = [
  { thetaDeg: 45, azimuthDeg: 0, nominalThicknessUm: 0.04, label: 'Al bottom' },
  { thetaDeg: 45, azimuthDeg: 180, nominalThicknessUm: 0.03, label: 'Al top' },
];

test('native model has patterned Al material slabs with declared thickness and no imaginary oxide', () => {
  const { model, exposures, summary } = makeShadowAlPreview({ layers, beams });
  assert.equal(model.processRevision, 2);
  assert.equal(model.layers.length, 3);
  assert.equal(summary.alOxPresent, false);
  assert.ok(summary.firstTwoOverlapAreaUm2 > 0);
  const intersectionPoint = model.regions.find(
    (r) =>
      r.stack.length === 3 && r.stack.some((segment) => segment.layerId === exposures[0].layerId),
  );
  assert.ok(intersectionPoint, 'There must be a geometrical Al-on-Al stack at overlap');
  const [, bottom, top] = intersectionPoint.stack;
  assert.ok(Math.abs(bottom.z1 - bottom.z0 - 0.04) < 1e-9);
  assert.ok(Math.abs(top.z1 - top.z0 - 0.03) < 1e-9);
  assert.equal(top.z0, bottom.z1);
  assert.equal(summary.status.includes('NO tunnel barrier'), true);
});

test('oblique direction shifts physical Al footprint on the substrate', () => {
  const out = makeShadowAlPreview({ layers, beams });
  assert.equal(pointInMulti([-1.3, 0], out.exposures[0].footprint), true);
  assert.equal(pointInMulti([1.3, 0], out.exposures[0].footprint), false);
  assert.equal(pointInMulti([-1.3, 0], out.exposures[1].footprint), false);
  assert.equal(pointInMulti([1.3, 0], out.exposures[1].footprint), true);
});

test('invalid thickness fails closed instead of mutating a material model', () => {
  assert.throws(
    () => makeShadowAlPreview({ layers, beams: [{ ...beams[0], nominalThicknessUm: 0 }] }),
    /positive nominal/,
  );
});

test('explicit AlOx spacer separates intersecting Al solids at physical nanometre thickness', () => {
  const barrier = {
    thicknessUm: 0.002,
    provenance: 'hypothesis',
    source: 'Illustrative 2 nm only; not an author-reported film thickness',
  };
  const { model, exposures, summary } = makeShadowAlPreview({ layers, beams, barrier });
  assert.equal(model.processRevision, 3);
  assert.equal(model.layers.length, 4);
  assert.equal(summary.alOxPresent, true);
  assert.equal(summary.alOxProvenance, 'hypothesis');
  assert.equal(summary.tunnelJunctionValidated, false);
  const crossing = model.regions.find((r) => r.stack.length === 4);
  assert.ok(crossing, 'A distinct Si / Al / AlOx / Al stack must exist.');
  assert.deepEqual(
    crossing.stack.map((s) => s.layerId),
    ['base', exposures[0].layerId, summary.alOxLayerId, exposures[1].layerId],
  );
  assert.ok(Math.abs(crossing.stack[2].z1 - crossing.stack[2].z0 - 0.002) < 1e-9);
  assert.ok(Math.abs(crossing.stack[2].z0 - crossing.stack[1].z1) < 1e-9);
  assert.ok(Math.abs(crossing.stack[3].z0 - crossing.stack[2].z1) < 1e-9);
});

test('missing, zero, or unattributed AlOx thickness fails closed', () => {
  const plain = makeShadowAlPreview({ layers, beams });
  assert.equal(plain.summary.alOxPresent, false);
  const invalid = [
    { thicknessUm: 0.002 },
    { thicknessUm: 0, provenance: 'hypothesis', source: 'example' },
    { thicknessUm: 0.002, provenance: 'measurement', source: '' },
  ];
  for (const barrier of invalid) {
    assert.throws(() => makeShadowAlPreview({ layers, beams, barrier }), RangeError);
  }
});
