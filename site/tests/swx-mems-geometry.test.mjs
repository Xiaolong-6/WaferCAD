import assert from 'node:assert/strict';
import test from 'node:test';
import { createSnapshotManager } from '../workspace-snapshots.js';
import {
  createSwxGeometry,
  miteredPolyline,
  SWX_ASSUMPTIONS,
  SWX_DOI,
  SWX_REPORTED,
} from '../../scripts/swx-mems-geometry.mjs';

const approx = (actual, expected, tolerance = 1e-10) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    'Expected ' + actual + ' to be within ' + tolerance + ' of ' + expected,
  );
};

test('SWX source parameters preserve reported SOI, SWT and MEMS dimensions', () => {
  assert.equal(SWX_DOI, '10.1038/s41467-024-55528-9');
  assert.equal(SWX_REPORTED.siliconUm, 0.22);
  assert.equal(SWX_REPORTED.boxUm, 2);
  assert.equal(SWX_REPORTED.ridgeEtchUm, 0.15);
  assert.equal(SWX_REPORTED.crUm, 0.05);
  assert.equal(SWX_REPORTED.auUm, 0.3);
  assert.equal(SWX_REPORTED.swtPeriodUm, 0.29);
  assert.equal(SWX_REPORTED.swtDepthUm, 0.3);
  assert.equal(SWX_REPORTED.combFingerUnits, 40);
  assert.equal(SWX_REPORTED.foldedSpringLongBeamUm, 30);
  assert.equal(SWX_REPORTED.foldedSpringShortBeamUm, 22);
  assert.equal(SWX_REPORTED.foldedSpringClearanceUm, 1.5);
  assert.equal(SWX_REPORTED.structuralAlignerBeamUm, 0.1);
  assert.equal(SWX_REPORTED.structuralAlignerLengthUm, 7);
  assert.equal(SWX_ASSUMPTIONS.releaseUndercutUm, 2);
  assert.ok(SWX_ASSUMPTIONS.releaseUndercutUm > SWX_REPORTED.movableCombHandleUm / 2);
  assert.ok(SWX_ASSUMPTIONS.releaseUndercutUm < SWX_REPORTED.fixedCombHandleUm / 2);
  assert.match(SWX_ASSUMPTIONS.maskSource, /not measured\/author layout/);
});

test('SWX poses enforce 900nm OFF and 15nm ON gaps with 885nm translation', () => {
  const off = createSwxGeometry('off');
  const on = createSwxGeometry('on');
  approx(off.gapUm, 0.9);
  approx(on.gapUm, 0.015);
  approx(off.travelUm, 0);
  approx(on.travelUm, 0.885);
  assert.equal(off.layout.units.xy, 'µm');
  assert.equal(on.layout.units.xy, 'µm');
  assert.equal(off.layout.root, on.layout.root);
  assert.deepEqual(off.maskNames, on.maskNames);
  assert.notDeepEqual(off.maskPolygons.get(1), on.maskPolygons.get(1));
  assert.deepEqual(createSwxGeometry('off').layout, off.layout, 'Layout must be deterministic');
});

test('Each pose yields named, bounded and exportable polygon mask layers', () => {
  for (const pose of ['off', 'on']) {
    const generated = createSwxGeometry(pose);
    const [w, h] = SWX_ASSUMPTIONS.fieldUm;
    assert.deepEqual(generated.layout.bounds, {
      minX: -w / 2,
      minY: -h / 2,
      maxX: w / 2,
      maxY: h / 2,
      width: w,
      height: h,
    });
    assert.deepEqual([...generated.maskPolygons.keys()], [1, 2, 3]);
    assert.ok(generated.maskPolygons.get(1).length > 100);
    assert.equal(generated.maskPolygons.get(2).length, 16);
    assert.equal(generated.maskPolygons.get(3).length, 4);
    assert.equal(generated.layout.combos.length, 3);
    assert.equal(
      generated.layout.elements.length,
      [...generated.maskPolygons.values()].reduce((total, array) => total + array.length, 0),
    );
    for (const element of generated.layout.elements) {
      assert.equal(element.kind, 'polygon');
      assert.equal(element.sourceCell, generated.layout.root);
      assert.ok(element.points.length >= 4, 'Polygon has insufficient points');
      for (const [x, y] of element.points) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), 'Nonfinite coordinates');
        assert.ok(
          Math.abs(x) < w / 2 && Math.abs(y) < h / 2,
          'Mask geometry lies outside illustrative field',
        );
      }
    }
  }
});

