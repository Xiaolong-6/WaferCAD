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
const { readAssemblyPreviewFile } = await import('../ui-v2/assembly-preview.js');

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
  await assert.rejects(
    () => readAssemblyPreviewFile(fileLike(JSON.stringify(corrupted))),
    /bytes/,
  );
});

test('real native v2 runtime renders one shared physical model for each read-only Bond stage', () => {
  const original = bonded();
  const store = createWorkstationRuntime(
    { source: 'three.wafercad', hash: '', data: original },
    { assemblyPreview: true },
  );
  assert.equal(store.assemblyPreviewSession.currentIndex(), 2);
  assert.deepEqual(store.state.model, original.model);
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
  assert.equal(main.model, mask.model);
  assert.equal(main.model, three.model);

  const receiver = store.restoreAssemblyStage(0);
  assert.equal(receiver.waferAssembly, undefined);
  assert.deepEqual(store.state.model, original.waferAssembly.sources[0].project.model);

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
      createWorkstationRuntime({ source: 'standalone', data: wafer('A') }, { assemblyPreview: true }),
    /requires verified Assembly provenance/,
  );
});
