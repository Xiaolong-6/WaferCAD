import assert from 'node:assert/strict';
import test from 'node:test';
import { createSnapshotManager } from '../workspace-snapshots.js';
import {
  createSwxGeometry,
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
  assert.equal(SWX_ASSUMPTIONS.releaseUndercutUm, 4);
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
  assert.ok(off.physicalGroups.movable.length > 70, 'missing comb fingers or lattice shuttle');
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

test('lattice shuttle physically connects the upper and lower moving comb buses', async () => {
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
      [-20, SWX_REPORTED.shuttleWidthUm / 2 + travel],
      [25, travel],
      [25, -11.2 + travel],
      [42, -6 + travel],
    ];
    assert.ok(
      footprint.some((polygon) => points.every((point) => v.pointInMulti(point, [polygon]))),
      pose + ' geometry lost a mechanical link between shuttle and comb buses',
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
  assert.ok(shapes.length >= 18, 'two fiber couplers require teeth and waveguide routes');
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

test('shuttle truss uses the reported 6um outside rail separation', () => {
  for (const state of ['off', 'on']) {
    const g = createSwxGeometry(state);
    const [top, bottom] = g.physicalGroups.shuttle;
    const yTop = top[0][1];
    const yBottom = bottom[0][1];
    approx(yTop - yBottom, SWX_REPORTED.shuttleWidthUm);
  }
});

test('folded spring and guided aligner dimensions are distinguished from illustration assumptions', () => {
  const g = createSwxGeometry('off');
  assert.equal(g.physicalGroups.structuralAligners.fixed.length, 2);
  assert.ok(g.physicalGroups.structuralAligners.flexure.length >= 10);
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
