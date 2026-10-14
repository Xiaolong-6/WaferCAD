import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildTcmosInverter,
  FIELD_UM,
  GATE_LENGTH_UM,
  TCMOS_DOI,
  TCMOS_MASKS,
  tcmosLayout,
} from '../../scripts/build-tcmos-inverter-example.mjs';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const v = await import('../vector-geometry.js');

test('TCMOS mask geometry is self-contained and resolves physical 130 nm POLY length', () => {
  const layout = tcmosLayout();
  assert.deepEqual(FIELD_UM, [14, 8]);
  assert.equal(GATE_LENGTH_UM, 0.13);
  assert.equal(layout.root, 'TCMOS_130NM_LOCAL');
  assert.equal(layout.units.hasPhysicalUnits, true);
  assert.equal(layout.combos.length, 11);
  assert.equal(
    layout.elements.length,
    TCMOS_MASKS.reduce((n, m) => n + m.rectangles.length, 0),
  );
  for (const layer of TCMOS_MASKS) {
    assert.equal(
      layout.elements.filter((e) => e.layer === layer.id).length,
      layer.rectangles.length,
    );
  }
  const gates = TCMOS_MASKS.find((m) => m.id === 6).rectangles;
  assert.equal(gates[0].w, GATE_LENGTH_UM);
  assert.equal(gates[1].w, GATE_LENGTH_UM);
  assert.equal(gates[0].h, gates[1].h);
  assert.equal(TCMOS_DOI, '10.1038/s41928-019-0272-8');
});

test('TCMOS full geometric reconstruction preserves STI, annotated CMOS and exportable History', async () => {
  const { project, validation } = await buildTcmosInverter();
  const model = project.model;
  assert.equal(validation.pass, true);
  assert.equal(project.layout.elements.length > 0, true);
  assert.equal(project.processRecipe.steps.length, validation.recipeSteps);
  assert.equal(project.snapshotBranches.nodes.length, validation.processNodes);
  assert.equal(project.snapshots.length, 5);
  assert.equal(model.implants.length, 6);
  assert.equal(model.electricalRegions.length, 2);
  assert.ok(model.layers.some((l) => l.name === 'STI SiO2 fill'));
  assert.ok(model.layers.some((l) => l.name === 'POLY gate'));
  assert.ok(model.layers.some((l) => l.name === 'W contacts'));
  assert.ok(model.layers.some((l) => l.name === 'METAL1 Al'));
  const at = (x, y) =>
    model.regions.find((r) => v.pointInMulti([x, y], r.geom))?.stack?.at(-1)?.layerId;
  assert.ok(at(-4, 0));
  assert.ok(at(0, 0));
  const branch = project.snapshotBranches.branches[0];
  assert.equal(branch.headNodeId, project.snapshotBranches.cursorNodeId);
  assert.equal(project.processRecipe.base.thickness, 2);
  assert.ok(
    project.processRecipe.steps.some((s) => s.command === 'etch' && s.params.area === 'invert'),
  );
  assert.equal(project.processRecipe.steps.filter((s) => s.command === 'implant').length, 6);
  assert.equal(project.processRecipe.steps.at(-1).command, 'deposit');
  assert.ok(
    validation.keyAssumptions.some((a) => /retrograde buried/i.test(a)),
    'Source-vs-model disclosure must not be lost',
  );
});
