import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { migrateProjectFile } = await import('../project-schema.js');
const { createWaferAssembly, appendWaferToAssembly, createBondedAssemblyProject } =
  await import('../wafer-assembly.js');
const { createAssemblyBondHistorySession } = await import('../wafer-assembly-history-session.js');
const { serializeProject, readProjectFile } = await import('../project-io.js');

function wafer(name) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 });
  const project = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  project.name = name;
  return project;
}

function product() {
  const initial = createWaferAssembly(wafer('A'), 'A');
  const joined = appendWaferToAssembly(initial, wafer('B'), { donorId: 'B' });
  const third = appendWaferToAssembly(joined.assembly, wafer('C'), { donorId: 'C' });
  return createBondedAssemblyProject(third.assembly);
}

test('existing snapshotManager tracks compact source-bound Bond nodes', () => {
  const root = product();
  const session = createAssemblyBondHistorySession(root);
  assert.equal(session.currentIndex(), 2);
  assert.equal(session.maxIndex(), 2);
  assert.deepEqual(session.listHistory().map((step) => step.operation.donorId), ['B', 'C']);
  assert.equal(session.listVariants().length, 1);
  const graph = session.exportCompactHistory();
  assert.equal(graph.records.length, 1);
  assert.equal(graph.branchState.nodes.length, 2);
  assert.equal(graph.branchState.nodes[1].state.assemblyBondIndex, 2);
  const serialized = JSON.stringify(graph);
  assert.ok(serialized.length < 16000, 'Bond History graph must not duplicate donor projects');
  assert.equal(serialized.includes('regions'), false);
  assert.equal(serialized.includes('waferAssembly'), false);
});

test('snapshotManager-backed undo and redo rebuild the exact material at each Bond stage', () => {
  const root = product();
  const before = structuredClone(root);
  const session = createAssemblyBondHistorySession(root);
  const head = session.currentProject();
  assert.deepEqual(head.model, root.model);

  const first = session.undo();
  assert.equal(session.currentIndex(), 1);
  assert.equal(first.waferAssembly.bonds.length, 1);
  assert.equal(first.waferAssembly.sources.length, 2);

  const receiver = session.undo();
  assert.equal(session.currentIndex(), 0);
  assert.equal(receiver.waferAssembly, undefined);
  assert.deepEqual(receiver.model, root.waferAssembly.sources[0].project.model);

  assert.deepEqual(session.redo().model, first.model);
  assert.deepEqual(session.redo().model, head.model);
  assert.equal(session.currentIndex(), 2);
  assert.deepEqual(root, before);
});

test('source-bound session reconstructs the same History after file export and reload', async () => {
  const root = product();
  const text = serializeProject(root);
  const loaded = await readProjectFile({
    size: Buffer.byteLength(text),
    text: async () => text,
  });
  const first = createAssemblyBondHistorySession(root);
  const reloaded = createAssemblyBondHistorySession(loaded);
  assert.deepEqual(
    first.listHistory().map((node) => node.operation),
    reloaded.listHistory().map((node) => node.operation),
  );
  assert.deepEqual(reloaded.restoreIndex(1).model, first.restoreIndex(1).model);
  assert.deepEqual(reloaded.restoreIndex(0).model, first.restoreIndex(0).model);
});

test('snapshot navigation validates indexes and does not expose mutable canonical lineage', () => {
  const root = product();
  const session = createAssemblyBondHistorySession(root);
  assert.throws(() => session.restoreIndex(-1), /outside the source lineage/);
  assert.throws(() => session.restoreIndex(3), /outside the source lineage/);
  const exported = session.currentProject();
  exported.waferAssembly.sources[0].id = 'forged';
  exported.model.layers[0].name = 'fake';
  assert.deepEqual(session.currentProject().model, root.model);
  assert.equal(session.fullProduct().waferAssembly.sources[0].id, 'A');
});

test('snapshot navigation refuses unbonded input and forged product material', () => {
  assert.throws(
    () => createAssemblyBondHistorySession(wafer('standalone')),
    /requires an assembled v15 project/,
  );
  const forged = product();
  forged.model.layers[0].name = 'fake';
  assert.throws(() => createAssemblyBondHistorySession(forged), /material differs/);
});
