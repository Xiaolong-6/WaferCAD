import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import {
  SWX_PERIMETER_CONTEXT_ASSUMPTIONS,
  createSwxSemPerimeterContext,
  SWX_PERIMETER_CONTEXT_PROCESS_PROFILE,
} from '../../scripts/swx-mems-sem-perimeter-context.mjs';
import { createSwxSemGroundReturnCandidate } from '../../scripts/swx-mems-sem-ground-return-candidate.mjs';

await loadGeometryKernel();
const v = await import('../vector-geometry.js');
const { geometryArea } = await import('../model.js');
const union = (rings) => v.unionGeometries(rings.map((ring) => [[[...ring, ring[0]]]]));

for (const state of ['off', 'on']) {
  test(
    'experimental ' + state + ' SEM context has two open flanks, no closed Si ring',
    () => {
      const a = SWX_PERIMETER_CONTEXT_ASSUMPTIONS;
      const baseline = createSwxSemGroundReturnCandidate(state);
      const context = createSwxSemPerimeterContext(state);
      const bulk = context.physicalGroups.semPerimeterContext;
      assert.equal(a.sourceAuthorGdsAvailable, false);
      assert.equal(a.actualIsolationTrenchSourceVerified, false);
      assert.equal(bulk.length, 2);
      assert.equal(a.sourceClosedPerimeterTrenchObserved, false);
      assert.equal(a.sourceFlankMaterialIdentityVerified, false);
      assert.equal(a.studyFieldIsMeasuredDeviceFootprint, false);
      assert.deepEqual(context.layout.bounds, {
        minX: -100,
        minY: -140,
        maxX: 100,
        maxY: 140,
        width: 200,
        height: 280,
      });
      assert.equal(context.maskPolygons.get(1).length, baseline.maskPolygons.get(1).length + 2);
      assert.deepEqual(context.maskPolygons.get(2), baseline.maskPolygons.get(2));
      assert.deepEqual(context.maskPolygons.get(3), baseline.maskPolygons.get(3));
      assert.equal(context.layout.elements.length, baseline.layout.elements.length + 2);
      const bulkUnion = union(bulk);
      const originalUnion = union(baseline.maskPolygons.get(1));
      assert.equal(bulkUnion.length, 2);
      assert.equal(geometryArea(bulkUnion), 3195);
      assert.ok(geometryArea(v.intersection(bulkUnion, originalUnion)) < 1e-8);
      assert.equal(
        union(context.maskPolygons.get(1)).length,
        union(baseline.maskPolygons.get(1)).length + 2,
      );
      for (const point of [
        [-90, -50],
        [90, -50],
        [-95, -95],
        [95, -95],
      ]) {
        assert.equal(v.pointInMulti(point, bulkUnion), true);
      }
      for (const point of [
        [-81, -50],
        [81, -50],
        [0, -9],
        [0, -120],
        [0, 25],
        [0, -130],
      ]) {
        assert.equal(v.pointInMulti(point, bulkUnion), false);
      }
    },
  );
}

test('peripheral study inherits original real process, but never source-fidelity status', () => {
  const p = SWX_PERIMETER_CONTEXT_PROCESS_PROFILE;
  assert.deepEqual(p.fieldUm, [200, 280]);
  assert.equal(p.geometryFactory, createSwxSemPerimeterContext);
  assert.equal(SWX_PERIMETER_CONTEXT_ASSUMPTIONS.perimeterDimensionsSourceVerified, false);
  assert.equal(SWX_PERIMETER_CONTEXT_ASSUMPTIONS.contextIsPartOfPaperDeviceFootprint, false);
});
