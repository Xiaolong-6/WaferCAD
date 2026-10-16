import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { migrateProjectFile } = await import('../project-schema.js');
const { createWaferAssembly, appendWaferToAssembly, createBondedAssemblyProject } =
  await import('../wafer-assembly.js');
const {
  createAssemblyVariantGraph,
  validateAssemblyVariantGraph,
  assemblyVariantProject,
  setAssemblyVariantCursor,
  forkAssemblyVariant,
  activateAssemblyVariant,
  appendAssemblyVariantBond,
  appendAssemblyVariantPostBondStep,
  assemblyVariantPostBondModel,
  setAssemblyVariantPostBondCursor,
  forkAssemblyProcessVariant,
} = await import('../wafer-assembly-variants.js');
const { readProjectFile, serializeProject } = await import('../project-io.js');

function wafer(name, thickness = 400) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness });
  const project = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  project.name = name;
  return project;
}
function bonded() {
  const a = createWaferAssembly(wafer('receiver A'), 'A');
  const b = appendWaferToAssembly(a, wafer('donor B'), { donorId: 'B' });
  const c = appendWaferToAssembly(b.assembly, wafer('donor C'), { donorId: 'C' });
  return createBondedAssemblyProject(c.assembly);
}

test('shared registry retains one A/B and distinct C/D when forking historical A+B', () => {
  const original = bonded();
  const initial = createAssemblyVariantGraph(original);
  const historic = setAssemblyVariantCursor(initial, 1);
  const forked = forkAssemblyVariant(historic, { id: 'alt', name: 'Donor D alternative' });
  assert.equal(forked.activeBranchId, 'alt');
  assert.deepEqual(forked.branches[1].sourceRefs, [0, 1]);
  assert.equal(forked.branches[1].forkIndex, 1);
  const result = appendAssemblyVariantBond(forked, wafer('donor D'), { donorId: 'D' });
  assert.equal(result.graph.sources.length, 4);
  assert.equal(result.graph.branches.length, 2);
  assert.deepEqual(result.graph.branches[0].sourceRefs, [0, 1, 2]);
  assert.deepEqual(result.graph.branches[1].sourceRefs, [0, 1, 3]);
  assert.equal(result.graph.branches[0].bonds.at(-1).donorId, 'C');
  assert.equal(result.graph.branches[1].bonds.at(-1).donorId, 'D');
  assert.equal(result.project.waferAssembly.sources[2].id, 'D');
  assert.equal(assemblyVariantProject(result.graph, 'main', 2).waferAssembly.sources[2].id, 'C');
  assert.equal(assemblyVariantProject(result.graph, 'alt', 2).waferAssembly.sources[2].id, 'D');
  assert.deepEqual(original.model, assemblyVariantProject(result.graph, 'main', 2).model);
  assert.equal(JSON.stringify(result.graph).match(/"name":"receiver A"/g)?.length, 1);
});

test('Variant switching preserves independent models, donor provenance and source Projects', () => {
  const root = createAssemblyVariantGraph(bonded());
  const branch = forkAssemblyVariant(setAssemblyVariantCursor(root, 1), { id: 'alt' });
  const alternate = appendAssemblyVariantBond(branch, wafer('donor D', 350), {
    donorId: 'D',
    dx: 10,
  });
  const primary = activateAssemblyVariant(alternate.graph, 'main');
  assert.equal(primary.branches[0].cursor, 2);
  assert.deepEqual(assemblyVariantProject(primary).model, bonded().model);
  const second = activateAssemblyVariant(primary, 'alt');
  assert.deepEqual(assemblyVariantProject(second).model, alternate.project.model);
  assert.equal(assemblyVariantProject(second, 'alt', 1).waferAssembly.bonds.length, 1);
  assert.equal(assemblyVariantProject(second, 'alt', 0).waferAssembly, undefined);
  assert.equal(second.sources.length, 4, 'branch switching must not add duplicate A/B donors');
});

