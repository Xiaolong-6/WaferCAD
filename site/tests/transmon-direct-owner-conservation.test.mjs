import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
await loadGeometryKernel();
const { applyOperation, createModel, geometryArea } = await import('../model.js');
const { intersection, difference, unionGeometries, rectMulti } =
  await import('../vector-geometry.js');
const direct = { tiltDeg: 45, azimuthDeg: 35, heightStepUm: 0.02 };
const ownerCoverage = (model) => unionGeometries(model.regions.map((r) => r.geom));

test('fixed-angle Direct fails closed and rolls back a substantive pre-existing overlap', () => {
  const model = createModel({ shape: 'rect', width: 10, height: 8, thickness: 10 });
  model.regions.push({
    id: 'duplicated-material-owner',
    geom: rectMulti(2, 2),
    stack: structuredClone(model.regions[0].stack),
  });
  const original = structuredClone(model);
  const outcome = applyOperation(model, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: model.boundary,
    growth: 'direct',
    incidence: direct,
  });
  assert.equal(outcome.changed, false);
  assert.match(outcome.error, /Fixed-angle Direct input produced overlapping regions/);
  assert.deepEqual(model, original);
});

test('fixed-angle Direct preserves an intentional through-wafer opening', () => {
  const model = createModel({ shape: 'rect', width: 10, height: 8, thickness: 10 });
  const opening = rectMulti(2, 2);
  assert.equal(
    applyOperation(model, {
      type: 'etch',
      etchProfile: 'directional',
      thickness: 11,
      area: opening,
    }).changed,
    true,
  );
  const before = ownerCoverage(model);
  const outcome = applyOperation(model, {
    type: 'add',
    name: 'Al',
    thickness: 0.04,
    area: model.boundary,
    growth: 'direct',
    incidence: direct,
  });
  assert.equal(outcome.changed, true, outcome.error);
  const after = ownerCoverage(model);
  assert.ok(geometryArea(difference(before, after)) < 1e-8);
  assert.ok(geometryArea(difference(after, before)) < 1e-8);
  assert.ok(geometryArea(intersection(opening, after)) < 1e-8);
});