test('Invalid poses fail explicitly rather than producing an implied device state', () => {
  assert.throws(() => createSwxGeometry('actuated'), /off or on/);
});

test('OFF/ON physical groups keep stationary anchors and move only the articulated layout', () => {
  const off = createSwxGeometry('off');
  const on = createSwxGeometry('on');
  assert.deepEqual(off.physicalGroups.fixed, on.physicalGroups.fixed, 'fixed Si must not move');
  assert.notDeepEqual(off.physicalGroups.movable, on.physicalGroups.movable);
  assert.notDeepEqual(off.physicalGroups.flexure, on.physicalGroups.flexure);
  assert.ok(off.physicalGroups.movable.length > 55, 'missing comb fingers or perforated shuttle');
  assert.ok(on.physicalGroups.flexure.length > 30, 'missing flexure centerline segments');
  approx(on.gapUm, 0.015, 1e-10);
});

test('one WaferCAD project restores OFF and ON from shared released manufacturing History', async () => {
  const { buildSwxMemsUnified } = await import('../../scripts/build-swx-mems-example.mjs');
  const { project } = await buildSwxMemsUnified();
  const ids = project.snapshotBranches.branches.map((b) => b.id);
  assert.deepEqual(ids, ['main', 'on']);
  const onBranch = project.snapshotBranches.branches[1];
  assert.equal(onBranch.parentBranchId, 'main');
  assert.equal(onBranch.rootNodeId, project.snapshotBranches.nodes.at(-2).id);
  assert.deepEqual(
    onBranch.headState.layout,
    project.layout,
    'both pose variants share lithography',
  );
  assert.deepEqual(onBranch.headState.processRecipe, project.processRecipe);
  assert.equal(
    onBranch.headState.model.processRevision,
    project.model.processRevision,
    'Actuation is not a manufacturing process step',
  );
  assert.notDeepEqual(onBranch.headState.model.regions, project.model.regions);

  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  const si = project.model.layers.find((layer) => layer.name === '220nm SOI device silicon').id;
  const { geometryArea } = await import('../model.js');
  // Pose activation may modify released device Si only. Handle, sacrificial
  // BOX and both electrical films must retain identical physical XY coverage.
  const areaForLayer = (model, layerId) =>
    v.unionGeometries(
      model.regions
        .filter((region) => region.stack.some((seg) => seg.layerId === layerId))
        .map((region) => region.geom),
    );
  for (const fixedName of [
    'Si handle (5um viewing surrogate)',
    'Buried SiO2 (BOX)',
    'Cr electrode',
    'Au electrode',
  ]) {
    const layerId = project.model.layers.find((layer) => layer.name === fixedName)?.id;
    assert.ok(layerId, 'Missing fixed material ' + fixedName);
    const offArea = areaForLayer(project.model, layerId);
    const onArea = areaForLayer(onBranch.headState.model, layerId);
    const materialChangedUm2 =
      geometryArea(v.difference(offArea, onArea)) + geometryArea(v.difference(onArea, offArea));
    assert.ok(
      materialChangedUm2 < 1e-6,
      fixedName + ' changed under OFF/ON actuation by ' + materialChangedUm2 + ' um²',
    );
  }
  const materialAt = (model, point) =>
    model.regions.find((r) => v.pointInMulti(point, r.geom))?.stack.some((s) => s.layerId === si);
  // The 15nm switched gap lies between y=.435um and y=.450um at the
  // nominal reflector plane; no silicon may fill it.
  assert.equal(materialAt(onBranch.headState.model, [-31, 0.4425]), false);
  assert.equal(materialAt(onBranch.headState.model, [-31, 0.4]), true);

  let live = structuredClone(project);
  const capture = () => {
    const state = structuredClone(live);
    delete state.snapshots;
    delete state.snapshotBranches;
    return state;
  };
  const restore = (state) => {
    live = structuredClone(state);
  };
  const manager = createSnapshotManager({ capture, restore, validateState: () => true });
  manager.importRecords(project.snapshots, project.snapshotBranches);
  assert.equal(manager.switchBranch('on'), true);
  assert.deepEqual(live.model, onBranch.headState.model);
  assert.deepEqual(live.layout, project.layout);
  assert.equal(manager.switchBranch('main'), true);
  assert.deepEqual(live.model, project.model, 'OFF physical model failed to restore');
});

