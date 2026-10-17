import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { migrateProjectFile } = await import('../project-schema.js');
const { createWaferAssembly, appendWaferToAssembly, createBondedAssemblyProject } =
  await import('../wafer-assembly.js');
const { createAssemblyBondEditorSession } = await import('../wafer-assembly-editor-session.js');
const { serializeProject, readProjectFile } = await import('../project-io.js');

function source(name) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 });
  const result = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  result.name = name;
  return result;
}

function initial() {
  const a = createWaferAssembly(source('receiver A'), 'A');
  const b = appendWaferToAssembly(a, source('donor B'), { donorId: 'B' });
  return createBondedAssemblyProject(b.assembly);
}

function fixture({ checkpoint, apply, commit } = {}) {
  const product = initial();
  let visible = structuredClone(product);
  const backups = [];
  const events = [];
  const controller = createAssemblyBondEditorSession(product, {
    checkpointRecovery: async (project, reason) => {
      events.push('recovery');
      backups.push({ project, reason });
      return checkpoint ? checkpoint(project) : true;
    },
    applyVisibleProject: (project) => {
      events.push('apply');
      visible = structuredClone(project);
      return apply ? apply(project) : true;
    },
    getVisibleModel: () => visible.model,
    onCommit: (operation) => {
      events.push('history');
      if (commit) commit(operation);
    },
  });
  return {
    controller,
    backups,
    events,
    getVisible: () => structuredClone(visible),
    tamper: () => {
      visible.model.layers[0].name = 'Uncommitted material edit';
    },
    reorder: () => {
      visible.model = Object.fromEntries(Object.entries(visible.model).reverse());
    },
  };
}

test('Bond commit writes Recovery first, then one canonical History step, without source copies', async () => {
  const host = fixture();
  const donor = source('donor C');
  const before = host.controller.fullProduct();
  const result = await host.controller.bond(donor, { donorId: 'C' });
  assert.deepEqual(host.events, ['recovery', 'apply', 'history']);
  assert.equal(host.backups.length, 1);
  assert.equal(host.backups[0].reason, 'pre-wafer-bond');
  assert.deepEqual(host.backups[0].project, before);
  assert.equal(result.operation.donorId, 'C');
  assert.equal(host.controller.maxIndex(), 2);
  assert.equal(host.controller.currentIndex(), 2);
  assert.equal(host.controller.fullProduct().waferAssembly.sources.length, 3);
  assert.deepEqual(host.getVisible().model, result.project.model);
  assert.equal(host.controller.fullProduct().snapshots, undefined);
  const compact = host.controller.exportCompactHistory();
  assert.equal(compact.branchState.nodes.length, 2);
  assert.equal(JSON.stringify(compact).includes('regions'), false);
  assert.deepEqual(donor.model, source('donor C').model);
});

test('committed Bond is recoverable through deterministic Undo/Redo and portable Save/Reload', async () => {
  const host = fixture();
  await host.controller.bond(source('donor C'), { donorId: 'C' });
  const head = host.controller.fullProduct();
  const beforeUndo = host.controller.undo();
  assert.equal(host.controller.currentIndex(), 1);
  assert.equal(beforeUndo.waferAssembly.bonds.length, 1);
  assert.deepEqual(host.getVisible().model, beforeUndo.model);
  const afterRedo = host.controller.redo();
  assert.deepEqual(afterRedo.model, head.model);
  assert.deepEqual(host.getVisible().model, head.model);
  const saved = serializeProject(head);
  const readBack = await readProjectFile({
    size: Buffer.byteLength(saved),
    text: async () => saved,
  });
  assert.deepEqual(readBack.waferAssembly, head.waferAssembly);
  assert.deepEqual(readBack.model, head.model);
});

