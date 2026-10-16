import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSwxOptomechanicalCandidate,
  SWX_INTERFACE_ASSUMPTIONS,
} from '../../scripts/swx-mems-optomechanical-candidate.mjs';
import { SWX_REPORTED } from '../../scripts/swx-mems-geometry.mjs';
import { filletPolyline } from '../../scripts/swx-mems-compact-bends.mjs';

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
  assert.equal(off.integrationStatus, 'optical-four-port-routing-candidate-no-wafercad-project');
  assert.equal(off.opticalRouting.fixed.length, 2);
  assert.equal(off.opticalRouting.movingSpringWaveguides.length, 2);
  assert.equal(off.opticalRouting.supportedPads.length, 4);
  assert.deepEqual(off.opticalRouting.fixed, on.opticalRouting.fixed);
  assert.deepEqual(off.opticalRouting.supportedPads, on.opticalRouting.supportedPads);
  assert.notDeepEqual(
    off.opticalRouting.movingSpringWaveguides,
    on.opticalRouting.movingSpringWaveguides,
  );
});

test('translated SWT and mechanical connector have coherent physical envelope', () => {
  for (const state of ['off', 'on']) {
    const pose = createSwxOptomechanicalCandidate(state);
    const b = polygonBound(pose.optics.movableFacetsAndPorts[0]);
    assert.ok(b[0] > -6 && b[2] < 6, 'moving SWT should face the Y-oriented shuttle');
    assert.ok(b[3] < SWX_INTERFACE_ASSUMPTIONS.offsetYUm + pose.travelUm);
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
  const union = (polygons) => v.unionGeometries(polygons.map((ring) => [[[...ring, ring[0]]]]));
  for (const state of ['off', 'on']) {
    const pose = createSwxOptomechanicalCandidate(state);
    const fixed = union(pose.fixed);
    const moving = union(pose.movable);
    const overlap = geometryArea(v.intersection(fixed, moving));
    assert.ok(
      overlap < 1e-8,
      state + ' moving SWT/shuttle overlaps fixed silicon by ' + overlap + ' µm²',
    );
    const flexible = pose.opticalRouting.movingSpringWaveguides;
    const fixedRoutes = pose.opticalRouting.fixed;
    // Each compliant route MUST connect to exactly its supported pad.
    // Exempt only those four intentional terminal pads from the fixed net
    // exclusion test; any other fixed Si intersection remains prohibited.
    const anchoredPads = pose.opticalRouting.supportedPads;
    const fixedWithoutOpticalPads = pose.fixed.filter((ring) => !anchoredPads.includes(ring));
    assert.ok(
      geometryArea(v.intersection(union(flexible), union(fixedWithoutOpticalPads))) < 1e-8,
      state + ' compliant waveguides intersect unrelated rigid fixed silicon',
    );
    for (let index = 0; index < flexible.length; index++) {
      const target = anchoredPads[index + 2];
      const attached = geometryArea(v.intersection(union([flexible[index]]), union([target])));
      assert.ok(
        attached > 1e-6,
        state + ' compliant waveguide ' + index + ' misses its stationary terminal',
      );
      for (let other = 0; other < anchoredPads.length; other++) {
        if (other === index + 2) continue;
        const cross = geometryArea(
          v.intersection(union([flexible[index]]), union([anchoredPads[other]])),
        );
        assert.ok(
          cross < 1e-8,
          state + ' optical flexure touches unrelated supported pad ' + other,
        );
      }
    }
    assert.ok(
      geometryArea(v.intersection(union(fixedRoutes), moving)) < 1e-8,
      state + ' stationary optical routes intersect the moving actuator',
    );
    assert.ok(
      geometryArea(v.intersection(union(flexible.slice(0, 1)), union(flexible.slice(1)))) < 1e-8,
      state + ' moving optical waveguides short each other',
    );
    const connectedRegion = (point) => moving.findIndex((poly) => v.pointInMulti(point, [poly]));
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

test('each optical port terminates at the correct fixed/moving node', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  const union = (polygons) => v.unionGeometries(polygons.map((ring) => [[[...ring, ring[0]]]]));
  for (const state of ['off', 'on']) {
    const pose = createSwxOptomechanicalCandidate(state);
    const route = pose.opticalRouting;
    const fixedNets = union([...pose.optics.fixedFacetsAndPorts, ...route.fixed]);
    const movingNets = union([
      ...pose.optics.movableFacetsAndPorts,
      ...route.movingSpringWaveguides,
    ]);
    const fixedPorts = [
      [-22, -35],
      [21, -35],
    ];
    const movingPorts = [
      [-22, -61 + pose.travelUm],
      [21, -61 + pose.travelUm],
    ];
    for (const point of fixedPorts) {
      assert.ok(
        fixedNets.some((poly) => v.pointInMulti(point, [poly])),
        state + ' fixed optical port disconnected at ' + point.join(','),
      );
    }
    for (const point of movingPorts) {
      assert.ok(
        movingNets.some((poly) => v.pointInMulti(point, [poly])),
        state + ' moving optical port disconnected at ' + point.join(','),
      );
    }
  }
});

test('S6 double-hairpin topology: BOTH moving legs carry 5um and 3um 180-degree bends', () => {
  for (const state of ['off', 'on']) {
    const pose = createSwxOptomechanicalCandidate(state);
    const centerlines = pose.opticalRouting.movingCenterlines;
    assert.equal(centerlines.length, 2);
    for (const [leg, path] of centerlines.entries()) {
      assert.equal(path.halfTurns.length, 2, 'Each waveguide needs two 180deg bends, not one');
      assert.deepEqual(
        path.halfTurns.map(({ radiusUm }) => radiusUm),
        SWX_REPORTED.meanderRadiiUm,
      );
      assert.equal(path.arcs.length, 3, 'Two U-bends plus one tangent terminal approach');
      assert.ok(path.arcs.every((arc) => Number.isFinite(arc.sweepRad)));
      for (const arc of path.arcs) {
        for (let index = arc.startIndex; index <= arc.endIndex; index++) {
          const [x, y] = path.points[index];
          assert.ok(
            Math.abs(Math.hypot(x - arc.center[0], y - arc.center[1]) - arc.radiusUm) < 1e-9,
            state + ' leg ' + leg + ' violates exact circular radius',
          );
        }
      }
      assert.equal(path.motionModel, 'kinematic_extension_of_terminal_straight_not_FEM');
      approx(path.movingStart[1], -61 + pose.travelUm);
      approx(path.stationaryEnd[1], -95);
      assert.deepEqual(path.points.at(-1), path.stationaryEnd);
      assert.equal(path.placementSource, 'illustrative_S6_topology_not_authors_GDS');
    }
  }
  assert.throws(
    () =>
      filletPolyline(
        [
          [0, 0],
          [1, 0],
          [1, 1],
        ],
        5,
      ),
    /does not fit available centerline segment/,
    'Unfabricable tight optical fillets must be rejected',
  );
});
