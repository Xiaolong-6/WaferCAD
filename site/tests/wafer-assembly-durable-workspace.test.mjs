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

test('post-Bond Deposit is published as one source-aware revision without editing the v15 baseline', async () => {
  const h = host();
  const original = h.session.fullProduct();
  const committed = await h.session.appendPostBondStepDurable({
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1.8, area: 'full', face: 'front' },
  });
  assert.equal(h.revision(), 1);
  assert.equal(h.confirmed().version, 2);
  assert.equal(h.confirmed().branches[0].postBondSteps.length, 1);
  assert.notDeepEqual(committed.model, original.model);
  assert.deepEqual(h.session.fullProduct(), original);
  assert.deepEqual(h.currentModel(), original.model);
  assert.deepEqual(h.session.postBondPreviewModel(), committed.model);
  assert.equal(JSON.stringify(h.confirmed().branches[0].postBondSteps).includes('regions'), false);
  assert.deepEqual(h.session.exportVariantGraph().sources, h.confirmed().sources);
  await assert.rejects(
    () => h.session.bond(wafer('Donor C'), { donorId: 'C' }),
    /Further Bond after post-Bond Process/,
  );
});

test('failed durable Process write reverts step graph and derived preview, never changes baseline', async () => {
  let deny = false;
  const h = host({ reject: () => deny });
  const first = await h.session.appendPostBondStepDurable({
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1, face: 'front' },
  });
  const previous = h.session.exportVariantGraph();
  deny = true;
  await assert.rejects(
    () =>
      h.session.appendPostBondStepDurable({
        command: 'etch',
        params: { profile: 'directional', thicknessUm: 0.5, face: 'front' },
      }),
    /Simulated durable graph write failure/,
  );
  assert.deepEqual(h.session.exportVariantGraph(), previous);
  assert.deepEqual(h.session.postBondPreviewModel(), first.model);
  assert.deepEqual(h.currentModel(), start().model);
  assert.equal(h.revision(), 1);
});

test('durable Process undo/redo persists cursor, preserves future Recipe and restores the same geometry', async () => {
  const h = host();
  const first = await h.session.appendPostBondStepDurable({
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1.8, face: 'front' },
  });
  const second = await h.session.appendPostBondStepDurable({
    command: 'etch',
    params: { profile: 'directional', thicknessUm: 0.5, face: 'front' },
  });
  assert.deepEqual(h.session.processTimeline(), { index: 2, length: 2, available: true });
  assert.deepEqual(h.session.postBondPreviewModel(), second.model);
  const priorRevision = h.revision();
  await h.session.restorePostBondStepDurable(1);
  assert.equal(h.revision(), priorRevision + 1);
  assert.deepEqual(h.session.postBondPreviewModel(), first.model);
  assert.equal(h.confirmed().branches[0].postBondSteps.length, 2);
  assert.equal(h.confirmed().branches[0].postBondCursor, 1);
  await h.session.restorePostBondStepDurable(0);
  assert.equal(h.session.postBondPreviewModel(), null);
  assert.deepEqual(h.currentModel(), start().model);
  await assert.rejects(
    () =>
      h.session.appendPostBondStepDurable({
        command: 'deposit',
        params: { material: 'Al', thicknessUm: 1, face: 'front' },
      }),
    /historical Recipe requires a new Variant/,
  );
  await h.session.restorePostBondStepDurable(2);
  assert.deepEqual(h.session.postBondPreviewModel(), second.model);
  assert.equal(h.session.exportVariantGraph().branches[0].postBondSteps.length, 2);
});

test('failed durable Process navigation restores prior cursor, graph and visual material', async () => {
  let deny = false;
  const h = host({ reject: () => deny });
  const film = await h.session.appendPostBondStepDurable({
    command: 'deposit',
    params: { material: 'Oxide', thicknessUm: 1, face: 'front' },
  });
  const prior = h.session.exportVariantGraph();
  deny = true;
  await assert.rejects(
    () => h.session.restorePostBondStepDurable(0),
    /durable graph write failure/,
  );
  assert.deepEqual(h.session.exportVariantGraph(), prior);
  assert.deepEqual(h.session.postBondPreviewModel(), film.model);
  assert.equal(h.session.processTimeline().index, 1);
  assert.equal(h.revision(), 1);
});

