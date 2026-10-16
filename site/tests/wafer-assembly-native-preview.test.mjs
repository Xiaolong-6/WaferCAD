import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel, projectForBenchmark } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { migrateProjectFile } = await import('../project-schema.js');
const { createWaferAssembly, appendWaferToAssembly, createBondedAssemblyProject } =
  await import('../wafer-assembly.js');
const { serializeProject, MAX_PROJECT_FILE_BYTES } = await import('../project-io.js');
const { createWorkstationRuntime } = await import('../ui-v2/workstation-runtime.js');
const { readAssemblyPreviewFile, assemblyPreviewZExtent, ASSEMBLY_ORIGIN_COLORS } =
  await import('../ui-v2/assembly-preview.js');

function wafer(name) {
  const model = createModel({ shape: 'rect', width: 100, height: 80, thickness: 400 });
  const project = migrateProjectFile(
    projectForBenchmark({ model, section: { a: [-40, 0], b: [40, 0] } }),
  );
  project.name = name;
  return project;
}

function bonded() {
  const one = createWaferAssembly(wafer('Receiver'), 'A');
  const two = appendWaferToAssembly(one, wafer('Donor B'), { donorId: 'B' });
  const three = appendWaferToAssembly(two.assembly, wafer('Donor C'), { donorId: 'C' });
  return createBondedAssemblyProject(three.assembly);
}

const fileLike = (value, name = 'three.wafercad') => ({
  name,
  size: Buffer.byteLength(value),
  text: async () => value,
});

test('native v2 Assembly loader verifies complete v15 donor provenance before UI mounting', async () => {
  const project = bonded();
  const loaded = await readAssemblyPreviewFile(fileLike(serializeProject(project)));
  assert.equal(loaded.source, 'three.wafercad');
  assert.equal(loaded.data.waferAssembly.sources.length, 3);
  assert.deepEqual(loaded.data.model, project.model);
});

test('native v2 Assembly loader rejects unsafe files without overwriting a workspace', async () => {
  const original = bonded();
  const bytes = serializeProject(original);
  await assert.rejects(
    () => readAssemblyPreviewFile(fileLike(bytes, 'project.json')),
    /\.wafercad/,
  );
  await assert.rejects(
    () =>
      readAssemblyPreviewFile({
        name: 'huge.wafercad',
        size: MAX_PROJECT_FILE_BYTES + 1,
        text: async () => bytes,
      }),
    /size limit/,
  );
  await assert.rejects(
    () => readAssemblyPreviewFile(fileLike(serializeProject(wafer('Not bonded')))),
    /does not contain a bonded v15 Assembly/,
  );

  const corrupted = structuredClone(original);
  corrupted.waferAssembly.sources[1].bytes += 1;
  await assert.rejects(() => readAssemblyPreviewFile(fileLike(JSON.stringify(corrupted))), /bytes/);
});

test('real native v2 runtime renders one shared physical model for each read-only Bond stage', () => {
  const original = bonded();
  const store = createWorkstationRuntime(
    { source: 'three.wafercad', hash: '', data: original },
    { assemblyPreview: true },
  );
  assert.equal(store.assemblyPreviewSession.currentIndex(), 2);
  assert.deepEqual(store.state.model, original.model);
  assert.equal(store.state.threeShowBorders, true);
  assert.equal(store.state.sectionCollapse.enabled, false);
  assert.ok(store.state.sectionCollapse.top > store.state.sectionCollapse.bottom);
  assert.equal(assemblyPreviewZExtent(store.state.model).thicknessUm, 1200);
  const physicalBeforePresentation = structuredClone(store.state.model);
  const presentation = store.renderModel();
  assert.notEqual(presentation, store.state.model, 'Render copy may carry origin colors');
  for (const [index, bond] of original.waferAssembly.bonds.entries()) {
    for (const donorLayerId of Object.values(bond.donorLayerIds)) {
      assert.equal(
        presentation.layers.find((layer) => layer.id === donorLayerId)?.color,
        ASSEMBLY_ORIGIN_COLORS[index + 1],
      );
    }
  }
  assert.deepEqual(store.state.model, physicalBeforePresentation);
  const main = store.viewState('main');
  const mask = store.viewState('mask');
  const section = store.viewState('section');
  const three = store.viewState('three');
  assert.equal(main.model, mask.model);
  assert.equal(main.model, section.model);
  assert.equal(main.model, three.model);

  const first = store.restoreAssemblyStage(1);
  assert.equal(first.waferAssembly.sources.length, 2);
  assert.deepEqual(store.state.model, first.model);
  assert.equal(assemblyPreviewZExtent(store.state.model).thicknessUm, 800);
  assert.equal(store.state.threeShowBorders, true);
  assert.equal(store.state.sectionCollapse.enabled, false);
  assert.ok(store.state.sectionCollapse.top > store.state.sectionCollapse.bottom);
  assert.equal(main.model, mask.model);
  assert.equal(main.model, three.model);

  const receiver = store.restoreAssemblyStage(0);
  assert.equal(receiver.waferAssembly, undefined);
  assert.equal(store.renderModel(), store.state.model, 'Standalone receiver uses native colors');
  assert.deepEqual(store.state.model, original.waferAssembly.sources[0].project.model);
  assert.equal(assemblyPreviewZExtent(store.state.model).thicknessUm, 400);
  assert.equal(store.state.threeShowBorders, true);

  const back = store.restoreAssemblyStage(2);
  assert.deepEqual(store.state.model, back.model);
  assert.deepEqual(store.state.model, original.model);
  assert.equal(store.assemblyPreviewSession.currentIndex(), 2);
  assert.equal(store.history.listHistory().length, 0, 'normal editor History remains untouched');
  assert.deepEqual(
    original.waferAssembly.sources[1].project.model,
    bonded().waferAssembly.sources[1].project.model,
  );
});

