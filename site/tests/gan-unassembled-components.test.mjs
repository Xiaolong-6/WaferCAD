import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUnassembledGanComponents } from '../../scripts/build-gan-hemt-unassembled-components.mjs';
import { createSnapshotManager } from '../workspace-snapshots.js';
import { validateRecipeExecution } from '../process-recipe-preflight.js';

const { components, files, manifest } = await buildUnassembledGanComponents();
const { pointInMulti } = await import('../vector-geometry.js');
const roles = ['interposer', 'hemt', 'gsg-left', 'gsg-right'];

test('three independent die Mains and a separately processable interposer Main', () => {
  assert.deepEqual(Object.keys(components), roles);
  assert.equal(manifest.assemblyPerformed, false);
  assert.equal(manifest.bondHistoryCreated, false);
  assert.equal(Object.keys(files).length, 4);
  for (const [role, project] of Object.entries(components)) {
    const history = project.snapshotBranches;
    assert.equal(history.version, 3, role);
    assert.equal(history.activeBranchId, 'main', role);
    assert.equal(history.branches.length, 1, role);
    assert.equal(history.branches[0].id, 'main', role);
    assert.equal(history.branches[0].parentBranchId, null, role);
    assert.equal(history.cursorNodeId, history.branches[0].headNodeId, role);
    assert.ok(!Object.hasOwn(project, 'assemblyWires'), role);
    for (const node of history.nodes) {
      assert.equal(node.branchId, 'main', role);
      assert.ok(!Object.hasOwn(node.state, 'assemblyWires'), role);
      assert.notEqual(node.operation.kind, 'bond', role);
      assert.doesNotMatch(node.operation.label || '', /^Transfer (two|three|GaN)/i);
    }
    assert.deepEqual(
      validateRecipeExecution(project.processRecipe.steps, {
        model: project.model,
        maskState: { layout: project.layout },
        base: project.processRecipe.base,
        startMode: 'new-base',
      }).errors,
      [],
      role + ': local Recipe mask preflight must have no errors',
    );
  }
});

test('native Main/History import and restore works independently on all workpieces', () => {
  for (const [role, project] of Object.entries(components)) {
    let current = structuredClone(project);
    const history = createSnapshotManager({
      capture: () => structuredClone(current),
      restore: (state) => { current = structuredClone(state); },
    });
    history.importRecords(project.snapshots, project.snapshotBranches);
    assert.equal(history.activeBranch().id, 'main', role);
    assert.equal(history.listBranches().length, 1, role);
    assert.equal(history.listHistory().length, project.snapshotBranches.nodes.length, role);
    assert.equal(history.restoreProcessNode(project.snapshotBranches.nodes[0].id), true, role);
    assert.equal(current.model.layers.length, 1, role);
    const finalId = project.snapshotBranches.branches[0].headNodeId;
    assert.equal(history.restoreProcessNode(finalId), true, role);
    assert.deepEqual(current.model, project.model, role);
  }
});

test('independent HEMT die contains SiC, GaN, AlGaN and ten native gate shapes', () => {
  const project = components.hemt;
  assert.equal(project.model.width, 878.5);
  assert.equal(project.model.height, 1120);
  assert.equal(project.model.thickness, 99);
  assert.ok(project.model.layers.some((layer) => layer.name.includes('GaN buffer')));
  assert.ok(project.model.layers.some((layer) => layer.name.includes('AlGaN barrier')));
  assert.ok(project.model.layers.some((layer) => layer.name.includes('Gate metal')));
  assert.equal(project.layout.elements.filter((item) => item.layer === 18).length, 10);
  assert.equal(project.layout.elements.filter((item) => item.layer === 19).length, 2);
  const stack = project.model.regions
    .filter((region) => pointInMulti([0, 0], region.geom))
    .flatMap((region) => region.stack);
  assert.ok(stack.some((segment) => segment.layerId === 'base' && segment.z1 - segment.z0 === 99));
});

test('GSG left and right are distinct Die Main projects with three Au pads each', () => {
  for (const project of [components['gsg-left'], components['gsg-right']]) {
    assert.equal(project.model.width, 220);
    assert.equal(project.model.height, 350);
    assert.equal(project.layout.elements.filter((item) => item.layer === 20).length, 3);
    assert.equal(project.model.layers.length, 2);
    assert.equal(project.processRecipe.steps.length, 1);
    assert.equal(project.snapshotBranches.nodes.length, 2);
  }
  assert.notEqual(components['gsg-left'].name, components['gsg-right'].name);
});

test('interposer Main terminates before die transfer, Bond, solder and wire placement', () => {
  const project = components.interposer;
  assert.equal(project.snapshotBranches.nodes.length, 31);
  assert.equal(project.model.width, 6000);
  assert.equal(project.model.height, 5000);
  assert.equal(
    project.model.layers.some((layer) => /GSG|Gate metal|GaN|AuSn perimeter/i.test(layer.name)),
    false,
  );
  assert.ok(
    project.snapshotBranches.nodes.every(
      (node) => !/Transfer two|Place thinned SiC|wire bonds/i.test(node.operation.label),
    ),
  );
  assert.match(project.snapshotBranches.nodes[1].operation.label, /NOT SIMULATED/);
  assert.ok(project.snapshotBranches.nodes.some((node) => /four-level|bridge tier/i.test(node.operation.label)));
  assert.ok(project.layout.elements.length > 0);
});
