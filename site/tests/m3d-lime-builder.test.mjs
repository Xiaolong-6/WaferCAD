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
  assert.equal(
    project.snapshotBranches.branches[0].headState.model.processRevision,
    project.model.processRevision,
  );

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
  assert.ok(
    steps.some((s) => s.command === 'record'),
    'non-geometric paper steps must be recorded',
  );
  assert.ok(
    steps.every((s) => s.command !== 'implant'),
    'CNT conduction and resistive switching are not silicon implantation',
  );
});


test('CNTFET drawn islands preserve reported 20um width and 2um metal-to-metal active gap', async () => {
  const { project } = await buildM3DLime();
  const byMask = (id) => project.layout.elements
    .filter((element) => element.layer === id)
    .map((element) => {
      const xs = element.points.map((p) => p[0]);
      const ys = element.points.map((p) => p[1]);
      return { left: Math.min(...xs), right: Math.max(...xs),
        bottom: Math.min(...ys), top: Math.max(...ys) };
    });
  const channels = byMask(16);
  const gates = byMask(15);
  const sources = byMask(17);
  const drains = byMask(18);
  assert.equal(channels.length, 14, '4 buffer and 10 TCAM CNTFETs');
  for (let i = 0; i < channels.length; i++) {
    const channel = channels[i], source = sources[i], drain = drains[i], gate = gates[i];
    const close = (actual, expected, label) =>
      assert.ok(Math.abs(actual - expected) < 1e-9, label + ': ' + actual + ' vs ' + expected);
    close(channel.top - channel.bottom, 20, 'reported channel width');
    close(channel.right - channel.left, 2.6, 'inferred CNT island including contact overlap');
    close(source.right - channel.left, 0.3, 'source overlap');
    close(channel.right - drain.left, 0.3, 'drain overlap');
    close(drain.left - source.right, 2, 'reported active channel L');
    assert.ok(gate.left <= source.right && gate.right >= drain.left,
      'gate must cover entire active length');
  }
});

test('sampled 3-tier cut is physically ordered through both analog CIM and digital RRAM', async () => {
  const { project, validation } = await buildM3DLime();
  const { pointInMulti } = await import('../vector-geometry.js');
  const layerNames = new Map(project.model.layers.map((l) => [l.id, l.name]));
  const stackAt = (point) => {
    const region = project.model.regions.find((r) => pointInMulti(point, r.geom));
    assert.ok(region, 'no geometry region at ' + point);
    return region.stack.map((s) => layerNames.get(s.layerId));
  };
  const channelPoint = [-40.7, -23];
  const digitalPoint = [-39.15, -23];
  const channel = stackAt(channelPoint), device = stackAt(digitalPoint);
  const ordered = (stack, names) => {
    let previous = -1;
    for (const name of names) {
      const index = stack.indexOf(name);
      assert.ok(index > previous, name + ' missing/out of stack order: ' + stack);
      previous = index;
    }
  };
  ordered(channel, ['CNT gate Ti bottom 10nm', 'CNT gate Pd 15nm',
    'CNT gate Ti cap 1nm', 'CNT gate HfO2 10nm', 'CNT channel 1nm SURROGATE']);
  assert.ok(!channel.includes('CNT source Pd 45nm') &&
    !channel.includes('CNT drain Pd 45nm'), 'active channel is shorted by contact metal');
  ordered(device, ['CIM TiN BE 30nm', 'CIM HfAlOx RSL 8nm',
    'CIM TaOx TEL 45nm', 'CIM TiN TE 30nm',
    'CNT drain Pd 45nm', 'Digital TaOx ORL 20nm',
    'Digital Ta2O5 RSL 10nm', 'Digital Pt TE 10nm',
    'Top Ti interconnect 20nm', 'Top Pd interconnect 120nm']);
  const heights = project.model.regions.map((region) =>
    region.stack.at(-1).z1);
  const physicalReliefUm = Math.max(...heights) - Math.min(...heights);
  assert.ok(physicalReliefUm < 0.25,
    'unexpected tall pillar in canonical geometry: ' + physicalReliefUm + ' um');
  assert.ok(project.section.b[0] - project.section.a[0] <= 10,
    'default section must resolve the device, not exaggerate the entire chip');
  assert.equal(project.section.a[1], -24);
  assert.equal(project.section.b[1], -24);
  assert.equal(validation.representedCellCounts.tcamCells, 5);
});