test('native v2 ordinary workstation still refuses bonded files without preview opt-in', () => {
  const original = bonded();
  assert.throws(
    () => createWorkstationRuntime({ source: 'three.wafercad', data: original }),
    /requires the multi-wafer editor/,
  );
  assert.throws(
    () =>
      createWorkstationRuntime(
        { source: 'standalone', data: wafer('A') },
        { assemblyPreview: true },
      ),
    /requires verified Assembly provenance/,
  );
});

test('Assembly preview Z extent never invents dimensions for missing physical material', () => {
  assert.throws(() => assemblyPreviewZExtent({ regions: [] }), /physical Z extent/);
  assert.throws(
    () => assemblyPreviewZExtent({ regions: [{ stack: [{ z0: 0, z1: 0 }] }] }),
    /physical Z extent/,
  );
});

test('opt-in native draft commits a third donor with Recovery before actual workspace mutation', async () => {
  const original = bonded();
  const store = createWorkstationRuntime(
    { source: 'three.wafercad', hash: '', data: original },
    { assemblyPreview: true },
  );
  const checkpoints = [];
  const session = store.createAssemblyBondDraftSession(async (project, reason) => {
    checkpoints.push({ project, reason });
    return true;
  });
  assert.equal(session.currentIndex(), 2);
  const fourth = wafer('Donor D');
  const result = await session.bond(fourth, { donorId: 'D' });
  assert.equal(checkpoints.length, 1);
  assert.deepEqual(checkpoints[0].project, original);
  assert.equal(checkpoints[0].reason, 'pre-wafer-bond');
  assert.equal(result.operation.donorId, 'D');
  assert.equal(store.assemblyPreviewSession.currentIndex(), 3);
  assert.equal(store.assemblyPreviewSession.maxIndex(), 3);
  assert.equal(store.state.waferAssembly.sources.length, 4);
  assert.deepEqual(store.state.model, result.project.model);
  assert.equal(store.state.threeShowBorders, true);
  assert.equal(assemblyPreviewZExtent(store.state.model).thicknessUm, 1600);
  assert.deepEqual(store.restoreAssemblyStage(2).model, original.model);
  assert.deepEqual(store.restoreAssemblyStage(3).model, result.project.model);
  assert.deepEqual(store.assemblyPreviewSession.fullProduct(), result.project);
  assert.equal(store.history.listHistory().length, 0, 'ordinary History owner remains untouched');
});

test('isolated Recovery store refuses commits where IndexedDB is unavailable', async () => {
  const { createAssemblyBondDraftRecovery } = await import('../wafer-assembly-draft-recovery.js');
  const recovery = createAssemblyBondDraftRecovery({ indexedDB: null });
  await assert.rejects(() => recovery.checkpoint(bonded()), /requires IndexedDB/);
  await assert.rejects(() => recovery.load('missing'), /requires IndexedDB/);
});