test('longitudinal shuttle physically connects both moving comb handles', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  for (const pose of ['off', 'on']) {
    const g = createSwxGeometry(pose);
    const footprint = v.unionGeometries(
      g.physicalGroups.movable.map((points) => [[[...points, points[0]]]]),
    );
    const travel = g.travelUm;
    const points = [
      [-28, -1.6 + travel], // moving SWX facet attachment
      [-2.65, travel], // vertical shuttle frame
      [25, travel], // upper moving comb handle
      [-31, SWX_ASSUMPTIONS.lowerMovableCombYUm + travel], // lower left moving handle
      [6.7, 3 + travel], // upper right spring attachment
      [-6.7, 3 + travel], // upper left spring attachment
      [6.7, -3 + travel], // lower right spring attachment
      [-6.7, -3 + travel], // lower left spring attachment
    ];
    const componentIndices = points.map((point) =>
      footprint.findIndex((polygon) => v.pointInMulti(point, [polygon])),
    );
    const disconnected = points.map((point, index) => ({
      point,
      component: componentIndices[index],
    }));
    const details = JSON.stringify(disconnected);
    assert.ok(
      componentIndices.every((index) => index >= 0),
      pose + ' missing point ' + details,
    );
    assert.equal(
      new Set(componentIndices).size,
      1,
      pose + ' geometry lost a mechanical link between shuttle and comb buses: ' + details,
    );
  }
});

test('hard stop engagement limits both optical poses without filling the SWT gap', () => {
  for (const name of ['off', 'on']) {
    const generated = createSwxGeometry(name);
    const fixed = generated.physicalGroups.stopperFixed;
    const moving = generated.physicalGroups.stopperMovable;
    assert.equal(fixed.length, 4, 'both stationary stops must include attachment bridges');
    assert.equal(moving.length, 4, 'both moving stops must include attachment bridges');
    const expected = name === 'off' ? SWX_REPORTED.offGapUm : SWX_REPORTED.onGapUm;
    approx(generated.stopperClearanceUm, expected);
    approx(fixed[0][0][1] - moving[0][2][1], expected);
    approx(fixed[2][0][1] - moving[2][2][1], expected);
    assert.ok(expected > 0, 'stops may not interpenetrate');
  }
});

test('representative grating couplers keep full physical polygon bounds and port routes', () => {
  const model = createSwxGeometry('off');
  const shapes = model.physicalGroups.gratingCouplers;
  assert.equal(
    shapes.length,
    16,
    'two stationary grating bodies require sector and shallow grooves',
  );
  for (const poly of shapes) {
    assert.ok(poly.length >= 4);
    for (const [x, y] of poly) {
      assert.ok(
        x >= -56 && x <= 56 && y >= -52 && y <= 52,
        'grating coupler lies outside computational die',
      );
    }
  }
  assert.deepEqual(
    shapes,
    createSwxGeometry('on').physicalGroups.gratingCouplers,
    'fiber couplers may not move with the shuttle',
  );
});

