import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { migrateProjectFile } = await import('../project-schema.js');
const { createWaferAssembly, appendWaferToAssembly, createBondedAssemblyProject } =
  await import('../wafer-assembly.js');
const {
  assemblyBondCheckpoint,
  assemblyBondHistoryStep,
  resolveAssemblyBondHistoryStep,
  assemblyBondHistoryTimeline,
} = await import('../wafer-assembly-history.js');
const { serializeProject, readProjectFile } = await import('../project-io.js');

function source(name) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 });
  const sourceProject = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  sourceProject.name = name;
  sourceProject.snapshots = [
    {
      id: 'original-source-step',
      name: 'Before Bond',
      createdAt: '2026-10-15T10:00:00.000Z',
      state: structuredClone(sourceProject),
    },
  ];
  return sourceProject;
}

function threeWafers() {
  const initial = createWaferAssembly(source('wafer A'), 'A');
  const second = appendWaferToAssembly(initial, source('wafer B'), { donorId: 'B' });
  const third = appendWaferToAssembly(second.assembly, source('wafer C'), { donorId: 'C' });
  return createBondedAssemblyProject(third.assembly);
}

test('compact History steps retain source indexes rather than duplicating donor projects', () => {
  const root = threeWafers();
  const timeline = assemblyBondHistoryTimeline(root);
  assert.equal(timeline.initial, 0);
  assert.equal(timeline.head, 2);
  assert.equal(timeline.steps.length, 2);
  assert.deepEqual(
    timeline.steps.map((step) => [step.kind, step.bondIndex, step.donorId]),
    [
      ['bond', 1, 'B'],
      ['bond', 2, 'C'],
    ],
  );
  assert.equal(timeline.steps[0].contactAreaUm2 > 0, true);
  const serialized = JSON.stringify(timeline);
  assert.ok(serialized.length < 4096, 'History metadata must not embed donor files');
  assert.equal(serialized.includes('original-source-step'), false);
  assert.equal(serialized.includes('regions'), false);
});

test('Bond Undo/Redo checkpoints are deterministic across receiver, 2-wafer, 3-wafer states', () => {
  const product = threeWafers();
  const timeline = assemblyBondHistoryTimeline(product);
  const receiver = assemblyBondCheckpoint(product.waferAssembly, 0);
  const first = resolveAssemblyBondHistoryStep(product, timeline.steps[0]);
  const second = resolveAssemblyBondHistoryStep(product, timeline.steps[1]);
  assert.deepEqual(receiver, product.waferAssembly.sources[0].project);
  assert.equal(receiver.snapshots.length, 1, 'Undo to receiver restores its History');
  assert.equal(first.waferAssembly.sources.length, 2);
  assert.equal(first.waferAssembly.bonds.length, 1);
  assert.equal(first.snapshots, undefined);
  assert.equal(second.waferAssembly.sources.length, 3);
  assert.deepEqual(second.model, product.model);
  assert.deepEqual(
    resolveAssemblyBondHistoryStep(product, timeline.steps[0]).model,
    first.model,
    'Redo after returning to the receiver must recreate exactly the same material',
  );
});

test('saved Assembly can resolve all Bond steps after .wafercad file reload', async () => {
  const original = threeWafers();
  const before = structuredClone(original);
  const encoded = serializeProject(original);
  const loaded = await readProjectFile({
    size: Buffer.byteLength(encoded),
    text: async () => encoded,
  });
  const timeline = assemblyBondHistoryTimeline(loaded);
  for (const step of timeline.steps) {
    const reconstructed = resolveAssemblyBondHistoryStep(loaded, step);
    assert.deepEqual(
      reconstructed.model,
      assemblyBondCheckpoint(before.waferAssembly, step.bondIndex).model,
    );
  }
  assert.deepEqual(original, before, 'checkpoint navigation cannot mutate original source');
});

test('History rejects forged indexes, source identities, dimensions and contact areas', () => {
  const root = threeWafers();
  const timeline = assemblyBondHistoryTimeline(root);
  const poisoned = structuredClone(timeline.steps[1]);
  poisoned.bondIndex = 1;
  assert.throws(
    () => resolveAssemblyBondHistoryStep(root, poisoned),
    /differs from immutable Assembly provenance/,
  );
  poisoned.bondIndex = 3;
  assert.throws(
    () => resolveAssemblyBondHistoryStep(root, poisoned),
    /outside the Assembly lineage/,
  );
  poisoned.bondIndex = 2;
  poisoned.donorId = 'B';
  assert.throws(
    () => resolveAssemblyBondHistoryStep(root, poisoned),
    /differs from immutable Assembly provenance/,
  );
  poisoned.donorId = 'C';
  poisoned.spec.dx = 1;
  assert.throws(
    () => resolveAssemblyBondHistoryStep(root, poisoned),
    /differs from immutable Assembly provenance/,
  );
  poisoned.spec.dx = 0;
  poisoned.contactAreaUm2 += 1;
  assert.throws(
    () => resolveAssemblyBondHistoryStep(root, poisoned),
    /differs from immutable Assembly provenance/,
  );
});

test('Bond checkpoints cannot accept a corrupted embedded source or forged root material', () => {
  const root = threeWafers();
  const corrupted = structuredClone(root);
  corrupted.waferAssembly.sources[1].bytes += 1;
  assert.throws(
    () =>
      resolveAssemblyBondHistoryStep(corrupted, assemblyBondHistoryStep(root.waferAssembly, 1)),
    /bytes/,
  );
  assert.throws(() => assemblyBondCheckpoint(corrupted.waferAssembly, 0), /size\/provenance/);
  const forged = structuredClone(root);
  forged.model.layers[0].name = 'Fake root layer';
  assert.throws(() => assemblyBondHistoryTimeline(forged), /material differs/);
});

test('History rejects an invalid step zero and forged kind before any state restore', () => {
  const project = threeWafers();
  assert.throws(() => assemblyBondHistoryStep(project.waferAssembly, 0), /original receiver/);
  const bad = { ...assemblyBondHistoryStep(project.waferAssembly, 1), kind: 'deposit' };
  assert.throws(() => resolveAssemblyBondHistoryStep(project, bad), /must be a Bond operation/);
});
