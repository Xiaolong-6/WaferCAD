import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSwxCompactProcessGeometry,
  SWX_COMPACT_PROCESS_PROFILE,
} from '../../scripts/swx-mems-compact-process-geometry.mjs';
import { SWX_REPORTED } from '../../scripts/swx-mems-geometry.mjs';

test('compact process retains all canonical mask layers within its true field', () => {
  const [width, height] = SWX_COMPACT_PROCESS_PROFILE.fieldUm;
  assert.deepEqual([width, height], [160, 220]);
  for (const state of ['off', 'on']) {
    const source = createSwxCompactProcessGeometry(state);
    assert.equal(source.layout.bounds.width, width);
    assert.equal(source.layout.bounds.height, height);
    assert.equal(source.maskPolygons.size, 3);
    for (const layer of [1, 2, 3]) {
      const polys = source.maskPolygons.get(layer);
      assert.ok(polys.length > 0, state + ' missing source mask ' + layer);
      for (const polygon of polys) {
        for (const [x, y] of polygon) {
          assert.ok(
            x >= -width / 2 && x <= width / 2 && y >= -height / 2 && y <= height / 2,
            state + ' mask outside substrate at (' + x + ',' + y + ')',
          );
        }
      }
    }
    assert.equal(source.maskPolygons.get(3).length, 6);
    assert.equal(source.physicalGroups.actuator.banks.length, 2);
    assert.equal(source.physicalGroups.actuator.springContours.length, 4);
    assert.equal(source.reconstructionStatus, 'isolated-compact-candidate');
  }
});

test('compact candidate keeps common lithographic mask and numeric OFF/ON optical gap', () => {
  const off = createSwxCompactProcessGeometry('off');
  const on = createSwxCompactProcessGeometry('on');
  assert.deepEqual(off.maskNames, on.maskNames);
  assert.deepEqual(off.maskPolygons.get(3), on.maskPolygons.get(3));
  assert.equal(off.gapUm, SWX_REPORTED.offGapUm);
  assert.ok(Math.abs(on.gapUm - SWX_REPORTED.onGapUm) < 1e-10);
  assert.equal(on.travelUm, SWX_REPORTED.offGapUm - SWX_REPORTED.onGapUm);
  assert.equal(SWX_COMPACT_PROCESS_PROFILE.assumptions.sourceGratingGroovesImplemented, false);
  assert.equal(SWX_COMPACT_PROCESS_PROFILE.assumptions.guidedMechanicalAlignersImplemented, false);
});

test('every critical BOX/electrode probe is inside the expanded fabrication field', () => {
  const [width, height] = SWX_COMPACT_PROCESS_PROFILE.fieldUm;
  const points = [
    ...SWX_COMPACT_PROCESS_PROFILE.electricalContactPoints,
    ...SWX_COMPACT_PROCESS_PROFILE.guidedSupportPoints,
    ...SWX_COMPACT_PROCESS_PROFILE.combSupportProbes.map(({ point }) => point),
    ...SWX_COMPACT_PROCESS_PROFILE.shallowEtchProbes.flatMap(({ groovePoint, ridgePoint }) => [
      groovePoint,
      ridgePoint,
    ]),
  ];
  for (const [x, y] of points) {
    assert.ok(
      Math.abs(x) < width / 2 && Math.abs(y) < height / 2,
      'Process test point outside actual field ' + [x, y].join(','),
    );
  }
});