test('6um shuttle is longitudinal in Y with genuine through-perforations', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  for (const state of ['off', 'on']) {
    const g = createSwxGeometry(state);
    const [left, right] = g.physicalGroups.shuttle;
    const outerX = [...left, ...right].map(([x]) => x);
    approx(Math.max(...outerX) - Math.min(...outerX), SWX_REPORTED.shuttleWidthUm);
    const y = [...left, ...right].map(([, value]) => value);
    assert.ok(Math.max(...y) - Math.min(...y) > 2 * SWX_REPORTED.shuttleWidthUm);
    const solids = v.unionGeometries(
      g.physicalGroups.shuttle.map((ring) => [[[...ring, ring[0]]]]),
    );
    assert.equal(v.pointInMulti([0, 2 + g.travelUm], solids), false, 'shuttle perforation filled');
    assert.equal(v.pointInMulti([0, 4 + g.travelUm], solids), true, 'shuttle cross brace missing');
  }
});

test('folded spring and guided aligner dimensions are distinguished from illustration assumptions', () => {
  const g = createSwxGeometry('off');
  assert.equal(g.physicalGroups.structuralAligners.fixed.length, 2);
  assert.equal(
    g.physicalGroups.structuralAligners.flexure.length,
    4,
    'each aligner must be one continuous Si beam and one brace',
  );
  assert.equal(g.physicalGroups.foldedSprings.length, 4);
  assert.ok(g.physicalGroups.foldedSprings.every((ring) => ring.length === 16));
  const foldedPitch = SWX_REPORTED.foldedSpringClearanceUm + SWX_REPORTED.foldedSpringWidthUm;
  approx(foldedPitch, 1.7);
  assert.ok(g.physicalGroups.flexure.length > 40);
});

test('both optical meanders connect SWX port and supported anchor without free ends', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  for (const state of ['off', 'on']) {
    const geometry = createSwxGeometry(state);
    const silicon = v.unionGeometries(
      geometry.maskPolygons.get(1).map((points) => [[[...points, points[0]]]]),
    );
    const movingOffset = geometry.travelUm;
    for (const side of [-1, 1]) {
      const port = [-10, side * 13 + (side < 0 ? movingOffset : 0)];
      const anchor = [2, side * 40];
      assert.ok(
        silicon.some((poly) => [port, anchor].every((point) => v.pointInMulti(point, [poly]))),
        'Disconnected optical meander at ' + state + ' side ' + side,
      );
    }
  }
});

test('both lower-reflector optical links deform while fixed upper routing stays unchanged', () => {
  const off = createSwxGeometry('off');
  const on = createSwxGeometry('on');
  assert.deepEqual(
    off.physicalGroups.opticalMeanders.fixed,
    on.physicalGroups.opticalMeanders.fixed,
    'the upper stationary reflector must not be actuated',
  );
  assert.notDeepEqual(
    off.physicalGroups.opticalMeanders.moving,
    on.physicalGroups.opticalMeanders.moving,
    'the lower output spring waveguide must deform',
  );
  assert.notDeepEqual(
    off.physicalGroups.gratingFeeds,
    on.physicalGroups.gratingFeeds,
    'the lower input spring waveguide must deform toward the anchored coupler',
  );
  assert.equal(off.physicalGroups.gratingFeeds.length, 1);
  assert.equal(on.physicalGroups.gratingFeeds.length, 1);
  assert.deepEqual(off.physicalGroups.gratingCouplers, on.physicalGroups.gratingCouplers);
});

