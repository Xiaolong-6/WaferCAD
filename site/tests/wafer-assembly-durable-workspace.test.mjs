import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { migrateProjectFile } = await import('../project-schema.js');
const { createWaferAssembly, appendWaferToAssembly, createBondedAssemblyProject } =
  await import('../wafer-assembly.js');
const { createAssemblyBondEditorSession } = await import('../wafer-assembly-editor-session.js');

function wafer(name, thickness = 400) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness });
  const project = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  project.name = name;
  return project;
}
function start() {
  const a = createWaferAssembly(wafer('Receiver'), 'A');
  const b = appendWaferToAssembly(a, wafer('Donor B'), { donorId: 'B' });
  return createBondedAssemblyProject(b.assembly);
}
function host({ reject = () => false, gate = null } = {}) {
  const original = start();
  let visible = structuredClone(original);
  let revision = 0;
  let confirmed = null;
  const checkpoints = [];
  const session = createAssemblyBondEditorSession(original, {
    checkpointRecovery: async (project) => {
      checkpoints.push(structuredClone(project));
      return true;
    },
    applyVisibleProject: (project) => {
      visible = structuredClone(project);
      return true;
    },
    getVisibleModel: () => visible.model,
    persistVariantGraph: async (graph, expected) => {
      if (gate) await gate;
      if (reject(graph)) throw new Error('Simulated durable graph write failure');
      if (revision !== expected) throw new Error('Assembly workspace revision conflict');
      confirmed = structuredClone(graph);
      revision++;
      return { revision };
    },
  });
  return {
    session,
    checkpoints,
    currentModel: () => structuredClone(visible.model),
    confirmed: () => structuredClone(confirmed),
    revision: () => revision,
  };
}

test('Bond success publishes the complete source graph before resolving', async () => {
  const h = host();
  const result = await h.session.bond(wafer('Donor C'), { donorId: 'C' });
  assert.equal(h.revision(), 1);
  assert.equal(h.session.durableRevision(), 1);
  assert.equal(h.confirmed().sources.length, 3);
  assert.equal(h.confirmed().branches[0].bonds.length, 2);
  assert.deepEqual(h.currentModel(), result.project.model);
  assert.equal(h.checkpoints.length, 1);
});

test('failed post-Bond durable write rolls back material, History and whole graph', async () => {
  const h = host({ reject: () => true });
  const previous = h.session.fullProduct();
  await assert.rejects(
    () => h.session.bond(wafer('Donor C'), { donorId: 'C' }),
    /Simulated durable graph write failure/,
  );
  assert.equal(h.revision(), 0);
  assert.equal(h.session.durableRevision(), 0);
  assert.deepEqual(h.session.fullProduct(), previous);
  assert.deepEqual(h.currentModel(), previous.model);
  assert.equal(h.session.listHistory().length, 1);
  assert.equal(h.session.exportVariantGraph().sources.length, 2);
  assert.equal(h.checkpoints.length, 1, 'pre-Bond Recovery remains available');
});

test('historical cursor, fork and switch each publish a validated revision', async () => {
  const h = host();
  await h.session.bond(wafer('Donor C'), { donorId: 'C' });
  const main = h.session.fullProduct();
  const historical = await h.session.restoreIndexDurable(1);
  assert.equal(h.revision(), 2);
  assert.equal(h.confirmed().branches[0].cursor, 1);
  assert.deepEqual(historical.model, start().model);
  await h.session.createVariantDurable('alt', 'D alternative');
  assert.equal(h.revision(), 3);
  const alternate = await h.session.bond(wafer('Donor D', 350), { donorId: 'D', dx: 10 });
  assert.equal(h.revision(), 4);
  assert.equal(h.confirmed().branches.length, 2);
  assert.equal(h.confirmed().sources.length, 4);
  await h.session.switchVariantDurable('main');
  assert.equal(h.revision(), 5);
  assert.deepEqual(h.currentModel(), main.model);
  await h.session.switchVariantDurable('alt');
  assert.equal(h.revision(), 6);
  assert.deepEqual(h.currentModel(), alternate.project.model);
});

test('failed durable fork or branch switch restores last published physical stage', async () => {
  let deny = false;
  const h = host({ reject: () => deny });
  await h.session.bond(wafer('C'), { donorId: 'C' });
  await h.session.restoreIndexDurable(1);
  const old = h.session.fullProduct();
  deny = true;
  await assert.rejects(() => h.session.createVariantDurable('alt'), /durable graph write failure/);
  assert.equal(h.revision(), 2);
  assert.deepEqual(h.session.fullProduct(), old);
  assert.equal(h.session.listVariants().length, 1);
  assert.equal(h.session.currentIndex(), 1);
  assert.deepEqual(h.currentModel(), start().model);
  deny = false;
  await h.session.createVariantDurable('alt');
  await h.session.bond(wafer('D'), { donorId: 'D' });
  const active = h.session.fullProduct();
  deny = true;
  await assert.rejects(() => h.session.switchVariantDurable('main'), /durable graph write failure/);
  assert.deepEqual(h.session.fullProduct(), active);
  assert.equal(h.session.listVariants().find((b) => b.active).id, 'alt');
  assert.deepEqual(h.currentModel(), active.model);
});

test('pending graph publication blocks second Bond, fork, switch and cursor changes', async () => {
  let resolve;
  const pendingGate = new Promise((r) => {
    resolve = r;
  });
  const h = host({ gate: pendingGate });
  const inFlight = h.session.bond(wafer('Donor C'), { donorId: 'C' });
  await Promise.resolve();
  assert.equal(h.session.isCommitting(), true);
  assert.throws(() => h.session.switchVariant('main'), /in progress/);
  assert.throws(() => h.session.restoreIndex(0), /in progress/);
  await assert.rejects(() => h.session.bond(wafer('Donor D'), { donorId: 'D' }), /in progress/);
  resolve();
  await inFlight;
  assert.equal(h.revision(), 1);
});