test('Variant graph can be serialized, revalidated and each branch exported as canonical v15 .wafercad', async () => {
  const root = createAssemblyVariantGraph(bonded());
  const forked = forkAssemblyVariant(setAssemblyVariantCursor(root, 1), { id: 'alt' });
  const edited = appendAssemblyVariantBond(forked, wafer('donor D'), { donorId: 'D' });
  const encoded = JSON.stringify(edited.graph);
  const restored = validateAssemblyVariantGraph(JSON.parse(encoded));
  assert.deepEqual(restored, edited.graph);
  for (const branchId of ['main', 'alt']) {
    const project = assemblyVariantProject(restored, branchId, 2);
    const text = serializeProject(project);
    const reloaded = await readProjectFile({
      size: Buffer.byteLength(text),
      text: async () => text,
    });
    assert.deepEqual(reloaded.model, project.model);
    assert.deepEqual(reloaded.waferAssembly, project.waferAssembly);
  }
});

test('source registry refuses forged byte records, referenced donor aliases and tampered contact area', () => {
  const root = createAssemblyVariantGraph(bonded());
  const tamper = (mutate, pattern) => {
    const bad = structuredClone(root);
    mutate(bad);
    assert.throws(() => validateAssemblyVariantGraph(bad), pattern);
  };
  tamper((graph) => (graph.sources[1].bytes += 1), /provenance mismatch/);
  tamper((graph) => (graph.branches[0].sourceRefs[2] = 1), /unique, shared receiver/);
  tamper((graph) => (graph.branches[0].bonds[1].contactAreaUm2 += 1), /replay differs/);
  tamper((graph) => (graph.activeBranchId = 'missing'), /active branch/);
  tamper(
    (graph) => graph.sources.push(structuredClone(graph.sources[1])),
    /Duplicate .* registry source/,
  );
});

test('fork must preserve immutable original Bond prefix and reject invalid branch operations', () => {
  const initial = createAssemblyVariantGraph(bonded());
  assert.throws(() => forkAssemblyVariant(initial, { id: 'new' }), /historical Bond/);
  assert.throws(
    () =>
      appendAssemblyVariantBond(setAssemblyVariantCursor(initial, 1), wafer('D'), { donorId: 'D' }),
    /explicit new Variant/,
  );
  const forked = forkAssemblyVariant(setAssemblyVariantCursor(initial, 1), { id: 'alt' });
  assert.throws(() => forkAssemblyVariant(forked, { id: 'alt' }), /unique, valid/);
  assert.throws(() => activateAssemblyVariant(forked, 'unknown'), /does not exist/);
  const mismatched = structuredClone(forked);
  mismatched.branches[1].bonds[0].spec.dx = 21;
  assert.throws(
    () => validateAssemblyVariantGraph(mismatched),
    /replay differs|immutable parent Bond prefix/,
  );
});

test('standalone receiver may populate one shared source registry before its first Bond', () => {
  const graph = createAssemblyVariantGraph(wafer('standalone receiver'));
  assert.equal(graph.sources.length, 1);
  assert.deepEqual(graph.branches[0].bonds, []);
  const added = appendAssemblyVariantBond(graph, wafer('donor B'), { donorId: 'B' });
  assert.equal(added.project.waferAssembly.sources.length, 2);
  assert.equal(added.graph.sources.length, 2);
  assert.equal(added.graph.branches[0].cursor, 1);
});

