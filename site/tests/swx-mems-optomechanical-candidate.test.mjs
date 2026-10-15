import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSwxOptomechanicalCandidate,
  SWX_INTERFACE_ASSUMPTIONS,
} from '../../scripts/swx-mems-optomechanical-candidate.mjs';
import { SWX_REPORTED } from '../../scripts/swx-mems-geometry.mjs';

const approx = (a, b, tolerance = 1e-10) =>
  assert.ok(Math.abs(a - b) < tolerance, a + ' differs from ' + b);
const polygonBound = (ring) => {
  const xs = ring.map(([x]) => x);
  const ys = ring.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

test('compact optical-to-actuator candidate keeps canonical SWT gaps and correct +Y travel', () => {
  const off = createSwxOptomechanicalCandidate('off');
  const on = createSwxOptomechanicalCandidate('on');
  approx(off.gapUm, SWX_REPORTED.offGapUm);
  approx(on.gapUm, SWX_REPORTED.onGapUm);
  approx(on.travelUm, SWX_REPORTED.offGapUm - SWX_REPORTED.onGapUm);
  assert.deepEqual(off.optics.fixedFacetsAndPorts, on.optics.fixedFacetsAndPorts);
  assert.deepEqual(off.optics.fixedStops, on.optics.fixedStops);
  assert.notDeepEqual(off.optics.movableFacetsAndPorts, on.optics.movableFacetsAndPorts);
  assert.equal(off.actuator.banks.length, 2);
  assert.equal(off.actuator.springContours.length, 4);
  assert.equal(off.integrationStatus, 'facet-and-shuttle-interface-only-no-wafercad-project');
});

test('translated SWT and mechanical connector have coherent physical envelope', () => {
  for (const state of ['off', 'on']) {
    const pose = createSwxOptomechanicalCandidate(state);
    const b = polygonBound(pose.optics.movableFacetsAndPorts[0]);
    assert.ok(b[0] > -6 && b[2] < 6, 'moving SWT should face the Y-oriented shuttle');
    assert.ok(b[3] < SWX_INTERFACE_ASSUMPTIONS.offsetYUm);
    const bridge = polygonBound(pose.mechanicalBridge[0]);
    assert.ok(bridge[0] > 3, 'bridge must depart the moving reflector on its right side');
    assert.ok(bridge[2] < 25, 'bridge must not enter the fixed comb bus');
    assert.ok(bridge[3] < -25, 'bridge terminates at the moving comb handle');
  }
});

test('SWT-to-shuttle interface has no fixed/moving positive-area overlap and one moving Si net', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  const { geometryArea } = await import('../model.js');
  const union = (polygons) =>
    v.unionGeometries(polygons.map((ring) => [[[...ring, ring[0]]]]));
  for (const state of ['off', 'on']) {
    const pose = createSwxOptomechanicalCandidate(state);
    const fixed = union(pose.fixed);
    const moving = union(pose.movable);
    const overlap = geometryArea(v.intersection(fixed, moving));
    assert.ok(
      overlap < 1e-8,
      state + ' moving SWT/shuttle overlaps fixed silicon by ' + overlap + ' µm²',
    );
    const connectedRegion = (point) =>
      moving.findIndex((poly) => v.pointInMulti(point, [poly]));
    const samplePoints = [
      [-25, -27.4 + pose.travelUm],
      [25, -27.4 + pose.travelUm],
      [0, SWX_INTERFACE_ASSUMPTIONS.offsetYUm - 1.6 + pose.travelUm],
      [24, SWX_INTERFACE_ASSUMPTIONS.offsetYUm - 1.6 + pose.travelUm],
    ];
    const indices = samplePoints.map(connectedRegion);
    assert.ok(
      indices.every((n) => n >= 0),
      state + ' expected moving silicon missing at ' + JSON.stringify(samplePoints),
    );
    assert.equal(
      new Set(indices).size,
      1,
      state + ' moving SWT does not connect to both actuator comb buses',
    );
  }
});
