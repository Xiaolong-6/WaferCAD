// Issue #298: verify a real opt-in .wafercad Variant, without mutating legacy M08/M09.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createSnapshotManager } from '../../site/workspace-snapshots.js';
import { loadGeometryKernel } from '../process-benchmarks.mjs';
await loadGeometryKernel();
const [
  { readProjectFile, prepareProjectForWorkspaceStorage },
  { geometryArea },
  { pointInMulti },
] = await Promise.all([
  import('../../site/project-io.js'),
  import('../../site/model.js'),
  import('../../site/vector-geometry.js'),
]);
const dir = new URL('../../site/examples/', import.meta.url);
const parse = async (filename) =>
  readProjectFile(new Blob([await readFile(new URL(filename, dir))], { type: 'application/json' }));
const materialVolume = (model, id) =>
  model.regions.reduce(
    (total, r) =>
      total +
      geometryArea(r.geom) * r.stack.reduce((h, s) => h + (s.layerId === id ? s.z1 - s.z0 : 0), 0),
    0,
  );
const at = (model, xy) => model.regions.find((r) => pointInMulti(xy, r.geom))?.stack || [];

test('adaptive 72-band saved Variant survives strict read, pack/reopen, History restoration, and legacy parity', async () => {
  const legacy = await parse('suspended-silica-microdisks.wafercad');
  const current = await parse('suspended-silica-microdisks-adaptive.wafercad');
  const branchId = 'microdisk-adaptive-72-band';
  const originalSnapshots = legacy.snapshots;
  assert.deepEqual(
    current.snapshots.filter((s) => s.branchId === 'main'),
    originalSnapshots,
  );
  assert.deepEqual(
    current.snapshotBranches.nodes.filter((n) => n.branchId === 'main'),
    legacy.snapshotBranches.nodes,
  );
  assert.deepEqual(
    current.snapshotBranches.branches.find((b) => b.id === 'main'),
    legacy.snapshotBranches.branches.find((b) => b.id === 'main'),
  );
  assert.deepEqual(
    current.snapshotBranches.branches.length,
    legacy.snapshotBranches.branches.length + 1,
  );
  assert.equal(current.snapshotBranches.activeBranchId, branchId);
  const branch = current.snapshotBranches.branches.find((b) => b.id === branchId);
  assert.ok(branch);
  assert.equal(branch.parentBranchId, 'main');
  assert.equal(branch.rootNodeId, 'process-microdisk-07');
  const saved = current.snapshots.find((s) => s.id === 'snapshot-microdisk-adaptive-08');
  const node = current.snapshotBranches.nodes.find((n) => n.id === 'process-microdisk-adaptive-08');
  assert.ok(saved && node);
  assert.equal(node.parentId, 'process-microdisk-07');
  assert.equal(node.operation.replay.version, 1);
  assert.equal(node.operation.replay.params.isotropicLateralErrorUm, 0.25);
  assert.deepEqual(saved.state.model, current.model);
  assert.deepEqual(node.state.model, current.model);
  assert.deepEqual(branch.headState.model, current.model);
  assert.equal(
    at(current.model, [0, 0]).some((x) => x.layerId === 'base' && x.z1 === 40),
    true,
  );
  assert.equal(
    at(current.model, [110, 0]).some((x) => x.layerId === 'layer-1'),
    true,
  );
  assert.ok(
    materialVolume(current.model, 'base') <
      materialVolume(
        legacy.snapshots.find((s) => s.id === 'snapshot-microdisk-07').state.model,
        'base',
      ),
  );
  const before = materialVolume(
    legacy.snapshots.find((s) => s.id === 'snapshot-microdisk-07').state.model,
    'layer-1',
  );
  assert.ok(Math.abs(materialVolume(current.model, 'layer-1') - before) <= before * 1e-6);
  assert.notDeepEqual(
    current.model.regions,
    legacy.snapshots.find((s) => s.id === 'snapshot-microdisk-08').state.model.regions,
  );
  const packed = prepareProjectForWorkspaceStorage(current);
  const reopened = await readProjectFile(
    new Blob([JSON.stringify(packed)], { type: 'application/json' }),
  );
  assert.deepEqual(reopened.model, current.model);
  assert.deepEqual(reopened.snapshotBranches.nodes.at(-1).state.model, current.model);
  let live = structuredClone(reopened);
  const manager = createSnapshotManager({
    capture: () => live,
    restore: (x) => {
      live = x;
    },
    validateState: (x) => Boolean(x?.model?.regions?.length),
  });
  manager.importRecords(reopened.snapshots, reopened.snapshotBranches);
  assert.equal(manager.activeBranch().id, branchId);
  assert.equal(manager.listBranches().length, 2);
  assert.equal(manager.restoreProcessNode('process-microdisk-07'), true);
  assert.equal(manager.restoreProcessNode('process-microdisk-adaptive-08'), true);
  assert.deepEqual(live.model, current.model);
  manager.switchBranch('main');
  assert.deepEqual(live.model, legacy.model);
  manager.switchBranch(branchId);
  assert.deepEqual(live.model, current.model);
});
