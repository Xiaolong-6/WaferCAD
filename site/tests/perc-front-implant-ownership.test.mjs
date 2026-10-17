import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();

const { expandProjectStorage } = await import('../project-io.js');
const { implantSolids, annotationInspectionCutSegments } =
  await import('../model-view-geometry.js');
const { pointInMulti } = await import('../vector-geometry.js');

test('real PERC rear-contact partition does not split the front C09 rough ROI Implant', () => {
  const file = JSON.parse(
    readFileSync(new URL('../examples/perc-solar-cells-point-contacts.wafercad', import.meta.url)),
  );
  expandProjectStorage(file);
  const model = file.model;
  assert.equal(model.regions.length, 4);
  const roi = [
    [
      [
        [-8100, 2100],
        [-6700, 2100],
        [-6700, 3000],
        [-8100, 3000],
        [-8100, 2100],
      ],
    ],
  ];
  const original = JSON.stringify(model);
  const solids = implantSolids(model, roi);
  const c09Rough = solids.filter(
    (solid) =>
      solid.implantId === 'implant-2' &&
      solid.face === 'front' &&
      solid.surfaceAppearance?.kind === 'rough' &&
      solid.sourceZ === 137,
  );
  assert.equal(
    c09Rough.length,
    1,
    'rear contact circular hole may not fragment identical front C09 rough Implant display',
  );
  assert.equal(c09Rough[0].z0, 136.5);
  assert.equal(c09Rough[0].z1, 137);
  assert.equal(c09Rough[0].surfaceAppearance.seed, 3668339987);
  assert.ok(pointInMulti([-7000, 2990], c09Rough[0].polys));
  assert.ok(annotationInspectionCutSegments(c09Rough[0], roi).length > 0);
  assert.equal(
    JSON.stringify(model),
    original,
    'display derivation must not modify PERC Kernel data',
  );
});