test('post-Bond Recipe stays on one Variant and never contaminates independent source wafers', () => {
  const initial = createAssemblyVariantGraph(bonded());
  const sourceBefore = structuredClone(initial.sources);
  const baselineModel = assemblyVariantProject(initial).model;
  const processed = appendAssemblyVariantPostBondStep(initial, {
    command: 'deposit',
    params: {
      material: 'SiO2',
      thicknessUm: 1.8,
      face: 'front',
      area: 'full',
      coverage: 'direct',
    },
  });
  assert.equal(processed.graph.version, 2);
  assert.equal(processed.graph.branches[0].postBondSteps.length, 1);
  assert.deepEqual(processed.graph.sources, sourceBefore);
  assert.deepEqual(assemblyVariantProject(processed.graph).model, baselineModel);
  assert.notDeepEqual(assemblyVariantPostBondModel(processed.graph), baselineModel);
  assert.deepEqual(assemblyVariantPostBondModel(processed.graph), processed.model);
  assert.equal(JSON.stringify(processed.graph).includes('modelFingerprint'), true);
  assert.equal(
    JSON.stringify(processed.graph.branches[0].postBondSteps).includes('regions'),
    false,
  );
  assert.throws(
    () => appendAssemblyVariantBond(processed.graph, wafer('Donor E'), { donorId: 'E' }),
    /Further Bond after post-Bond Process/,
  );
  const encoded = structuredClone(JSON.parse(JSON.stringify(processed.graph)));
  assert.deepEqual(assemblyVariantPostBondModel(encoded), processed.model);
  const forged = structuredClone(encoded);
  forged.branches[0].postBondSteps[0].modelFingerprint = '00000000';
  assert.throws(() => validateAssemblyVariantGraph(forged), /checksum differs/);
});

test('post-Bond Process is branch-local: C can receive a film while D remains unprocessed', () => {
  const initial = createAssemblyVariantGraph(bonded());
  const forked = forkAssemblyVariant(setAssemblyVariantCursor(initial, 1), { id: 'alt' });
  const alternative = appendAssemblyVariantBond(forked, wafer('Donor D', 350), {
    donorId: 'D',
    dx: 10,
  });
  const before = structuredClone(alternative.graph);
  const processed = appendAssemblyVariantPostBondStep(
    activateAssemblyVariant(alternative.graph, 'main'),
    { command: 'deposit', params: { material: 'Oxide', thicknessUm: 2, face: 'front' } },
  );
  assert.deepEqual(processed.graph.sources, before.sources);
  assert.equal(processed.graph.branches[0].postBondSteps.length, 1);
  assert.deepEqual(processed.graph.branches[1].postBondSteps, []);
  assert.deepEqual(assemblyVariantPostBondModel(processed.graph, 'alt'), alternative.project.model);
  assert.equal(assemblyVariantProject(processed.graph, 'main').waferAssembly.bonds.length, 2);
  assert.equal(assemblyVariantProject(processed.graph, 'alt').waferAssembly.bonds.length, 2);
  const switched = activateAssemblyVariant(processed.graph, 'alt');
  assert.deepEqual(assemblyVariantPostBondModel(switched), alternative.project.model);
});

test('legacy sidecar v1 remains readable, but post-Bond operations require explicit v2 record', () => {
  const legacy = createAssemblyVariantGraph(bonded());
  legacy.version = 1;
  delete legacy.branches[0].postBondSteps;
  assert.deepEqual(validateAssemblyVariantGraph(legacy), legacy);
  assert.deepEqual(assemblyVariantPostBondModel(legacy), assemblyVariantProject(legacy).model);
  const illegal = structuredClone(legacy);
  illegal.branches[0].postBondSteps = [{ command: 'deposit' }];
  assert.throws(() => validateAssemblyVariantGraph(illegal), /format v2/);
  const processed = appendAssemblyVariantPostBondStep(legacy, {
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1, face: 'back' },
  });
  assert.equal(processed.graph.version, 2);
  assert.equal(processed.graph.branches[0].postBondSteps.length, 1);
});

test('post-Bond operations reject a standalone or historical receiver and corrupted step storage', () => {
  const initial = createAssemblyVariantGraph(bonded());
  assert.throws(
    () =>
      appendAssemblyVariantPostBondStep(setAssemblyVariantCursor(initial, 1), {
        command: 'deposit',
        params: { material: 'oxide', thicknessUm: 1, face: 'front' },
      }),
    /completed Bond Variant HEAD/,
  );
  const standalone = createAssemblyVariantGraph(wafer('Unbonded'));
  assert.throws(
    () =>
      appendAssemblyVariantPostBondStep(standalone, {
        command: 'deposit',
        params: { material: 'oxide', thicknessUm: 1, face: 'front' },
      }),
    /completed Bond Variant HEAD/,
  );
  const forged = structuredClone(initial);
  forged.branches[0].postBondSteps = 'not-an-array';
  assert.throws(() => validateAssemblyVariantGraph(forged), /step array|Recipe record/);
});

