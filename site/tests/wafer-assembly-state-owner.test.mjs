import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { migrateProjectFile } = await import('../project-schema.js');
const {
  appendWaferToAssembly,
  createBondedAssemblyProject,
  createWaferAssembly,
  validateBondedAssemblyProject,
} = await import('../wafer-assembly.js');
const { createProjectStateController } = await import('../controllers/project-state-controller.js');
const { readProjectFile, serializeProject } = await import('../project-io.js');
const { recipeTemplate } = await import('../process-recipe.js');

function source(name) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 });
  const project = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  project.name = name;
  project.processRecipe = recipeTemplate('blank');
  project.snapshots = [
    {
      id: 'source-history',
      name: 'Source history',
      createdAt: '2026-10-15T10:00:00.000Z',
      state: structuredClone(project),
    },
  ];
  return project;
}

function assemblyProject() {
  const initial = createWaferAssembly(source('receiver'), 'A');
  const joined = appendWaferToAssembly(initial, source('donor'), { donorId: 'B' });
  return createBondedAssemblyProject(joined.assembly);
}

function createOptInHost(options = {}) {
  const events = [];
  let live = null;
  const controller = createProjectStateController({
    enableAssemblyWorkspace: true,
    getState: () => live,
    applyState: (value) => {
      events.push('apply');
      live = value;
    },
    ensureHierarchy: () => events.push('hierarchy'),
    setSectionEditEnabled: () => events.push('section'),
    getSnapshotRecords: options.getSnapshotRecords ?? (() => []),
    getSnapshotBranchState: options.getSnapshotBranchState ?? (() => null),
    readValidatedFile: async () => structuredClone(options.project),
  });
  return {
    controller,
    events,
    getLive: () => live,
    replaceLive: (value) => {
      live = value;
    },
  };
}

test('opt-in Assembly state owner preserves donor Recipe/History through workspace and file IO', async () => {
  const original = assemblyProject();
  const host = createOptInHost({ project: original });
  const imported = await host.controller.readProjectSnapshot({});
  host.controller.loadProjectSnapshot(imported);
  const live = host.getLive();
  assert.equal(live.waferAssembly.sources.length, 2);
  assert.equal(live.waferAssembly.sources[0].project.snapshots.length, 1);
  assert.equal(live.waferAssembly.sources[1].project.processRecipe.name, 'Process Recipe');

  const rebuilt = host.controller.buildProjectSnapshot(true);
  validateBondedAssemblyProject(rebuilt);
  assert.deepEqual(rebuilt.waferAssembly, original.waferAssembly);
  assert.deepEqual(rebuilt.model, original.model);
  assert.equal(rebuilt.snapshots, undefined);
  assert.equal(rebuilt.snapshotBranches, undefined);

  const packed = serializeProject(rebuilt);
  const restored = await readProjectFile({
    size: Buffer.byteLength(packed),
    text: async () => packed,
  });
  assert.deepEqual(restored.waferAssembly, original.waferAssembly);
  assert.deepEqual(restored.model, original.model);
});

test('opt-in state owner rejects a forged assembled material before export', () => {
  const host = createOptInHost();
  host.controller.loadProjectSnapshot(assemblyProject());
  const live = host.getLive();
  live.model.layers[0].name = 'Forged source material';
  const before = structuredClone(live.waferAssembly);
  assert.throws(() => host.controller.buildProjectSnapshot(), /material differs/);
  assert.deepEqual(live.waferAssembly, before);
});

test('opt-in state owner refuses product History rather than dropping it', () => {
  const host = createOptInHost({
    getSnapshotRecords: () => [{ id: 'unowned-node' }],
  });
  host.controller.loadProjectSnapshot(assemblyProject());
  assert.throws(
    () => host.controller.buildProjectSnapshot(true),
    /product History is not yet supported/,
  );
  assert.equal(host.getLive().waferAssembly.sources.length, 2);
});

test('opt-in state owner refuses a product branch graph until Bond History is source-aware', () => {
  const host = createOptInHost({
    getSnapshotBranchState: () => ({ version: 3, nodes: [], branches: [] }),
  });
  host.controller.loadProjectSnapshot(assemblyProject());
  assert.throws(
    () => host.controller.buildProjectSnapshot(true),
    /product History is not yet supported/,
  );
});

test('invalid bonded load is rejected before mutating editor state', () => {
  const original = assemblyProject();
  const host = createOptInHost();
  const forged = structuredClone(original);
  forged.model.layers[0].name = 'Wrong';
  assert.throws(() => host.controller.loadProjectSnapshot(forged), /material differs/);
  assert.deepEqual(host.events, []);
  assert.equal(host.getLive(), null);
});

test('reset clears owned Assembly and ordinary project state remains valid', () => {
  const host = createOptInHost();
  host.controller.loadProjectSnapshot(assemblyProject());
  host.controller.resetProjectState();
  assert.equal(host.getLive().waferAssembly, null);
  const fresh = host.controller.buildProjectSnapshot();
  assert.equal(fresh.waferAssembly, undefined);
  assert.equal(fresh.model.regions.length > 0, true);
});

test('ordinary History state cannot capture embedded Assembly even in opt-in workspace', () => {
  const host = createOptInHost();
  const project = assemblyProject();
  assert.equal(host.controller.isValidSnapshotState(project), false);
  assert.equal(host.controller.isValidSnapshotStates([project]), false);
});

test('opt-in Assembly Save validates physical replay without any hierarchy mutation', () => {
  const host = createOptInHost();
  host.controller.loadProjectSnapshot(assemblyProject());
  host.events.length = 0;
  const saved = host.controller.buildProjectSnapshot(true);
  validateBondedAssemblyProject(saved);
  assert.deepEqual(host.events, []);
  const live = host.getLive();
  live.model.layers[0].name = 'Forged source material';
  assert.throws(() => host.controller.buildProjectSnapshot(true), /material differs/);
  assert.deepEqual(host.events, [], 'failed Save cannot rewrite source layout hierarchy');
});