test('editing a historical Bond node is rejected before Recovery or workspace mutation', async () => {
  const host = fixture();
  host.controller.undo();
  const baseline = host.controller.fullProduct();
  const visible = host.getVisible();
  await assert.rejects(
    () => host.controller.bond(source('donor C'), { donorId: 'C' }),
    /explicit new Variant/,
  );
  assert.deepEqual(host.events, ['apply']);
  assert.deepEqual(host.controller.fullProduct(), baseline);
  assert.deepEqual(host.getVisible(), visible);
});

test('failed preflight or changed physical workspace cannot write a Recovery point', async () => {
  const host = fixture();
  await assert.rejects(
    () => host.controller.bond(source('donor C'), { donorId: 'B' }),
    /Duplicate Assembly source/,
  );
  host.tamper();
  await assert.rejects(
    () => host.controller.bond(source('donor C'), { donorId: 'C' }),
    /material drift/,
  );
  assert.deepEqual(host.events, []);
  assert.deepEqual(host.controller.fullProduct(), initial());
});

test('missing durable checkpoint refuses Bond without changing live state or History', async () => {
  const host = fixture({ checkpoint: () => false });
  const state = host.controller.fullProduct();
  await assert.rejects(
    () => host.controller.bond(source('donor C'), { donorId: 'C' }),
    /durable Recovery checkpoint was not created/,
  );
  assert.deepEqual(host.events, ['recovery']);
  assert.deepEqual(host.controller.fullProduct(), state);
  assert.deepEqual(host.getVisible(), state);
});

test('failure after physical apply rolls back visible model and source-aware History atomically', async () => {
  const host = fixture({
    commit: () => {
      throw new Error('Simulated History storage failure');
    },
  });
  const previous = host.controller.fullProduct();
  await assert.rejects(
    () => host.controller.bond(source('donor C'), { donorId: 'C' }),
    /Simulated History storage failure/,
  );
  assert.deepEqual(host.events, ['recovery', 'apply', 'history', 'apply']);
  assert.deepEqual(host.controller.fullProduct(), previous);
  assert.deepEqual(host.getVisible().model, previous.model);
  assert.equal(host.controller.listHistory().length, 1);
  assert.equal(host.controller.maxIndex(), 1);
});

test('rejected physical application triggers full rollback, not a phantom Bond node', async () => {
  let times = 0;
  const host = fixture({
    apply: () => {
      times += 1;
      return times === 1 ? false : true;
    },
  });
  const before = host.controller.fullProduct();
  await assert.rejects(
    () => host.controller.bond(source('donor C'), { donorId: 'C' }),
    /workspace rejected/,
  );
  assert.equal(times, 2);
  assert.deepEqual(host.controller.fullProduct(), before);
  assert.deepEqual(host.getVisible(), before);
  assert.equal(host.controller.maxIndex(), 1);
});

test('pending asynchronous Recovery prevents concurrent Bond and History navigation', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const host = fixture({ checkpoint: () => gate });
  const pending = host.controller.bond(source('donor C'), { donorId: 'C' });
  await assert.rejects(
    () => host.controller.bond(source('donor D'), { donorId: 'D' }),
    /transaction is in progress/,
  );
  assert.throws(() => host.controller.undo(), /transaction is in progress/);
  assert.equal(host.controller.isCommitting(), true);
  release(true);
  await pending;
  assert.equal(host.controller.isCommitting(), false);
  assert.equal(host.controller.maxIndex(), 2);
});

test('strict material parity ignores JSON property order without relaxing values', async () => {
  const host = fixture();
  host.reorder();
  await host.controller.bond(source('donor C'), { donorId: 'C' });
  assert.equal(host.controller.maxIndex(), 2);
  assert.equal(host.backups.length, 1);
  assert.deepEqual(host.getVisible().model, host.controller.fullProduct().model);
});

