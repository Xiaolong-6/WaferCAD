import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel, applyOperation, geometryArea } = await import('../model.js');
const { rectMulti, intersection } = await import('../vector-geometry.js');
const { isolatedDirectSidewallPlan } = await import('../direct-sidewall-geometry.js');
const { validateProcessModel } = await import('../project-schema.js');

const fixture = () => {
  const model = createModel({ shape: 'rect', width: 12, height: 8, thickness: 10 });
  const step = applyOperation(model, {
    type: 'add',
    name: 'Raised step',
    thickness: 1,
    area: rectMulti(4, 2),
  });
  assert.equal(step.changed, true, step.error);
  return model;
};
const incidence = {
  tiltDeg: 45,
  azimuthDeg: 45,
  sidewallGeometry: 'isolated-step',
  facetSliceUm: 0.05,
  apertureStack: [{ bottomZUm: 6, topZUm: 6.6, opening: rectMulti(1.4, 0.8, 2.9) }],
};

test('actual Direct model retains full planned sidewall metal volume regardless of segment roles', () => {
  const model = fixture();
  const plan = isolatedDirectSidewallPlan(model, model.boundary, incidence, 0.04);
  assert.ok(plan.length > 15, 'The analytic error gate must refine the original 50 nm slices.');
  const plannedVolume = plan.reduce(
    (sum, patch) =>
      sum +
      geometryArea(patch.area) *
        (patch.visibleHeightIntervals[0][1] - patch.visibleHeightIntervals[0][0]),
    0,
  );
  const deposited = applyOperation(model, {
    type: 'add',
    name: 'Al 45-degree',
    thickness: 0.04,
    area: model.boundary,
    incidence,
  });
  assert.equal(deposited.changed, true, deposited.error);
  validateProcessModel(model);
  let actualMetalVolume = 0;
  for (const patch of plan) {
    for (const region of model.regions) {
      const xyArea = geometryArea(intersection(patch.area, region.geom));
      if (xyArea <= 1e-15) continue;
      for (const segment of region.stack) {
        if (segment.layerId !== deposited.layerId) continue;
        for (const [z0, z1] of patch.visibleHeightIntervals)
          actualMetalVolume +=
            xyArea * Math.max(0, Math.min(z1, segment.z1) - Math.max(z0, segment.z0));
      }
    }
  }
  assert.ok(plannedVolume > 0);
  assert.ok(Math.abs(actualMetalVolume - plannedVolume) < 1e-8, {
    plannedVolume,
    actualMetalVolume,
  });
});

test('accuracy-budget failure rolls back a native Direct process without changing materials', () => {
  const model = fixture();
  const unchanged = structuredClone(model);
  const failed = applyOperation(model, {
    type: 'add',
    thickness: 0.04,
    area: model.boundary,
    incidence: { ...incidence, facetMaxAreaLossFraction: 0.005, maxFacetSlices: 20 },
  });
  assert.equal(failed.changed, false);
  assert.match(failed.error, /budget/);
  assert.deepEqual(model, unchanged);
});