test('durable Process fork creates an independent Recipe suffix without replacing Main or source', async () => {
  const h = host();
  const first = await h.session.appendPostBondStepDurable({
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1.8, face: 'front' },
  });
  const second = await h.session.appendPostBondStepDurable({
    command: 'etch',
    params: { profile: 'directional', thicknessUm: 0.5, face: 'front' },
  });
  await h.session.restorePostBondStepDurable(1);
  const forked = await h.session.createVariantDurable('alternate-process', 'Alternative cap');
  assert.equal(forked.id, 'alternate-process');
  assert.equal(h.session.processTimeline().index, 1);
  assert.equal(h.session.processTimeline().length, 1);
  assert.deepEqual(h.session.postBondPreviewModel(), first.model);
  const alternative = await h.session.appendPostBondStepDurable({
    command: 'deposit',
    params: { material: 'Al', thicknessUm: 0.4, face: 'front' },
  });
  assert.equal(h.confirmed().sources.length, 2);
  assert.equal(h.confirmed().branches.length, 2);
  assert.equal(h.confirmed().branches[0].postBondSteps.length, 2);
  assert.equal(h.confirmed().branches[1].forkProcessIndex, 1);
  assert.equal(h.confirmed().branches[1].postBondSteps.length, 2);
  assert.notDeepEqual(alternative.model, second.model);
  await h.session.switchVariantDurable('main');
  assert.deepEqual(h.session.postBondPreviewModel(), first.model);
  await h.session.restorePostBondStepDurable(2);
  assert.deepEqual(h.session.postBondPreviewModel(), second.model);
  await h.session.switchVariantDurable('alternate-process');
  assert.deepEqual(h.session.postBondPreviewModel(), alternative.model);
  assert.deepEqual(h.currentModel(), start().model);
});

test('rejected durable Process fork restores original Recipe cursor and physical view', async () => {
  let deny = false;
  const h = host({ reject: () => deny });
  await h.session.appendPostBondStepDurable({
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1.8, face: 'front' },
  });
  await h.session.appendPostBondStepDurable({
    command: 'etch',
    params: { profile: 'directional', thicknessUm: 0.5, face: 'front' },
  });
  await h.session.restorePostBondStepDurable(1);
  const baseline = h.session.exportVariantGraph();
  const revision = h.revision();
  deny = true;
  await assert.rejects(
    () => h.session.createVariantDurable('failed-process'),
    /Simulated durable graph write failure/,
  );
  assert.deepEqual(h.session.exportVariantGraph(), baseline);
  assert.equal(h.session.listVariants().length, 1);
  assert.deepEqual(h.session.processTimeline(), { index: 1, length: 2, available: true });
  assert.deepEqual(h.currentModel(), start().model);
  assert.equal(h.revision(), revision);
});


test('unified Assembly undo/redo crosses Process and Bond boundaries with durable replay', async () => {
  const h = host();
  const original = h.session.fullProduct();
  const third = await h.session.bond(wafer('Donor C'), { donorId: 'C' });
  const film = await h.session.appendPostBondStepDurable({
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1.8, face: 'front' },
  });
  const tip = await h.session.appendPostBondStepDurable({
    command: 'etch',
    params: { profile: 'directional', thicknessUm: 0.5, face: 'front' },
  });
  const graph = h.session.exportVariantGraph();
  const baseRevision = h.revision();
  assert.deepEqual(h.session.workstationHistoryNavigation(), {
    bondIndex: 2,
    bondLength: 2,
    processIndex: 2,
    processLength: 2,
    canUndo: true,
    canRedo: false,
    undoKind: 'process',
    redoKind: null,
  });
  await h.session.undoWorkstationDurable();
  assert.deepEqual(h.session.postBondPreviewModel(), film.model);
  await h.session.undoWorkstationDurable();
  assert.equal(h.session.postBondPreviewModel(), null);
  assert.equal(h.session.workstationHistoryNavigation().undoKind, 'bond');
  await h.session.undoWorkstationDurable();
  assert.equal(h.session.currentIndex(), 1);
  assert.deepEqual(h.currentModel(), original.model);
  assert.equal(h.session.workstationHistoryNavigation().redoKind, 'bond');
  await h.session.redoWorkstationDurable();
  assert.deepEqual(h.currentModel(), third.project.model);
  assert.equal(h.session.workstationHistoryNavigation().redoKind, 'process');
  await h.session.redoWorkstationDurable();
  assert.deepEqual(h.session.postBondPreviewModel(), film.model);
  await h.session.redoWorkstationDurable();
  assert.deepEqual(h.session.postBondPreviewModel(), tip.model);
  assert.deepEqual(h.session.exportVariantGraph(), graph, 'source/Recipe content is immutable across navigation');
  assert.equal(h.revision(), baseRevision + 6, 'one confirmed graph revision per navigation');
  assert.equal(h.session.workstationHistoryNavigation().canRedo, false);
  assert.equal(await h.session.redoWorkstationDurable(), null, 'HEAD is a no-op without writes');
  assert.equal(h.revision(), baseRevision + 6);
});

test('unified History rejects stale durable publication and restores the exact Process cursor', async () => {
  let deny = false;
  const h = host({ reject: () => deny });
  const film = await h.session.appendPostBondStepDurable({
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1.8, face: 'front' },
  });
  const graph = h.session.exportVariantGraph();
  const revision = h.revision();
  deny = true;
  await assert.rejects(() => h.session.undoWorkstationDurable(), /durable graph write failure/);
  assert.deepEqual(h.session.exportVariantGraph(), graph);
  assert.deepEqual(h.session.postBondPreviewModel(), film.model);
  assert.equal(h.revision(), revision);
  assert.equal(h.session.workstationHistoryNavigation().undoKind, 'process');
  assert.equal(await h.session.redoWorkstationDurable(), null);
  assert.equal(h.revision(), revision);
});
