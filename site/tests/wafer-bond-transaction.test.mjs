import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { migrateProjectFile, validateProjectFile } = await import('../project-schema.js');
const { replayWaferAssembly } = await import('../wafer-assembly.js');
const {
  prepareWaferBondTransaction,
  commitWaferBondTransaction,
} = await import('../wafer-bond-transaction.js');

function wafer(name) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 });
  const project = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  project.name = name;
  validateProjectFile(project);
  return project;
}

function hostFor(project) {
  let current = structuredClone(project);
  const history = [];
  let checkpoints = 0;
  let attempts = 0;
  return {
    getCurrentProject: () => structuredClone(current),
    checkpointRecovery: async () => {
      checkpoints++;
      return true;
    },
    captureTransaction: () => ({
      project: structuredClone(current),
      history: structuredClone(history),
    }),
    applyProject: (next) => {
      current = structuredClone(next);
      attempts++;
    },
    recordOperation: (operation) => history.push(structuredClone(operation)),
    restoreTransaction: (before) => {
      current = structuredClone(before.project);
      history.splice(0, history.length, ...before.history);
      return true;
    },
    inspect: () => ({
      current: structuredClone(current),
      history: structuredClone(history),
      checkpoints,
      attempts,
    }),
  };
}

test('prepare Bond preserves each source and receiver view without product pre-bond History', () => {
  const receiver = wafer('receiver');
  const donor = wafer('donor');
  receiver.drawMask = { nextShapeId: 1, shapes: [] };
  receiver.snapshots = [
    {
      id: 'before-bond',
      name: 'Source state',
      createdAt: '2026-10-15T12:00:00.000Z',
      state: structuredClone(receiver),
    },
  ];
  const beforeReceiver = structuredClone(receiver);
  const beforeDonor = structuredClone(donor);
  const prepared = prepareWaferBondTransaction(receiver, donor, {
    receiverId: 'A',
    donorId: 'B',
  });
  assert.equal(prepared.project.version, 15);
  assert.equal(prepared.project.processRecipe, undefined);
  assert.equal(prepared.project.snapshots, undefined);
  assert.deepEqual(prepared.project.drawMask, receiver.drawMask);
  assert.equal(prepared.project.waferAssembly.sources[0].project.snapshots.length, 1);
  assert.deepEqual(prepared.project.waferAssembly.sources[1].project, donor);
  assert.deepEqual(replayWaferAssembly(prepared.project.waferAssembly), prepared.project.model);
  assert.deepEqual(receiver, beforeReceiver);
  assert.deepEqual(donor, beforeDonor);
});

test('second Bond prepares a third source without inventing receiver Recipe or changing prior layers', () => {
  const first = prepareWaferBondTransaction(wafer('A'), wafer('B'), { donorId: 'B' });
  const prior = structuredClone(first.project);
  const second = prepareWaferBondTransaction(first.project, wafer('C'), {
    donorId: 'C',
  });
  assert.equal(second.project.waferAssembly.sources.length, 3);
  assert.equal(second.project.waferAssembly.bonds.length, 2);
  assert.deepEqual(first.project, prior);
  assert.deepEqual(replayWaferAssembly(second.project.waferAssembly), second.project.model);
});

test('invalid Bond preflight cannot alter either source', () => {
  const receiver = wafer('A');
  const donor = wafer('B');
  const before = structuredClone([receiver, donor]);
  assert.throws(
    () => prepareWaferBondTransaction(receiver, donor, { donorId: 'B', dx: 10000 }),
    /no finite-area/,
  );
  assert.deepEqual([receiver, donor], before);
});

test('one valid Bond commits exactly once after Recovery checkpoint', async () => {
  const receiver = wafer('A');
  const host = hostFor(receiver);
  const prepared = prepareWaferBondTransaction(receiver, wafer('B'), { donorId: 'B' });
  const result = await commitWaferBondTransaction(prepared, host);
  const after = host.inspect();
  assert.equal(after.checkpoints, 1);
  assert.equal(after.attempts, 1);
  assert.equal(after.history.length, 1);
  assert.equal(after.history[0].kind, 'bond');
  assert.deepEqual(after.current, result.project);
  assert.deepEqual(replayWaferAssembly(after.current.waferAssembly), after.current.model);
});

test('failed Recovery checkpoint or cancellation cannot mutate or record Bond', async () => {
  const receiver = wafer('A');
  const prepared = prepareWaferBondTransaction(receiver, wafer('B'), { donorId: 'B' });
  const host = hostFor(receiver);
  host.checkpointRecovery = async () => false;
  await assert.rejects(
    () => commitWaferBondTransaction(prepared, host),
    /checkpoint was not created/,
  );
  assert.deepEqual(host.inspect().current, receiver);
  assert.equal(host.inspect().attempts, 0);
  assert.equal(host.inspect().history.length, 0);
  host.canCommit = () => false;
  await assert.rejects(() => commitWaferBondTransaction(prepared, host), /cancelled/);
  assert.equal(host.inspect().checkpoints, 0);
});

test('stale receiver after asynchronous checkpoint must not commit', async () => {
  const receiver = wafer('A');
  const prepared = prepareWaferBondTransaction(receiver, wafer('B'), { donorId: 'B' });
  const host = hostFor(receiver);
  const changed = wafer('replaced while awaiting Recovery');
  host.checkpointRecovery = async () => {
    host.applyProject(changed);
    return true;
  };
  await assert.rejects(
    () => commitWaferBondTransaction(prepared, host),
    /receiver changed since preflight/,
  );
  assert.deepEqual(host.inspect().current, changed);
  assert.equal(host.inspect().history.length, 0);
});

test('History record fault restores the entire precommit project and History graph', async () => {
  const receiver = wafer('A');
  const prepared = prepareWaferBondTransaction(receiver, wafer('B'), { donorId: 'B' });
  const host = hostFor(receiver);
  const before = host.inspect().current;
  host.recordOperation = () => {
    const interrupted = host.captureTransaction();
    interrupted.history.push({ kind: 'poisoned-node' });
    host.restoreTransaction(interrupted);
    throw new Error('History node allocation failed');
  };
  await assert.rejects(
    () => commitWaferBondTransaction(prepared, host),
    /History node allocation failed/,
  );
  const after = host.inspect();
  assert.deepEqual(after.current, before);
  assert.deepEqual(after.history, []);
  assert.equal(after.checkpoints, 1);
});

test('unconfirmed rollback fails loudly and requires durable Recovery', async () => {
  const receiver = wafer('A');
  const prepared = prepareWaferBondTransaction(receiver, wafer('B'), { donorId: 'B' });
  const host = hostFor(receiver);
  host.recordOperation = () => {
    throw new Error('History rejected operation');
  };
  host.restoreTransaction = () => false;
  await assert.rejects(
    () => commitWaferBondTransaction(prepared, host),
    /rollback was not confirmed; restore the pre-bond Recovery checkpoint/,
  );
});

test('Bonded baseline rejects fake product History until the History state owner exists', () => {
  const assembled = prepareWaferBondTransaction(wafer('A'), wafer('B'), { donorId: 'B' })
    .project;
  const fake = structuredClone(assembled);
  fake.processRecipe = { version: 1, name: 'Illegal product recipe', steps: [] };
  assert.throws(
    () => prepareWaferBondTransaction(fake, wafer('C'), { donorId: 'C' }),
    /requires a source-aware transaction owner/,
  );
});
