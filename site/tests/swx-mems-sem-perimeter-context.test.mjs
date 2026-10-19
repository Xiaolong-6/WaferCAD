import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SWX_PERIMETER_CONTEXT_ASSUMPTIONS,
  createSwxSemPerimeterContext,
  SWX_PERIMETER_CONTEXT_PROCESS_PROFILE,
} from '../../scripts/swx-mems-sem-perimeter-context.mjs';
import { createSwxSemGroundReturnCandidate } from '../../scripts/swx-mems-sem-ground-return-candidate.mjs';

for (const state of ['off', 'on']) {
  test('SEM Fig. 3a ' + state + ' rejects invented exterior Si and closed ring', () => {
    const original = createSwxSemGroundReturnCandidate(state);
    const context = createSwxSemPerimeterContext(state);
    const assumptions = SWX_PERIMETER_CONTEXT_ASSUMPTIONS;
    assert.equal(assumptions.sourceClosedPerimeterTrenchObserved, false);
    assert.equal(assumptions.sourceFlankMaterialIdentityVerified, false);
    assert.equal(assumptions.sourcePerimeterSiGeometryVerified, false);
    assert.equal(assumptions.expectedExtraPerimeterSiliconPolygons, 0);
    assert.deepEqual(context.physicalGroups.semPerimeterContext, []);
    assert.deepEqual(context.maskPolygons, original.maskPolygons);
    assert.deepEqual(context.layout.elements, original.layout.elements);
    assert.deepEqual(context.layout.combos, original.layout.combos);
    assert.deepEqual(context.layout.bounds, {
      minX: -100,
      minY: -140,
      maxX: 100,
      maxY: 140,
      width: 200,
      height: 280,
    });
  });
}

test('a study field is not a measured author switch footprint', () => {
  const assumptions = SWX_PERIMETER_CONTEXT_ASSUMPTIONS;
  assert.deepEqual(assumptions.paperReportedSwitchFootprintUm, [95, 100]);
  assert.deepEqual(assumptions.paperReportedSwxFootprintUm, [23, 23]);
  assert.deepEqual(SWX_PERIMETER_CONTEXT_PROCESS_PROFILE.fieldUm, [200, 280]);
  assert.equal(assumptions.studyFieldIsMeasuredDeviceFootprint, false);
  assert.equal(assumptions.contextIsPartOfPaperDeviceFootprint, false);
  assert.equal(SWX_PERIMETER_CONTEXT_PROCESS_PROFILE.geometryFactory, createSwxSemPerimeterContext);
});
