import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { migrateProjectFile } = await import('../project-schema.js');
const {
  createWaferAssembly,
  appendWaferToAssembly,
  createBondedAssemblyProject,
} = await import('../wafer-assembly.js');
const {
  createAssemblyVariantGraph,
  appendAssemblyVariantPostBondStep,
  setAssemblyVariantPostBondCursor,
  forkAssemblyProcessVariant,
  activateAssemblyVariant,
  assemblyVariantPostBondModel,
} = await import('../wafer-assembly-variants.js');
const {
  ASSEMBLY_WORKSPACE_FORMAT,
  serializeAssemblyWorkspace,
  parseAssemblyWorkspace,
  readAssemblyWorkspaceFile,
} = await import('../wafer-assembly-workspace-file.js');
const { serializeProject, readProjectFile, MAX_PROJECT_FILE_BYTES } =
  await import('../project-io.js');
const { readAssemblyPreviewFile } = await import('../ui-v2/assembly-preview.js');

function wafer(name) {
  return migrateProjectFile(
    projectForBenchmark({
      model: createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 }),
      section: { a: [-40, 0], b: [40, 0] },
    }),
  );
}

function threeWafer() {
  const a = createWaferAssembly(wafer('A'), 'A');
  const b = appendWaferToAssembly(a, wafer('B'), { donorId: 'B' });
  const c = appendWaferToAssembly(b.assembly, wafer('C'), { donorId: 'C' });
  return createBondedAssemblyProject(c.assembly);
}

const fileLike = (text, name = 'complete.wafercad') => ({
  name,
  size: Buffer.byteLength(text),
  text: async () => text,
});

function recipeGraph() {
  const baseline = createAssemblyVariantGraph(threeWafer());
  const first = appendAssemblyVariantPostBondStep(baseline, {
    command: 'deposit',
    params: { material: 'SiO2', thicknessUm: 1.8, area: 'full', face: 'front' },
  });
  const second = appendAssemblyVariantPostBondStep(first.graph, {
    command: 'etch',
    params: { profile: 'directional', thicknessUm: 0.5, area: 'full', face: 'front' },
  });
  const undone = setAssemblyVariantPostBondCursor(second.graph, 1);
  const fork = forkAssemblyProcessVariant(undone, { id: 'alternative' });
  const updated = appendAssemblyVariantPostBondStep(fork, {
    command: 'deposit',
    params: { material: 'Al', thicknessUm: 0.4, area: 'full', face: 'front' },
  });
  return updated.graph;
}

test('portable .wafercad holds exact shared sources, all Variants and Process cursors', async () => {
  const graph = recipeGraph();
  const text = serializeAssemblyWorkspace(graph);
  const decoded = JSON.parse(text);
  assert.equal(decoded.format, ASSEMBLY_WORKSPACE_FORMAT);
  assert.equal(decoded.version, 1);
  assert.equal(decoded.variantGraph.sources.length, 3);
  assert.equal(serializeAssemblyWorkspace(graph), text, 'export bytes are deterministic');
  const opened = await readAssemblyWorkspaceFile(fileLike(text));
  assert.deepEqual(opened.graph, graph);
  assert.deepEqual(parseAssemblyWorkspace(decoded), opened);
  const native = await readAssemblyPreviewFile(fileLike(text), undefined, { allowStandalone: true });
  assert.deepEqual(native.variantGraph, graph);
  assert.deepEqual(native.data, opened.project);
  assert.deepEqual(native.data.waferAssembly.sources[0].project.model, graph.sources[0].project.model);
  assert.deepEqual(assemblyVariantPostBondModel(native.variantGraph), assemblyVariantPostBondModel(graph));
  const main = activateAssemblyVariant(graph, 'main');
  assert.equal(main.branches[0].postBondSteps.length, 2);
  assert.equal(main.branches[0].postBondCursor, 1);
  assert.equal(assemblyVariantPostBondModel(main).layers.length > opened.project.model.layers.length, true);
  assert.equal(serializeAssemblyWorkspace(graph).includes('waferAssemblyVariants'), false);
  await assert.rejects(
    () => readProjectFile(fileLike(text)),
    /requires the source-aware Assembly editor/,
  );
});

test('corrupted Process Recipe, source, format or extra fields fail before import', async () => {
  const graph = recipeGraph();
  const file = JSON.parse(serializeAssemblyWorkspace(graph));
  const badStep = structuredClone(file);
  badStep.variantGraph.branches[0].postBondSteps[0].params.thicknessUm = 11;
  assert.throws(() => parseAssemblyWorkspace(badStep), /checksum|replay|material|Process/i);
  const badSource = structuredClone(file);
  badSource.variantGraph.sources[1].bytes++;
  assert.throws(() => parseAssemblyWorkspace(badSource), /bytes|source/i);
  const wrongVersion = structuredClone(file);
  wrongVersion.version = 17;
  assert.throws(() => parseAssemblyWorkspace(wrongVersion), /version/);
  const injected = structuredClone(file);
  injected.snapshots = [{ id: 'foreign' }];
  assert.throws(() => parseAssemblyWorkspace(injected), /unrecognized fields/);
  const invalidParent = structuredClone(file);
  invalidParent.variantGraph.branches[1].forkProcessIndex = 8;
  assert.throws(() => parseAssemblyWorkspace(invalidParent), /fork|checkpoint/i);
  const notContainer = fileLike(serializeProject(threeWafer()));
  await assert.rejects(() => readAssemblyWorkspaceFile(notContainer), /not an Assembly Workspace/);
  await assert.rejects(
    () =>
      readAssemblyWorkspaceFile({
        name: 'huge.wafercad',
        size: MAX_PROJECT_FILE_BYTES + 1,
        text: async () => '',
      }),
    /size limit/,
  );
  assert.throws(() => serializeAssemblyWorkspace(graph, 64), /size limit/);
});

test('legacy v15 Bond-only and Variant sidecar remain readable alongside native workspace', async () => {
  const plain = threeWafer();
  const loaded = await readAssemblyPreviewFile(fileLike(serializeProject(plain)));
  assert.deepEqual(loaded.data.model, plain.model);
  assert.equal(loaded.variantGraph, undefined);
  const graph = recipeGraph();
  const sidecar = await readAssemblyPreviewFile(
    fileLike(JSON.stringify(graph), 'legacy.wafercad-variants.json'),
    undefined,
    { allowStandalone: true },
  );
  assert.deepEqual(sidecar.variantGraph, graph);
  assert.deepEqual(sidecar.data, parseAssemblyWorkspace(JSON.parse(serializeAssemblyWorkspace(graph))).project);
});

test('unbonded source graph is editable only through explicit Assembly draft opt-in', async () => {
  const graph = createAssemblyVariantGraph(wafer('receiver'));
  const text = serializeAssemblyWorkspace(graph);
  await assert.rejects(() => readAssemblyPreviewFile(fileLike(text)), /at least one Bond/);
  const loaded = await readAssemblyPreviewFile(fileLike(text), undefined, { allowStandalone: true });
  assert.equal(loaded.data.waferAssembly, undefined);
  assert.equal(loaded.variantGraph.branches[0].bonds.length, 0);
});
