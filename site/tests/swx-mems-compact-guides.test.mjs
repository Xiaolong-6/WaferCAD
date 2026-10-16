import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCompactSwxGuides,
  SWX_COMPACT_GUIDE_ASSUMPTIONS,
} from '../../scripts/swx-mems-compact-guides.mjs';
import { SWX_REPORTED } from '../../scripts/swx-mems-geometry.mjs';
import { createSwxOptomechanicalCandidate } from '../../scripts/swx-mems-optomechanical-candidate.mjs';

test('S7 isolated guide candidates preserve the measured beam/truss dimensions', () => {
  const off = createCompactSwxGuides(0);
  const on = createCompactSwxGuides(SWX_REPORTED.offGapUm - SWX_REPORTED.onGapUm);
  assert.equal(off.guides.length, 2);
  assert.equal(off.fixed.length, 2);
  assert.equal(off.flexure.length, 4);
  assert.equal(SWX_REPORTED.structuralAlignerLengthUm, 7);
  assert.equal(SWX_REPORTED.structuralAlignerBeamUm, 0.1);
  assert.equal(SWX_REPORTED.structuralAlignerTrussUm, 1);
  assert.deepEqual(off.fixed, on.fixed, 'BOX-supported guide anchors cannot move');
  for (let i = 0; i < 2; i++) {
    const a = off.guides[i], b = on.guides[i];
    assert.equal(a.centerline.length, 17);
    assert.deepEqual(a.centerline[0], b.centerline[0]);
    assert.ok(Math.abs(b.centerline.at(-1)[1] - a.centerline.at(-1)[1] - on.travelUm) < 1e-10);
    assert.equal(a.truss.length, 4);
  }
  assert.equal(SWX_COMPACT_GUIDE_ASSUMPTIONS.validatedFEM, false);
  assert.throws(() => createCompactSwxGuides(-0.01), /Invalid guide stroke/);
});

test('unqualified guide pads remain OUTSIDE production compact fabrication mask', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const vector = await import('../vector-geometry.js');
  const { geometryArea } = await import('../model.js');
  const union = (polys) => vector.unionGeometries(polys.map((ring) => [[[...ring, ring[0]]]]));
  for (const state of ['off', 'on']) {
    const model = createSwxOptomechanicalCandidate(state);
    const isolated = createCompactSwxGuides(model.travelUm);
    const anchorBridgeContact = geometryArea(
      vector.intersection(union(isolated.fixed), union(model.movable)),
    );
    assert.ok(
      anchorBridgeContact > 1e-6,
      'This guide layout must remain isolated until the bridge/anchor collision is redesigned',
    );
    const currentContact = geometryArea(vector.intersection(union(model.fixed), union(model.movable)));
    assert.ok(currentContact < 1e-8, state + ' process candidate is not electrically isolated');
  }
});
