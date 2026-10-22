import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { replayQ2ChipPose } from '../../scripts/transmon-q2-integrated-diagnostic.mjs';
import { expandProjectStorage } from '../project-io.js';
import { validateProjectFile } from '../project-schema.js';
import { pointInMulti } from '../vector-geometry.js';
import { materialSolids, sectionSlices } from '../model-view-geometry.js';

test('Q2 actual chip2 pose + Nb/Si recess + three static Al shadows share one recoverable model', {
  skip: !process.env.WAFERCAD_TRANSMON_GDS,
}, async () => {
  const source = await readFile(process.env.WAFERCAD_TRANSMON_GDS);
  const oxide = {
    thicknessUm: 0.002,
    source: 'Illustrative hypothesis only; not a measurement or oxygen growth model',
  };
  const { project, report } = replayQ2ChipPose(source, { oxide });
  assert.equal(report.sourceSha256,
    '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02');
  assert.deepEqual(report.physicalPlacement, {
    cell: 'chip2 / jj_width0p18', xUm: 1400, yUm: 2513, rotationDeg: 90,
  });
  assert.ok(Math.abs(report.etchedSiTopZUm - 337.45) < 1e-9);
  assert.ok(Math.abs(report.firstTwoAlOverlapAreaUm2 - 0.03226249) < 5e-5);
  assert.equal(report.modelLayers, 6);
  assert.equal(report.processRevisions, 6);
  assert.equal(report.strictProjectRoundTrip, true);
  assert.equal(report.tunnelJunctionValidated, false);
  assert.match(report.method, /STATIC/);
  const restored = JSON.parse(project);
  expandProjectStorage(restored);
  validateProjectFile(restored);
  const atCenter = (point) =>
    restored.model.regions.find((region) => pointInMulti(point, region.geom))?.stack;
  const siInOpening = atCenter([0, 0]);
  assert.equal(siInOpening.length, 1);
  assert.ok(Math.abs(siInOpening[0].z1 - 337.45) < 1e-8);
  const retainedNb = atCenter([0, 12]);
  assert.ok(retainedNb.length === 2);
  assert.ok(Math.abs(retainedNb[1].z1 - 337.7) < 1e-8);
  const junction = atCenter(report.crossSectionCenterUm);
  assert.equal(junction.length, 5);
  assert.deepEqual(junction.map((s) => Number(s.z1.toFixed(3))),
    [337.45, 337.49, 337.492, 337.522, 337.552]);
  // Source layout and material geometry must use the same wafer-frame 90° pose.
  const ys = restored.layout.elements.flatMap((e) => (e.points || []).map((p) => p[1]));
  assert.ok(Math.max(...ys) >= 20 && Math.min(...ys) <= -20);
});

test('illustrative tunnel spacer remains opt-in, not a fabricated material by default', {
  skip: !process.env.WAFERCAD_TRANSMON_GDS,
}, async () => {
  const source = await readFile(process.env.WAFERCAD_TRANSMON_GDS);
  const { project, report } = replayQ2ChipPose(source);
  assert.equal(report.oxideHypothesis, null);
  assert.equal(report.modelLayers, 5);
  assert.equal(report.processRevisions, 5);
  const restored = JSON.parse(project);
  expandProjectStorage(restored);
  validateProjectFile(restored);
  assert.equal(restored.model.layers.some((l) => /AlOx/.test(l.name)), false);
});


test('Q2 cross-section material interfaces match the native 3D solid slab Z ownership', {
  skip: !process.env.WAFERCAD_TRANSMON_GDS,
}, async () => {
  const source = await readFile(process.env.WAFERCAD_TRANSMON_GDS);
  const { project } = replayQ2ChipPose(source, {
    oxide: { thicknessUm: 0.002, source: 'Illustrative geometry, not measured AlOx' },
  });
  const restored = JSON.parse(project);
  expandProjectStorage(restored);
  validateProjectFile(restored);
  const slices = sectionSlices(
    restored.model,
    restored.section.a,
    restored.section.b,
  ).filter((slice) => slice.layerId !== 'base');
  assert.equal(slices.length, 4);
  const solids = materialSolids(restored.model);
  for (const section of slices) {
    const solid = solids.find((item) => item.layerId === section.layerId);
    assert.ok(solid, '3D material layer missing for ' + section.layerId);
    assert.ok(
      solid.slabs.some((slab) =>
        Math.abs(slab.z0 - section.z0) < 1e-8 &&
        Math.abs(slab.z1 - section.z1) < 1e-8,
      ),
      '3D physical Z slab mismatch for ' + section.layerId,
    );
  }
  assert.ok(Math.abs((slices[0].t1 - slices[0].t0) - 0.2540003) < 1e-4);
});
