import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSwxCompactProcessGeometry,
  SWX_COMPACT_PROCESS_PROFILE,
} from '../../scripts/swx-mems-compact-process-geometry.mjs';
import { SWX_REPORTED } from '../../scripts/swx-mems-geometry.mjs';
import {
  createCompactGratingGrooves,
  SWX_COMPACT_GRATING_ASSUMPTIONS,
} from '../../scripts/swx-mems-compact-gratings.mjs';

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
    assert.equal(source.maskPolygons.get(2).length, 28, '4 SWT trims + 24 shallow grating arcs');
    assert.equal(source.physicalGroups.gratingGrooves.length, 24);
    assert.equal(source.physicalGroups.guides.guides.length, 2);
    assert.equal(source.physicalGroups.guides.fixed.length, 2);
    assert.equal(source.physicalGroups.guides.flexure.length, 4);
    assert.equal(source.layout.elements.length, 188);
    assert.equal(source.physicalGroups.actuator.banks.length, 2);
    assert.equal(source.physicalGroups.actuator.shuttleDiagonals.length, 10);
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
  assert.equal(
    SWX_COMPACT_PROCESS_PROFILE.assumptions.physicallyEtchedCandidateGratingGrooves,
    true,
  );
  assert.deepEqual(
    off.physicalGroups.gratingGrooves,
    on.physicalGroups.gratingGrooves,
    'Stationary grating grooves must not deform with ON actuation',
  );
  assert.equal(SWX_COMPACT_PROCESS_PROFILE.assumptions.guidedMechanicalAlignersImplemented, true);
  assert.equal(SWX_COMPACT_PROCESS_PROFILE.assumptions.authorGuideAnchorCoordinatesVerified, false);
  assert.equal(SWX_COMPACT_PROCESS_PROFILE.assumptions.independentStructuralFEMValidated, false);
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

test('candidate four-terminal grating patterns have physical 150nm etch sites and retained full-height ribs', () => {
  const { grooves, probes } = createCompactGratingGrooves();
  const a = SWX_COMPACT_GRATING_ASSUMPTIONS;
  assert.equal(grooves.length, a.centersUm.length * a.groovesPerTerminal);
  assert.equal(probes.length, grooves.length);
  assert.ok(a.grooveWidthUm > 0 && a.groovePitchUm > a.grooveWidthUm);
  assert.ok(
    a.padWidthUm / 2 >
      a.firstGrooveRadiusUm + (a.groovesPerTerminal - 1) * a.groovePitchUm + a.grooveWidthUm,
  );
  assert.equal(a.sourcePitchVerified, false);
  const tol = 1e-8;
  // Segment-resolved polygon occupancy: probe should genuinely lie in its
  // intended mask ring, and the inter-groove rib probe in none.
  const isInside = ([px, py], polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [ax, ay] = polygon[i],
        [bx, by] = polygon[j];
      if (ay > py !== by > py && px < ((bx - ax) * (py - ay)) / (by - ay) + ax) {
        inside = !inside;
      }
    }
    return inside;
  };
  for (let i = 0; i < probes.length; i++) {
    const { groovePoint, ridgePoint, terminal } = probes[i];
    assert.ok(isInside(groovePoint, grooves[i]), 'Missing etched groove mask at ' + i);
    assert.ok(
      grooves.every((polygon) => !isInside(ridgePoint, polygon)),
      'Residual silicon rib incorrectly etched at ' + i,
    );
    for (const point of grooves[i]) {
      assert.ok(Math.abs(point[0] - terminal[0]) < a.padWidthUm / 2 - tol);
      assert.ok(Math.abs(point[1] - terminal[1]) < a.padWidthUm / 2 - tol);
    }
  }
  assert.equal(a.deviceEtchDepthUm, SWX_REPORTED.ridgeEtchUm);
  assert.ok(Math.abs(a.residualSiUm - (SWX_REPORTED.siliconUm - SWX_REPORTED.ridgeEtchUm)) < tol);
});