test('both grating couplers have a continuous silicon slab with shallow-etched teeth', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  for (const state of ['off', 'on']) {
    const geometry = createSwxGeometry(state);
    assert.equal(geometry.physicalGroups.gratingGrooves.length, 12);
    const slab = v.unionGeometries(
      geometry.physicalGroups.gratingSlabs.map((points) => [[[...points, points[0]]]]),
    );
    for (const [cx, cy] of SWX_ASSUMPTIONS.gratingCentersUm) {
      const inner = [cx + SWX_ASSUMPTIONS.gratingRadiiUm[0], cy];
      const outer = [cx + SWX_ASSUMPTIONS.gratingRadiiUm.at(-1), cy];
      assert.ok(
        slab.some((poly) => [inner, outer].every((p) => v.pointInMulti(p, [poly]))),
        'Grating bars were not supported by continuous Si in ' + state,
      );
    }
  }
});

test('fixed comb electrodes remain mechanically isolated from the moving shuttle in both poses', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  for (const state of ['off', 'on']) {
    const g = createSwxGeometry(state);
    const components = v.unionGeometries(
      g.maskPolygons.get(1).map((points) => [[[...points, points[0]]]]),
    );
    const connectedPart = (point) =>
      components.findIndex((polygon) => v.pointInMulti(point, [polygon]));
    const movable = connectedPart([25, g.travelUm]);
    const leftMovable = connectedPart([-31, SWX_ASSUMPTIONS.lowerMovableCombYUm + g.travelUm]);
    const upperFixed = connectedPart([25, 9]);
    const lowerFixed = connectedPart([-32, SWX_ASSUMPTIONS.lowerStationaryCombYUm]);
    assert.equal(leftMovable, movable, 'Opposed moving banks lost shuttle electrical continuity');
    assert.ok(movable >= 0 && upperFixed >= 0 && lowerFixed >= 0);
    assert.notEqual(movable, upperFixed, 'Upper fixed comb touches moving Si shuttle in ' + state);
    assert.notEqual(movable, lowerFixed, 'Lower fixed comb touches moving Si shuttle in ' + state);
    assert.notEqual(upperFixed, lowerFixed, 'Opposing stationary combs are electrically shorted');
  }
});

test('all 40 fixed comb fingers physically join their anchored handles in OFF and ON', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  for (const state of ['off', 'on']) {
    const pose = createSwxGeometry(state);
    const components = v.unionGeometries(
      pose.maskPolygons.get(1).map((points) => [[[...points, points[0]]]]),
    );
    const netAt = (point) => components.findIndex((polygon) => v.pointInMulti(point, [polygon]));
    const upperHandle = netAt([25, 9]);
    const lowerHandle = netAt([-32, SWX_ASSUMPTIONS.lowerStationaryCombYUm]);
    assert.ok(upperHandle >= 0 && lowerHandle >= 0);
    assert.notEqual(upperHandle, lowerHandle);
    for (let i = 0; i < 20; i++) {
      const x = 8.8 + i * 1.65;
      assert.equal(netAt([x, 5.7]), upperHandle, state + ' detached upper fixed finger ' + i);
      const leftX = -x + SWX_ASSUMPTIONS.leftCombXShiftUm;
      assert.equal(
        netAt([leftX, -9.5 + SWX_ASSUMPTIONS.leftCombYShiftUm]),
        lowerHandle,
        state + ' detached lower fixed finger ' + i,
      );
    }
  }
});

test('opposed comb banks remain on opposite shuttle sides in both poses', () => {
  for (const state of ['off', 'on']) {
    const pose = createSwxGeometry(state);
    const [right, left] = pose.physicalGroups.combBanks.fixed;
    const centerX = (shape) => shape.reduce((sum, vertex) => sum + vertex[0], 0) / shape.length;
    assert.ok(centerX(right) > SWX_REPORTED.shuttleWidthUm / 2);
    assert.ok(centerX(left) < -SWX_REPORTED.shuttleWidthUm / 2);
    assert.equal(pose.physicalGroups.combBanks.fixed.length, 42);
    assert.equal(pose.physicalGroups.combBanks.moving.length, 42);
  }
});