test('post-Bond Process timeline moves without truncating full Recipe and rejects historical append', () => {
  const original = createAssemblyVariantGraph(bonded());
  const first = appendAssemblyVariantPostBondStep(original, {
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1.8, face: 'front' },
  });
  const second = appendAssemblyVariantPostBondStep(first.graph, {
    command: 'etch',
    params: { profile: 'directional', thicknessUm: 0.5, face: 'front' },
  });
  assert.equal(second.graph.branches[0].postBondCursor, 2);
  const undoOne = setAssemblyVariantPostBondCursor(second.graph, 1);
  const undoAll = setAssemblyVariantPostBondCursor(undoOne, 0);
  assert.equal(undoOne.branches[0].postBondSteps.length, 2);
  assert.equal(undoOne.branches[0].postBondCursor, 1);
  assert.equal(undoAll.branches[0].postBondCursor, 0);
  assert.deepEqual(assemblyVariantPostBondModel(undoOne), first.model);
  assert.deepEqual(assemblyVariantPostBondModel(undoAll), assemblyVariantProject(original).model);
  assert.deepEqual(
    assemblyVariantPostBondModel(setAssemblyVariantPostBondCursor(undoOne, 2)),
    second.model,
  );
  assert.throws(
    () =>
      appendAssemblyVariantPostBondStep(undoOne, {
        command: 'deposit',
        params: { material: 'Al', thicknessUm: 1, face: 'front' },
      }),
    /historical Recipe requires a new Variant/,
  );
  const reloaded = JSON.parse(JSON.stringify(undoOne));
  assert.deepEqual(validateAssemblyVariantGraph(reloaded), undoOne);
  assert.deepEqual(assemblyVariantPostBondModel(reloaded), first.model);
  assert.deepEqual(second.graph.branches[0].postBondSteps, undoOne.branches[0].postBondSteps);
});

test('post-Bond cursor rejects forged indices and accepts previous v2 sidecar at Recipe HEAD', () => {
  const graph = appendAssemblyVariantPostBondStep(createAssemblyVariantGraph(bonded()), {
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1, face: 'front' },
  }).graph;
  for (const bad of [-1, 2, 0.5, NaN]) {
    assert.throws(
      () => setAssemblyVariantPostBondCursor(graph, bad),
      /outside its Recipe timeline/,
    );
  }
  const forged = structuredClone(graph);
  forged.branches[0].postBondCursor = 5;
  assert.throws(() => validateAssemblyVariantGraph(forged), /outside its Recipe timeline/);
  const legacyV2 = structuredClone(graph);
  delete legacyV2.branches[0].postBondCursor;
  assert.deepEqual(assemblyVariantPostBondModel(legacyV2), assemblyVariantPostBondModel(graph));
  const historicalBond = setAssemblyVariantCursor(graph, 0);
  assert.throws(() => setAssemblyVariantPostBondCursor(historicalBond, 0), /completed Bond HEAD/);
});

