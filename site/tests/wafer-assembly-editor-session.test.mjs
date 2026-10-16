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
