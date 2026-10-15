import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { CURRENT_PROJECT_VERSION, migrateProjectFile, validateProjectFile } =
  await import('../project-schema.js');
const {
  createWaferAssembly,
  appendWaferToAssembly,
  createBondedAssemblyProject,
  validateBondedAssemblyProject,
  replayWaferAssembly,
} = await import('../wafer-assembly.js');
const {
  serializeProject,
  readProjectFile,
  prepareProjectForStorage,
  prepareProjectForWorkspaceStorage,
  expandProjectStorage,
} = await import('../project-io.js');
const { recipeTemplate } = await import('../process-recipe.js');
const { requiresWorkspaceMigrationCheckpoint } = await import('../workspace-persistence.js');

function sourceProject(name) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 });
  const source = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  source.name = name;
  source.processRecipe = recipeTemplate('blank');
  const state = structuredClone(source);
  source.snapshots = [
    {
      id: 'source-checkpoint',
      name: 'Source checkpoint',
      createdAt: '2026-10-15T10:00:00.000Z',
      state,
    },
  ];
  validateProjectFile(source);
  return source;
}

function bonded() {
  const first = createWaferAssembly(sourceProject('Wafer A'), 'A');
  return appendWaferToAssembly(first, sourceProject('Wafer B'), { donorId: 'B' });
}

const fileLike = (content) => ({ size: Buffer.byteLength(content), text: async () => content });

test('v15 .wafercad carries independent donor masks, recipe and source history, losslessly', async () => {
  const result = bonded();
  const original = createBondedAssemblyProject(result.assembly);
  assert.equal(original.version, CURRENT_PROJECT_VERSION);
  assert.equal(original.waferAssembly.sources.length, 2);
  assert.equal(
    original.snapshots,
    undefined,
    'receiver History must not masquerade as product History',
  );
  assert.equal(
    original.processRecipe,
    undefined,
    'pre-bond Recipe must not replay as post-bond Recipe',
  );
  assert.equal(original.waferAssembly.sources[0].project.snapshots.length, 1);
  assert.equal(original.waferAssembly.sources[1].project.snapshots.length, 1);
  assert.ok(original.waferAssembly.sources[1].project.processRecipe);
  assert.deepEqual(replayWaferAssembly(original.waferAssembly), original.model);

  const text = serializeProject(original);
  const stored = JSON.parse(text);
  assert.equal(stored.version, CURRENT_PROJECT_VERSION);
  assert.equal(stored.storage.lossless, true);
  const reloaded = await readProjectFile(fileLike(text));
  assert.deepEqual(reloaded, original);
  validateBondedAssemblyProject(reloaded);
  assert.deepEqual(original, createBondedAssemblyProject(result.assembly));
});

test('workspace Recovery-style packing also preserves source projects without quantization', () => {
  const original = createBondedAssemblyProject(bonded().assembly);
  const stored = prepareProjectForWorkspaceStorage(original);
  expandProjectStorage(stored);
  assert.deepEqual(stored, original);
  assert.throws(() => prepareProjectForStorage(original), /lossless/);
});

test('v15 import rejects corrupted source, altered bond, and fake post-bond material', async () => {
  const original = createBondedAssemblyProject(bonded().assembly);
  const badSource = structuredClone(original);
  badSource.waferAssembly.sources[1].bytes += 1;
  assert.throws(() => serializeProject(badSource), /bytes/);

  const badBond = structuredClone(original);
  badBond.waferAssembly.bonds[0].contactAreaUm2 = 1;
  assert.throws(() => serializeProject(badBond), /replay differs/);

  const badMaterial = structuredClone(original);
  badMaterial.model.regions[0].stack[0].z0 += 1;
  assert.throws(() => serializeProject(badMaterial), /material differs/);

  const validEncoded = JSON.parse(serializeProject(original));
  validEncoded.waferAssembly.bonds[0].contactAreaUm2 = 1;
  await assert.rejects(
    () => readProjectFile(fileLike(JSON.stringify(validEncoded))),
    /replay differs/,
  );
});

test('v14 or nested assemblies cannot disguise v15 provenance', async () => {
  const original = createBondedAssemblyProject(bonded().assembly);
  const legacy = JSON.parse(serializeProject(original));
  legacy.version = 14;
  await assert.rejects(() => readProjectFile(fileLike(JSON.stringify(legacy))), /pre-v15/);

  const nested = structuredClone(original);
  nested.waferAssembly.sources[0].project.waferAssembly = { version: 1 };
  assert.throws(() => validateProjectFile(nested), /nested Assembly/);
});

test('three-source Assembly remains deterministically reopenable', async () => {
  const second = bonded();
  const third = appendWaferToAssembly(second.assembly, sourceProject('Wafer C'), { donorId: 'C' });
  const original = createBondedAssemblyProject(third.assembly);
  const loaded = await readProjectFile(fileLike(serializeProject(original)));
  assert.equal(loaded.waferAssembly.sources.length, 3);
  assert.equal(loaded.waferAssembly.bonds.length, 2);
  assert.deepEqual(loaded.model, original.model);
});

test('v14 legacy History remains v14 and does not cause repeated migration checkpoints', () => {
  const source = sourceProject('Legacy source');
  assert.equal(source.version, 14);
  const migrated = migrateProjectFile(source);
  assert.equal(migrated.version, 14);
  assert.equal(migrated.snapshots[0].state.version, 14);
  assert.equal(requiresWorkspaceMigrationCheckpoint(14, migrated.version), false);
  assert.equal(requiresWorkspaceMigrationCheckpoint(1, migrated.version), true);
  assert.equal(requiresWorkspaceMigrationCheckpoint(15, 15), false);
  assert.equal(requiresWorkspaceMigrationCheckpoint(15, 14), false);
});

test('v15 bonded project retains v14 source histories and is not re-migrated', () => {
  const assembled = createBondedAssemblyProject(bonded().assembly);
  assert.equal(assembled.version, 15);
  assert.equal(requiresWorkspaceMigrationCheckpoint(assembled.version, 15), false);
  assert.equal(assembled.waferAssembly.sources[0].project.version, 14);
  assert.equal(assembled.waferAssembly.sources[1].project.version, 14);
});

test('bonded product rejects forged History or Recipe before export and after import', async () => {
  const original = createBondedAssemblyProject(bonded().assembly);
  const receiverSource = original.waferAssembly.sources[0].project;

  const withHistory = structuredClone(original);
  withHistory.snapshots = structuredClone(receiverSource.snapshots);
  assert.throws(() => serializeProject(withHistory), /cannot coexist with product History/);
  const withBranches = structuredClone(original);
  withBranches.snapshotBranches = {
    version: 3,
    activeBranchId: 'main',
    branches: [],
    nodes: [],
  };
  assert.throws(() => validateProjectFile(withBranches), /cannot coexist with product History/);

  const withRecipe = structuredClone(original);
  withRecipe.processRecipe = structuredClone(receiverSource.processRecipe);
  assert.throws(() => serializeProject(withRecipe), /cannot coexist with product Recipe/);

  const stored = JSON.parse(serializeProject(original));
  stored.processRecipe = structuredClone(receiverSource.processRecipe);
  await assert.rejects(
    () => readProjectFile(fileLike(JSON.stringify(stored))),
    /cannot coexist with product Recipe/,
  );
  // A valid source-project recipe remains legal inside embedded donor/receiver sources.
  assert.ok(original.waferAssembly.sources[0].project.processRecipe);
  assert.ok(original.waferAssembly.sources[1].project.processRecipe);
});
