import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompactSwxActuator } from '../../scripts/swx-mems-actuator-candidate.mjs';
import { SWX_REPORTED } from '../../scripts/swx-mems-geometry.mjs';

const closeTo = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, a + ' != ' + b);
const bounds = (poly) => ({
  minX: Math.min(...poly.map(([x]) => x)),
  maxX: Math.max(...poly.map(([x]) => x)),
  minY: Math.min(...poly.map(([, y]) => y)),
  maxY: Math.max(...poly.map(([, y]) => y)),
});
const axialOverlap = (a, b) =>
  Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));

test('compact S8 candidate places both 20-cell banks across one longitudinal shuttle', () => {
  for (const state of ['off', 'on']) {
    const pose = createCompactSwxActuator(state);
    assert.equal(pose.banks.length, 2);
    assert.equal(pose.springContours.length, 4);
    assert.equal(pose.anchors.length, 4);
    assert.ok(pose.banks[0].side < 0 && pose.banks[1].side > 0);
    const leftBus = bounds(pose.banks[0].stationary[0]);
    const rightBus = bounds(pose.banks[1].stationary[0]);
    closeTo((leftBus.minY + leftBus.maxY) / 2, (rightBus.minY + rightBus.maxY) / 2);
    assert.ok(leftBus.maxX < -SWX_REPORTED.shuttleWidthUm / 2);
    assert.ok(rightBus.minX > SWX_REPORTED.shuttleWidthUm / 2);
    const shuttleRail = bounds(pose.shuttle[0]);
    closeTo(shuttleRail.maxX - shuttleRail.minX, 0.7);
    assert.ok(shuttleRail.maxY - shuttleRail.minY > 40);
    assert.equal(pose.integrationStatus, 'isolated-mechanical-candidate-not-manufacturing-project');
  }
});

test('40 finger pairs preserve 300nm gap and 200nm plus travel axial overlap', () => {
  for (const state of ['off', 'on']) {
    const pose = createCompactSwxActuator(state);
    const overlap = SWX_REPORTED.combFingerInitialOverlapUm + pose.travelUm;
    const stationaryRegions = pose.banks.flatMap((bank) => bank.stationary);
    assert.equal(stationaryRegions.length, 42);
    for (const bank of pose.banks) {
      assert.equal(bank.stationary.length, 21);
      assert.equal(bank.moving.length, 21);
      for (let i = 1; i <= 20; i++) {
        const f = bounds(bank.stationary[i]);
        const m = bounds(bank.moving[i]);
        closeTo(axialOverlap(f, m), overlap);
        closeTo(
          bank.side > 0 ? m.minX - f.maxX : f.minX - m.maxX,
          SWX_REPORTED.combFingerGapUm,
        );
      }
    }
  }
});

test('compact spring anchors stay fixed and springs move only at shuttle ends', () => {
  const off = createCompactSwxActuator('off');
  const on = createCompactSwxActuator('on');
  closeTo(off.travelUm, 0);
  closeTo(on.travelUm, SWX_REPORTED.offGapUm - SWX_REPORTED.onGapUm);
  assert.deepEqual(off.anchors, on.anchors);
  for (let i = 0; i < 4; i++) {
    const a = bounds(off.springContours[i]);
    const b = bounds(on.springContours[i]);
    assert.ok(a.maxY > 39);
    closeTo(a.maxY, b.maxY);
    assert.ok(b.minY > a.minY, 'moving flexure tip must follow positive Y stroke');
    assert.equal(off.springContours[i].length, 16);
  }
});

test('compact candidate has no fixed/moving positive-area silicon overlap', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  const { geometryArea } = await import('../model.js');
  const union = (polys) => v.unionGeometries(polys.map((ring) => [[[...ring, ring[0]]]]));
  for (const state of ['off', 'on']) {
    const pose = createCompactSwxActuator(state);
    const overlapUm2 = geometryArea(v.intersection(union(pose.fixed), union(pose.movable)));
    assert.ok(overlapUm2 < 1e-8, state + ' stationary/movable silicon short ' + overlapUm2);
    const pieces = union(pose.movable);
    const component = (point) => pieces.findIndex((poly) => v.pointInMulti(point, [poly]));
    const sample = [
      [-25, -27.4 + pose.travelUm],
      [25, -27.4 + pose.travelUm],
      [-2.65, pose.travelUm],
      [2.65, pose.travelUm],
    ];
    const indices = sample.map(component);
    assert.ok(indices.every((i) => i >= 0));
    assert.equal(new Set(indices).size, 1, 'two comb handles must share the shuttle moving net');
  }
});
