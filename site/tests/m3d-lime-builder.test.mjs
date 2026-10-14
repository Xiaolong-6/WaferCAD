import assert from 'node:assert/strict';
import test from 'node:test';
import { buildM3DLime } from '../../scripts/build-m3d-lime-example.mjs';

test('M3D-LIME source-derived 3-tier process is materialized by the real kernel', async () => {
  const { project, validation } = await buildM3DLime();

  assert.equal(validation.doi, '10.1038/s41467-023-42981-1');
  assert.deepEqual(validation.demonstratedArraySizes, { cim: 1024, buffer: 512, tcamCells: 5 });
  assert.deepEqual(validation.representedCellCounts, { cim: 8, buffer: 4, tcamCells: 5 });
  assert.equal(validation.transistorChannelWUm, 20);
  assert.equal(validation.transistorChannelLUm, 2);
  assert.ok(validation.declaredAssumptions.some((v) => v.includes('surrogate')));

  const steps = project.processRecipe.steps;
  const nodes = project.snapshotBranches.nodes;
  assert.ok(steps.length >= 40, 'source process stages must not be collapsed to a static stack');
  assert.equal(nodes.length, steps.length + 1, 'Base and each Recipe Step require History');
  assert.equal(project.snapshots.length, 9, 'all nine milestone checkpoints must survive');
  assert.equal(project.layout.combos.length, 11, 'inferred masks must remain exportable');
  assert.equal(project.snapshotBranches.branches.length, 1);
  assert.equal(project.snapshotBranches.branches[0].headNodeId, nodes.at(-1).id);
  assert.equal(project.snapshotBranches.branches[0].headState.model.processRevision,
    project.model.processRevision);

  const names = project.model.layers.map((l) => l.name);
  for (const item of [
    'CIM TiN BE 30nm',
    'CIM HfAlOx RSL 8nm',
    'CIM TaOx TEL 45nm',
    'CIM TiN TE 30nm',
    'CIM Al bit lines 500nm',
    'CIM-to-TCAM Si3N4 ILD 900nm',
    'CNT gate Pd 15nm',
    'CNT gate HfO2 10nm',
    'CNT channel 1nm SURROGATE',
    'CNT drain Pd 45nm',
    'Digital TaOx ORL 20nm',
    'Digital Ta2O5 RSL 10nm',
    'Digital Pt TE 10nm',
    'Digital Al2O3 passivation 45nm',
    'Top Pd interconnect 120nm',
  ]) {
    assert.ok(names.includes(item), 'Missing sourced physical material: ' + item);
  }

  const stepsText = steps.map((s) => s.params.label || s.params.material || '').join(' ');
  assert.match(stepsText, /130nm Si CMOS/);
  assert.match(stepsText, /Y2O3/);
  assert.ok(nodes.some((node) => /Open top Pt/i.test(node.operation?.label || '')));
  assert.ok(steps.some((s) => s.command === 'record'), 'non-geometric paper steps must be recorded');
  assert.ok(steps.every((s) => s.command !== 'implant'),
    'CNT conduction and resistive switching are not silicon implantation');
});