test('opposed comb banks cannot cross compliant optical routing', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  const { geometryArea } = await import('../model.js');
  const multi = (polygons) => v.unionGeometries(polygons.map((ring) => [[[...ring, ring[0]]]]));
  for (const state of ['off', 'on']) {
    const pose = createSwxGeometry(state);
    const combs = multi([
      ...pose.physicalGroups.combBanks.fixed,
      ...pose.physicalGroups.combBanks.moving,
    ]);
    const optical = multi([
      ...pose.physicalGroups.opticalMeanders.fixed,
      ...pose.physicalGroups.opticalMeanders.moving,
      ...pose.physicalGroups.gratingFeeds,
    ]);
    const overlap = geometryArea(v.intersection(combs, optical));
    assert.ok(
      overlap < 1e-8,
      state + ' opposed combs intersect compliant optical lines by ' + overlap + ' µm²',
    );
  }
});

test('both electrostatic comb banks increase axial overlap equally along +Y', () => {
  for (const state of ['off', 'on']) {
    const pose = createSwxGeometry(state);
    const banks = pose.physicalGroups.combBanks;
    assert.equal(banks.fixed.length, 42);
    assert.equal(banks.moving.length, 42);
    const extent = (ring, axis) => {
      const coords = ring.map((point) => point[axis]);
      return [Math.min(...coords), Math.max(...coords)];
    };
    for (let index = 2; index < 42; index++) {
      const [fx0, fx1] = extent(banks.fixed[index], 0);
      const [mx0, mx1] = extent(banks.moving[index], 0);
      const [fy0, fy1] = extent(banks.fixed[index], 1);
      const [my0, my1] = extent(banks.moving[index], 1);
      // makeCombs groups the 20 right (+X) fingers first, followed by
      // 20 mirrored left (-X) fingers. Their positive lateral clearances
      // are measured toward opposite X directions.
      if (index < 22) approx(mx0 - fx1, SWX_REPORTED.combFingerGapUm);
      else approx(fx0 - mx1, SWX_REPORTED.combFingerGapUm);
      const overlap = Math.max(0, Math.min(fy1, my1) - Math.max(fy0, my0));
      approx(overlap, SWX_REPORTED.combFingerInitialOverlapUm + pose.travelUm);
    }
  }
});

test('fixed and movable silicon never overlap by positive area in either pose', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  const { geometryArea } = await import('../model.js');
  const toGeometry = (polygons) =>
    v.unionGeometries(polygons.map((ring) => [[[...ring, ring[0]]]]));
  for (const state of ['off', 'on']) {
    const pose = createSwxGeometry(state);
    const fixed = toGeometry(pose.physicalGroups.fixed);
    const movable = toGeometry(pose.physicalGroups.movable);
    const overlap = v.intersection(fixed, movable);
    const overlapAreaUm2 = geometryArea(overlap);
    let worstPairs = [];
    if (overlapAreaUm2 >= 1e-8) {
      const bounds = (ring) => ({
        minX: Math.min(...ring.map((p) => p[0])),
        maxX: Math.max(...ring.map((p) => p[0])),
        minY: Math.min(...ring.map((p) => p[1])),
        maxY: Math.max(...ring.map((p) => p[1])),
      });
      for (const [fi, a] of pose.physicalGroups.fixed.entries()) {
        const ba = bounds(a);
        for (const [mi, b] of pose.physicalGroups.movable.entries()) {
          const bb = bounds(b);
          if (ba.maxX <= bb.minX || bb.maxX <= ba.minX || ba.maxY <= bb.minY || bb.maxY <= ba.minY)
            continue;
          const patch = v.intersection([[[...a, a[0]]]], [[[...b, b[0]]]]);
          const area = geometryArea(patch);
          if (area > 1e-9) {
            worstPairs.push({
              fi,
              mi,
              area,
              bounds: {
                minX: Math.max(ba.minX, bb.minX),
                maxX: Math.min(ba.maxX, bb.maxX),
                minY: Math.max(ba.minY, bb.minY),
                maxY: Math.min(ba.maxY, bb.maxY),
              },
            });
          }
        }
      }
      worstPairs = worstPairs.sort((a, b) => b.area - a.area).slice(0, 12);
    }
    assert.ok(
      overlapAreaUm2 < 1e-8,
      state +
        ' fixed and moving Si geometries overlap by ' +
        overlapAreaUm2 +
        ' µm². Largest pairs: ' +
        JSON.stringify(worstPairs),
    );
  }
});