test('Process-stage fork preserves the selected Recipe prefix and diverges without donor duplication', () => {
  const base = createAssemblyVariantGraph(bonded());
  const first = appendAssemblyVariantPostBondStep(base, {
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1.8, face: 'front' },
  });
  const main = appendAssemblyVariantPostBondStep(first.graph, {
    command: 'etch',
    params: { profile: 'directional', thicknessUm: 0.5, face: 'front' },
  });
  const undone = setAssemblyVariantPostBondCursor(main.graph, 1);
  const alternate = forkAssemblyProcessVariant(undone, {
    id: 'process-alt',
    name: 'Alternative cap',
  });
  assert.equal(alternate.branches.length, 2);
  assert.equal(alternate.sources.length, base.sources.length);
  assert.equal(alternate.branches[1].forkIndex, 2);
  assert.equal(alternate.branches[1].forkProcessIndex, 1);
  assert.deepEqual(alternate.branches[1].postBondSteps, first.graph.branches[0].postBondSteps);
  assert.equal(alternate.branches[0].postBondSteps.length, 2);
  assert.equal(alternate.branches[0].postBondCursor, 1);
  assert.deepEqual(assemblyVariantPostBondModel(alternate), first.model);
  const deviated = appendAssemblyVariantPostBondStep(alternate, {
    command: 'deposit',
    params: { material: 'Al', thicknessUm: 0.4, face: 'front' },
  });
  assert.equal(deviated.graph.sources.length, 3);
  assert.equal(deviated.graph.branches[0].postBondSteps.length, 2);
  assert.equal(deviated.graph.branches[1].postBondSteps.length, 2);
  assert.equal(deviated.graph.branches[1].forkProcessIndex, 1);
  assert.notDeepEqual(deviated.model, main.model);
  assert.deepEqual(
    assemblyVariantPostBondModel(activateAssemblyVariant(deviated.graph, 'main')),
    first.model,
  );
  assert.deepEqual(
    assemblyVariantPostBondModel(
      setAssemblyVariantPostBondCursor(activateAssemblyVariant(deviated.graph, 'main'), 2),
    ),
    main.model,
  );
  assert.deepEqual(
    assemblyVariantPostBondModel(JSON.parse(JSON.stringify(deviated.graph))),
    deviated.model,
  );
  assert.throws(
    () =>
      appendAssemblyVariantBond(
        forkAssemblyProcessVariant(undone, { id: 'no-bond', atProcessIndex: 0 }),
        wafer('later'),
        { donorId: 'X' },
      ),
    /Further Bond after post-Bond Process/,
  );
});

test('Process-fork ancestry, checkpoint and immutable stage prefix fail closed on corruption', () => {
  const first = appendAssemblyVariantPostBondStep(createAssemblyVariantGraph(bonded()), {
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1, face: 'front' },
  });
  const main = appendAssemblyVariantPostBondStep(first.graph, {
    command: 'etch',
    params: { profile: 'directional', thicknessUm: 0.4, face: 'front' },
  });
  const original = setAssemblyVariantPostBondCursor(main.graph, 1);
  assert.throws(
    () => forkAssemblyProcessVariant(main.graph, { id: 'bad' }),
    /historical Process checkpoint/,
  );
  assert.throws(
    () => forkAssemblyProcessVariant(original, { id: 'bad', atProcessIndex: 2 }),
    /historical Process checkpoint/,
  );
  const forked = forkAssemblyProcessVariant(original, { id: 'alt' });
  const invalid = (change, pattern) => {
    const copy = structuredClone(forked);
    change(copy);
    assert.throws(() => validateAssemblyVariantGraph(copy), pattern);
  };
  invalid((g) => {
    g.branches[1].forkProcessIndex = 2;
  }, /Process fork checkpoint/);
  invalid((g) => {
    g.branches[1].forkProcessIndex = -1;
  }, /Process fork checkpoint/);
  invalid((g) => {
    g.branches[1].forkIndex = 0;
  }, /Process fork checkpoint/);
  invalid((g) => {
    delete g.branches[1].forkProcessIndex;
  }, /explicit Process ancestry/);
  invalid((g) => {
    g.branches[1].postBondSteps = [];
    g.branches[1].postBondCursor = 0;
  }, /Process fork checkpoint/);
  invalid((g) => {
    g.branches[1].parentId = null;
  }, /Root Assembly Variant|source registry/);
  invalid((g) => {
    g.branches[1].postBondSteps[0].modelFingerprint = 'bad';
  }, /checksum differs/);
  invalid((g) => {
    g.version = 1;
  }, /Process fork checkpoint|format v2/);
});