test('first direct Bond preserves independent source Recipe/History and creates one compact node', async () => {
  const receiver = source('receiver A');
  const donor = source('donor B');
  const hostState = { visible: structuredClone(receiver), checkpoints: [] };
  const session = createAssemblyBondEditorSession(receiver, {
    checkpointRecovery: async (project, reason) => {
      hostState.checkpoints.push({ project, reason });
      return true;
    },
    applyVisibleProject: (project) => {
      hostState.visible = structuredClone(project);
      return true;
    },
    getVisibleModel: () => hostState.visible.model,
  });
  assert.equal(session.currentIndex(), 0);
  assert.equal(session.maxIndex(), 0);
  assert.deepEqual(session.listHistory(), []);
  const first = await session.bond(donor, { receiverId: 'A', donorId: 'B' });
  assert.equal(first.project.waferAssembly.sources.length, 2);
  assert.deepEqual(first.project.waferAssembly.sources[0].project.model, receiver.model);
  assert.deepEqual(first.project.waferAssembly.sources[1].project.model, donor.model);
  assert.equal(session.listHistory().length, 1);
  assert.equal(session.currentIndex(), 1);
  assert.equal(hostState.checkpoints.length, 1);
  assert.deepEqual(hostState.checkpoints[0].project, receiver);
  assert.equal(hostState.checkpoints[0].reason, 'pre-wafer-bond');
  const recovered = session.undo();
  assert.equal(recovered.waferAssembly, undefined);
  assert.deepEqual(recovered.model, receiver.model);
  assert.deepEqual(session.redo().model, first.project.model);
  assert.deepEqual(hostState.visible.model, first.project.model);
  assert.equal(JSON.stringify(session.exportCompactHistory()).includes('regions'), false);
  const saved = serializeProject(session.fullProduct());
  const readBack = await readProjectFile({
    size: Buffer.byteLength(saved),
    text: async () => saved,
  });
  assert.deepEqual(readBack.waferAssembly, first.project.waferAssembly);
});

test('first Bond failure restores standalone receiver without phantom Assembly or History', async () => {
  const receiver = source('receiver A');
  let visible = structuredClone(receiver);
  let failed = false;
  const session = createAssemblyBondEditorSession(receiver, {
    checkpointRecovery: async () => true,
    applyVisibleProject: (project) => {
      visible = structuredClone(project);
      return true;
    },
    getVisibleModel: () => visible.model,
    onCommit: () => {
      if (!failed) {
        failed = true;
        throw new Error('Initial Bond operation rejected');
      }
    },
  });
  await assert.rejects(
    () => session.bond(source('donor B'), { receiverId: 'A', donorId: 'B' }),
    /Initial Bond operation rejected/,
  );
  assert.deepEqual(session.fullProduct(), receiver);
  assert.deepEqual(visible.model, receiver.model);
  assert.equal(session.currentIndex(), 0);
  assert.equal(session.maxIndex(), 0);
  assert.deepEqual(session.listHistory(), []);
  const succeeding = await session.bond(source('donor B'), { receiverId: 'A', donorId: 'B' });
  assert.equal(succeeding.project.waferAssembly.bonds.length, 1);
});

test('first Bond recovery refusal leaves standalone source unchanged and does not create History', async () => {
  const receiver = source('receiver A');
  let visible = structuredClone(receiver);
  const session = createAssemblyBondEditorSession(receiver, {
    checkpointRecovery: async () => false,
    applyVisibleProject: (project) => {
      visible = structuredClone(project);
      return true;
    },
    getVisibleModel: () => visible.model,
  });
  await assert.rejects(
    () => session.bond(source('donor B'), { receiverId: 'A', donorId: 'B' }),
    /durable Recovery checkpoint was not created/,
  );
  assert.deepEqual(session.fullProduct(), receiver);
  assert.deepEqual(visible, receiver);
  assert.equal(session.maxIndex(), 0);
});

