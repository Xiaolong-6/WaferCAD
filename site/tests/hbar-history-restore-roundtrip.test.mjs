import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';
import { readProjectFile, serializeProject } from '../project-io.js';
import { createSnapshotManager } from '../workspace-snapshots.js';

await loadGeometryKernel();

const file = new URL(
  '../../examples/projects/hbar-blesin-2024-candidate/hbar-blesin-2024-author-roi.wafercad',
  import.meta.url,
);
const originalBytes = readFileSync(file);
const fileLike = (bytes) => ({
  size: bytes.length,
  text: async () => bytes.toString('utf8'),
});

test('HBAR author History imports atomically and restores every physical Step without lineage damage', async () => {
  const project = await readProjectFile(fileLike(originalBytes));
  let current = structuredClone(project.snapshotBranches.nodes.at(-1).state);
  const manager = createSnapshotManager({
    capture: () => current,
    restore: (next) => {
      current = next;
    },
    validateState: (state) => state?.model?.shape === 'rect',
  });
  const imported = await manager.importRecordsAsync(project.snapshots, project.snapshotBranches);
  assert.equal(imported, project.snapshots.length);
  assert.equal(manager.exportBranchState().nodes.length, project.processRecipe.steps.length);
  const before = manager.exportBranchState();
  const head = before.branches.find((branch) => branch.id === 'main');
  assert.equal(head.headNodeId, before.nodes.at(-1).id);
  for (const node of before.nodes) {
    assert.equal(manager.restoreProcessNode(node.id), true, `History restore failed at ${node.id}`);
    assert.deepEqual(current.model, node.state.model, `Physical model changed at ${node.id}`);
    const isolated = manager.readProcessNodeState(node.id);
    assert.deepEqual(isolated.model, node.state.model);
  }
  const priorRecord = before.nodes.find((node) => node.id === 'hbar-stage-09');
  assert.ok(priorRecord);
  assert.equal(manager.restoreProcessNode(priorRecord.id), true);
  const priorEtch = structuredClone(current.model);
  assert.equal(manager.restoreProcessNode(before.nodes.at(-1).id), true);
  assert.deepEqual(
    current.model,
    project.model,
    'Redo to HBAR release HEAD lost physical geometry',
  );
  assert.equal(manager.restoreProcessNode(priorRecord.id), true);
  assert.deepEqual(
    current.model,
    priorEtch,
    'Undo after release changed the saved pre-release state',
  );
  const after = manager.exportBranchState();
  assert.deepEqual(
    after.nodes,
    before.nodes,
    'Read-only History navigation must preserve every Step',
  );
  assert.deepEqual(
    after.branches,
    before.branches,
    'Read-only navigation must preserve variant HEAD',
  );
});

test('HBAR author Project export/Open preserves all 11 Recipe History nodes and physical release owner', async () => {
  const project = await readProjectFile(fileLike(originalBytes));
  const encoded = Buffer.from(serializeProject(project));
  const reopened = await readProjectFile(fileLike(encoded));
  assert.deepEqual(reopened.model, project.model);
  assert.deepEqual(reopened.snapshotBranches, project.snapshotBranches);
  assert.deepEqual(reopened.snapshots, project.snapshots);
  assert.deepEqual(reopened.processRecipe, project.processRecipe);
  assert.deepEqual(reopened.layout, project.layout);
});