test('editable native v2 begins with a standalone receiver and delegates first Bond to one source owner', async () => {
  const receiver = wafer('Standalone A');
  const preview = await readAssemblyPreviewFile(
    {
      name: 'receiver.wafercad',
      size: Buffer.byteLength(serializeProject(receiver)),
      text: async () => serializeProject(receiver),
    },
    undefined,
    { allowStandalone: true },
  );
  assert.deepEqual(preview.data.model, receiver.model);
  await assert.rejects(
    () =>
      readAssemblyPreviewFile({
        name: 'receiver.wafercad',
        size: Buffer.byteLength(serializeProject(receiver)),
        text: async () => serializeProject(receiver),
      }),
    /does not contain a bonded v15 Assembly/,
  );
  const store = createWorkstationRuntime(preview, {
    assemblyPreview: true,
    firstBondDraft: true,
  });
  const checkpoints = [];
  const session = store.createAssemblyBondDraftSession(async (project, reason) => {
    checkpoints.push({ project, reason });
    return true;
  });
  assert.equal(session.currentIndex(), 0);
  assert.equal(session.maxIndex(), 0);
  assert.deepEqual(store.state.model, receiver.model);
  const first = await session.bond(wafer('Donor B'), { receiverId: 'A', donorId: 'B' });
  assert.equal(first.project.waferAssembly.sources.length, 2);
  assert.equal(store.assemblyPreviewSession.currentIndex(), 1);
  assert.deepEqual(store.state.model, first.project.model);
  assert.equal(store.history.listHistory().length, 0);
  assert.deepEqual(checkpoints[0].project, receiver);
  assert.deepEqual(store.restoreAssemblyStage(0).model, receiver.model);
  assert.deepEqual(store.restoreAssemblyStage(1).model, first.project.model);
  const third = await session.bond(wafer('Donor C'), { donorId: 'C' });
  assert.equal(third.project.waferAssembly.sources.length, 3);
  assert.equal(checkpoints.length, 2);
  assert.deepEqual(checkpoints[1].project, first.project);
  assert.deepEqual(store.state.model, third.project.model);
  assert.deepEqual(
    store.assemblyPreviewSession.listHistory().map((node) => node.operation.donorId),
    ['B', 'C'],
  );
});

test('editable native v2 refuses the standalone source without a first-Bond opt-in', () => {
  const receiver = wafer('Standalone A');
  assert.throws(
    () =>
      createWorkstationRuntime({ source: 'receiver', data: receiver }, { assemblyPreview: true }),
    /requires verified Assembly provenance/,
  );
  assert.throws(
    () =>
      createWorkstationRuntime({ source: 'receiver', data: receiver }, { firstBondDraft: true }),
    /First-Bond draft requires/,
  );
});

test('native editor reopens complete source-shared Variant sidecar with C and D as distinct branches', async () => {
  const original = bonded();
  const runtime = createWorkstationRuntime(
    { source: 'three.wafercad', hash: '', data: original },
    { assemblyPreview: true },
  );
  const session = runtime.createAssemblyBondDraftSession(async () => true);
  session.restoreIndex(1);
  session.createVariant('alt', 'Alternate D');
  const changed = await session.bond(wafer('donor D', 350), { donorId: 'D' });
  const graph = session.exportVariantGraph();
  const bytes = JSON.stringify(graph);
  const file = {
    name: 'graph.wafercad-variants.json',
    size: Buffer.byteLength(bytes),
    text: async () => bytes,
  };
  const reopened = await readAssemblyPreviewFile(file, undefined, { allowStandalone: true });
  assert.equal(reopened.variantGraph.sources.length, 4);
  assert.equal(reopened.variantGraph.branches.length, 2);
  assert.deepEqual(reopened.data.model, changed.project.model);
  const active = createWorkstationRuntime(reopened, { assemblyPreview: true });
  const restored = active.createAssemblyBondDraftSession(async () => true);
  assert.deepEqual(
    restored.listVariants().map((variant) => variant.id),
    ['main', 'alt'],
  );
  assert.deepEqual(restored.fullProduct().model, changed.project.model);
  assert.deepEqual(restored.switchVariant('main').model, original.model);
  assert.deepEqual(restored.switchVariant('alt').model, changed.project.model);
  assert.equal(active.history.listHistory().length, 0, 'normal History remains untouched');
  await assert.rejects(() => readAssemblyPreviewFile(file), /Select a .wafercad Assembly project/);
  const forged = structuredClone(graph);
  forged.sources[1].bytes += 1;
  const evil = JSON.stringify(forged);
  await assert.rejects(
    () =>
      readAssemblyPreviewFile(
        {
          name: 'forged.wafercad-variants.json',
          size: Buffer.byteLength(evil),
          text: async () => evil,
        },
        undefined,
        { allowStandalone: true },
      ),
    /provenance mismatch/,
  );
});