test('source-aware Variant fork from A+B preserves both C and D histories and physical material', async () => {
  const host = fixture();
  const original = host.controller.fullProduct();
  await host.controller.bond(source('Donor C'), { donorId: 'C' });
  const mainHead = host.controller.fullProduct();
  host.controller.undo();
  assert.equal(host.controller.currentIndex(), 1);
  const forked = host.controller.createVariant('alt', 'Alternate Donor D');
  assert.equal(forked.id, 'alt');
  assert.equal(host.controller.currentIndex(), 1);
  assert.equal(host.controller.maxIndex(), 1);
  await host.controller.bond(source('Donor D'), { donorId: 'D' });
  const altHead = host.controller.fullProduct();
  assert.equal(altHead.waferAssembly.sources[2].id, 'D');
  const graph = host.controller.exportVariantGraph();
  assert.equal(graph.sources.length, 4);
  assert.equal(graph.branches.length, 2);
  assert.deepEqual(graph.branches[0].sourceRefs, [0, 1, 2]);
  assert.deepEqual(graph.branches[1].sourceRefs, [0, 1, 3]);
  assert.deepEqual(
    host.controller.listVariants().map((b) => [b.id, b.active]),
    [
      ['main', false],
      ['alt', true],
    ],
  );
  const primary = host.controller.switchVariant('main');
  assert.deepEqual(primary.model, mainHead.model);
  assert.deepEqual(host.getVisible().model, mainHead.model);
  assert.equal(host.controller.currentIndex(), 2);
  assert.equal(host.controller.listHistory().at(-1).operation.donorId, 'C');
  const alternate = host.controller.switchVariant('alt');
  assert.deepEqual(alternate.model, altHead.model);
  assert.equal(host.controller.listHistory().at(-1).operation.donorId, 'D');
  assert.deepEqual(original.model, initial().model);
});

test('forking zero-stage receiver preserves source provenance and never exposes original bonded product', async () => {
  const host = fixture();
  host.controller.restoreIndex(0);
  host.controller.createVariant('new-root', 'Different first donor');
  assert.equal(host.controller.fullProduct().waferAssembly, undefined);
  assert.deepEqual(host.getVisible().model, initial().waferAssembly.sources[0].project.model);
  await host.controller.bond(source('New first donor'), { donorId: 'E' });
  assert.equal(host.controller.fullProduct().waferAssembly.sources[1].id, 'E');
  const main = host.controller.switchVariant('main');
  assert.deepEqual(main.model, initial().model);
});

test('Variant switch apply rejection restores the original visible state and branch selection', async () => {
  let failure = false;
  const host = fixture({
    apply: () => {
      if (failure) {
        failure = false;
        return false;
      }
      return true;
    },
  });
  await host.controller.bond(source('Donor C'), { donorId: 'C' });
  host.controller.undo();
  host.controller.createVariant('alt');
  await host.controller.bond(source('Donor D'), { donorId: 'D' });
  const previous = host.controller.fullProduct();
  failure = true;
  assert.throws(() => host.controller.switchVariant('main'), /switch was rejected/);
  assert.equal(host.controller.listVariants().find((b) => b.active).id, 'alt');
  assert.deepEqual(host.getVisible().model, previous.model);
  assert.deepEqual(host.controller.fullProduct(), previous);
});

test('failed Bond on alternate branch does not leak its donor or modify Main', async () => {
  let rejectCommit = false;
  const host = fixture({
    commit: () => {
      if (rejectCommit) throw new Error('Variant commit interrupted');
    },
  });
  await host.controller.bond(source('Donor C'), { donorId: 'C' });
  const primary = host.controller.fullProduct();
  host.controller.undo();
  host.controller.createVariant('alt');
  rejectCommit = true;
  await assert.rejects(
    () => host.controller.bond(source('Donor D'), { donorId: 'D' }),
    /Variant commit interrupted/,
  );
  const graph = host.controller.exportVariantGraph();
  assert.equal(graph.sources.length, 3);
  assert.equal(graph.branches[1].bonds.length, 1);
  assert.equal(host.controller.maxIndex(), 1);
  assert.deepEqual(host.controller.switchVariant('main').model, primary.model);
});