test('moving lower optical input remains coupled to a stationary grating in both poses', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  const toMulti = (polygons) => v.unionGeometries(polygons.map((ring) => [[[...ring, ring[0]]]]));
  const off = createSwxGeometry('off');
  const on = createSwxGeometry('on');
  assert.notDeepEqual(off.physicalGroups.gratingFeeds, on.physicalGroups.gratingFeeds);
  for (const pose of [off, on]) {
    const feed = toMulti(pose.physicalGroups.gratingFeeds);
    assert.equal(feed.length, 1, pose.state + ' moving optical input feed has a break');
    for (const point of [
      [-53, -13 + pose.travelUm],
      [-45, -25],
    ]) {
      assert.ok(
        v.pointInMulti(point, feed),
        pose.state + ' compliant grating feed is disconnected at ' + point.join(','),
      );
    }
  }
});

test('mitered 90-degree flexure corners are one solid ring without square-cap lips', () => {
  const [contour] = miteredPolyline(
    [
      [0, 0],
      [2, 0],
      [2, 2],
    ],
    0.2,
  );
  assert.equal(contour.length, 6, 'two elbows should not be tiled segment rectangles');
  approx(contour[1][0], 1.9);
  approx(contour[1][1], 0.1);
  approx(contour[4][0], 2.1);
  approx(contour[4][1], -0.1);
  // End caps are allowed on terminal attachments, never at an inner corner.
  assert.ok(
    contour.every(
      ([x, y]) => x >= -0.1 - 1e-10 && x <= 2.1 + 1e-10 && y >= -0.1 - 1e-10 && y <= 2.1 + 1e-10,
    ),
  );
  assert.throws(
    () =>
      miteredPolyline(
        [
          [0, 0],
          [2, 0],
          [0, 0],
        ],
        0.2,
      ),
    /near-reversal/,
  );
});

test('all four OFF/ON folded MEMS springs preserve reported widths and continuous bends', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  const pitch = SWX_REPORTED.foldedSpringWidthUm + SWX_REPORTED.foldedSpringClearanceUm;
  for (const state of ['off', 'on']) {
    const g = createSwxGeometry(state);
    assert.equal(g.physicalGroups.foldedSprings.length, 4);
    for (const [yi, signY] of [-1, 1].entries()) {
      for (const [xi, signX] of [-1, 1].entries()) {
        const ring = g.physicalGroups.foldedSprings[yi * 2 + xi];
        assert.equal(ring.length, 16, 'one smooth polygon per folded spring');
        const footprint = [[[...ring, ring[0]]]];
        const shift = (index) => (g.travelUm * index) / 7;
        const bends = [
          [signX * 2, signY * 10 + shift(1)],
          [signX * (2 + pitch), signY * 10 + shift(2)],
          [signX * (2 + pitch), signY * 32 + shift(3)],
          [signX * (2 + 2 * pitch), signY * 32 + shift(4)],
          [signX * (2 + 2 * pitch), signY * 10 + shift(5)],
          [signX * (2 + 3 * pitch), signY * 10 + shift(6)],
        ];
        for (const point of bends) {
          assert.ok(
            v.pointInMulti(point, footprint),
            state + ' spring lost connected silicon at miter ' + point.join(','),
          );
        }
      }
    }
  }
});
