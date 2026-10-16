import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSwxSemV2ProcessGeometry,
  SWX_SEM_V2_ASSUMPTIONS,
  createSwxSemV2SupportAudit,
} from '../../scripts/swx-mems-sem-v2-unit.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const v = await import('../vector-geometry.js');
const { geometryArea } = await import('../model.js');
const union = (rings) => v.unionGeometries(rings.map((ring) => [[[...ring, ring[0]]]]));
const contact = (a, b) => geometryArea(v.intersection(union(a), union(b)));
const centroid = (ring) => {
  const x = ring.map((p) => p[0]);
  const y = ring.map((p) => p[1]);
  return [(Math.min(...x) + Math.max(...x)) / 2, (Math.min(...y) + Math.max(...y)) / 2];
};

test('SEM v2 comb below SWX and opposed fixed optical ports', () => {
  assert.equal(SWX_SEM_V2_ASSUMPTIONS.fullFidelityClaim, false);
  assert.equal(SWX_SEM_V2_ASSUMPTIONS.sourceAuthorGdsAvailable, false);
  for (const state of ['off', 'on']) {
    const { maskPolygons, physicalGroups, layout } = createSwxSemV2ProcessGeometry(state);
    const pose = physicalGroups.semV2;
    const mobileSwxY = centroid(pose.source.optics.movableFacetsAndPorts[0])[1];
    const centerCombY = centroid(pose.movableActuator[0])[1];
    assert.ok(
      centerCombY < mobileSwxY,
      state + ' actuator must be BELOW movable reflector, like paper SEM',
    );
    assert.deepEqual(pose.fixedPads.map(centroid), [
      [-70, -20],
      [70, -20],
      [-64, -77],
      [64, -77],
    ]);
    assert.equal(
      maskPolygons.get(1).length,
      pose.fixed.length + pose.movable.length + pose.flexure.length,
    );
    assert.ok(layout.bounds.minY <= -124);
    assert.ok(layout.bounds.maxX >= 76);
    assert.equal(pose.springContours.length, 4);
    assert.equal(pose.lowerSpringCenterlines.length, 2);
    const [lowerLeft, lowerRight] = pose.lowerSpringCenterlines;
    for (const path of [lowerLeft, lowerRight]) {
      for (const [start, finish, nominal] of [
        [0, 1, 30],
        [2, 3, 22],
        [4, 5, 30],
      ]) {
        assert.ok(
          Math.abs(Math.abs(path[finish][0] - path[start][0]) - nominal) < 1e-10,
          state + ' lower folded spring lost its 30/22um parallel spans',
        );
      }
      assert.equal(path[0][1], -99, 'Fixed anchor must not follow moving shuttle');
    }
    assert.equal(lowerLeft[0][0], -49);
    assert.equal(lowerRight[0][0], 49);
    assert.equal(pose.opticalFlexures.length, 2);
    assert.equal(pose.bridge.length, 2);
  }
});

test('SEM v2 stationary and movable silicon do not short in OFF or ON pose', () => {
  for (const state of ['off', 'on']) {
    const pose = createSwxSemV2ProcessGeometry(state).physicalGroups.semV2;
    assert.ok(
      contact(pose.fixed, pose.movable) < 1e-8,
      state + ' moving actuator or SWX contacts unrelated fixed Si',
    );
    for (let i = 0; i < 4; i++) {
      const own = pose.fixedActuator.at(-4 + i);
      assert.ok(contact([pose.springContours[i]], [own]) > 1e-4);
      if (i % 2 === 0) {
        const unrelatedFixed = pose.fixed.filter((ring) => ring !== own);
        assert.ok(
          contact([pose.springContours[i]], unrelatedFixed) < 1e-8,
          state + ' new horizontal lower spring touches unrelated stationary Si',
        );
        assert.ok(
          contact([pose.springContours[i]], pose.opticalFlexures) < 1e-8,
          state + ' lower spring touches S6 optical flexure',
        );
      }
      assert.ok(
        contact([pose.springContours[i]], pose.movableActuator) > 1e-4,
        state + ' folded spring ' + i + ' is disconnected from moving shuttle',
      );
    }
    for (let i = 0; i < 2; i++) {
      assert.ok(
        pose.fixedRoutes[i].length > 16,
        state + ' fixed input/output must have a smooth bent guide, not an L-shaped post',
      );
      assert.ok(
        contact([pose.fixedRoutes[i]], pose.opticalFlexures) < 1e-8,
        state + ' fixed optical lead is shorted to a moving S6 waveguide',
      );
      assert.ok(
        contact([pose.fixedRoutes[i]], [pose.fixedPads[i]]) > 1e-4,
        state + ' stationary optical feed ' + i + ' missing pad contact',
      );
      assert.ok(
        contact([pose.opticalFlexures[i]], [pose.fixedPads[i + 2]]) > 1e-4,
        state + ' moving S6 optical feed ' + i + ' missing supported pad',
      );
      assert.ok(
        contact([pose.opticalFlexures[i]], [pose.source.optics.movableFacetsAndPorts[i + 3]]) >
          1e-5,
        state + ' S6 optical route ' + i + ' lost movable SWX port',
      );
    }
    assert.ok(contact(pose.bridge, pose.source.optics.movableFacetsAndPorts) > 1e-4);
    assert.ok(contact(pose.bridge, pose.movableActuator) > 1e-4);
  }
});

test('SEM v2 real post-release support ownership is 12 fixed and 14 suspended sites', () => {
  for (const state of ['off', 'on']) {
    const probes = createSwxSemV2SupportAudit(state);
    assert.equal(probes.supported.length, 12);
    assert.equal(probes.released.length, 14);
    assert.equal(probes.outerIsolationTrenchVerified, false);
    assert.equal(probes.sourceHFUndercutFrontVerified, false);
    const names = [...probes.supported, ...probes.released].map((x) => x.name);
    assert.equal(new Set(names).size, 26);
  }
});
