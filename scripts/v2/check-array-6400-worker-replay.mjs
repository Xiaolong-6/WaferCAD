// #289: persisted 6400-site History replay metadata drives the production browser Worker.
// The focused Mask operations each change one site; this is not full-mask Run All.
import assert from 'node:assert/strict';
import { loadGeometryKernel, projectForBenchmark } from '../process-benchmarks.mjs';
import { launchBrowser, newUiPage } from '../test-helpers/ui.mjs';
import { createSnapshotManager } from '../../site/workspace-snapshots.js';

await loadGeometryKernel();
const { applyOperation, createModel } = await import('../../site/model.js');
const { createRectangularGridArrayModel } = await import('../../site/model-array-construction.js');
const { migrateProjectFile, validateProjectFile } = await import('../../site/project-schema.js');
const { serializeProject, readProjectFile } = await import('../../site/project-io.js');
const { rectMulti } = await import('../../site/vector-geometry.js');

const source = createModel({ shape: 'rect', width: 0.375, height: 0.375, thickness: 2 });
const seed = createRectangularGridArrayModel(source, {
  kind: 'rect-grid',
  rows: 80,
  columns: 80,
  pitchX: 0.375,
  pitchY: 0.375,
  activeSites: 4725,
});
let live = migrateProjectFile(
  projectForBenchmark({ model: seed, section: { a: [-15, 0], b: [15, 0] } }),
);
live.layout.root = 'GRID';
live.layout.hierarchy = { GRID: [] };
live.activeCell = 'GRID';
live.selectedLayerKeys = ['1|0'];
live.maskSourceMode = 'file';

const identity = { x: 0, y: 0, scale: 1, rotation: 0 };
const manager = createSnapshotManager({
  capture: () => live,
  restore: (state) => {
    live = state;
  },
  validateState: (candidate) => {
    validateProjectFile(candidate);
    return true;
  },
  nodeIdFactory: (() => {
    let index = 0;
    return () => 'worker-6400-' + ++index;
  })(),
});
const operations = [
  {
    kind: 'add',
    label: 'Masked 10 nm deposit',
    params: {
      type: 'add',
      name: 'Worker replay 10nm',
      face: 'front',
      growth: 'direct',
      thickness: 0.01,
    },
    footprint: rectMulti(0.2, 0.2, 0.1875, 0.1875),
  },
  {
    kind: 'etch',
    label: 'Masked 10 nm selective Etch',
    params: {
      type: 'etch',
      face: 'front',
      etchProfile: 'directional',
      etchTargetLayerIds: ['layer-1'],
      thickness: 0.01,
    },
    footprint: rectMulti(0.1, 0.1, 0.1875, 0.1875),
  },
];
for (const step of operations) {
  live.layout.elements = [
    {
      kind: 'polygon',
      sourceCell: 'GRID',
      layer: 1,
      datatype: 0,
      points: step.footprint[0][0].slice(0, -1),
    },
  ];
  const result = applyOperation(live.model, { ...step.params, area: step.footprint });
  assert.equal(result.changed, true, result.error);
  manager.recordOperation({
    kind: step.kind,
    label: step.label,
    areaMode: 'mask',
    replay: {
      version: 1,
      params: structuredClone(step.params),
      areaMode: 'mask',
      maskContext: {
        sourceMode: 'file',
        cell: 'GRID',
        layerKeys: ['1|0'],
        transform: structuredClone(identity),
        roi: null,
      },
    },
  });
}
const saved = {
  ...live,
  snapshots: manager.exportRecords(),
  snapshotBranches: manager.exportBranchState(),
};
validateProjectFile(saved);
const serialized = serializeProject(saved);
const loaded = await readProjectFile({
  size: Buffer.byteLength(serialized),
  text: async () => serialized,
});
assert.deepEqual(loaded, saved, 'Persisted History model and Mask context remain exact');
const nodes = loaded.snapshotBranches.nodes;
assert.equal(nodes.length, 2);
assert.equal(nodes[1].parentId, nodes[0].id);
for (const node of nodes) assert.equal(node.operation.replay.version, 1);
assert.ok(manager.listHistory().every((step) => step.replayable));

const browser = await launchBrowser();
try {
  const { context, page } = await newUiPage(browser, { viewport: { width: 1280, height: 800 } });
  try {
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    const base = process.env.WAFERCAD_V2_BASE || 'http://127.0.0.1:4182';
    await page.goto(base + '/app.html?start=empty', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 120000,
    });

    const replayed = await page.evaluate(
      async ({ seedModel, storedNodes }) => {
        // Each request creates a real, separately isolated browser Worker.
        // Parameters and area are reconstructed solely from persisted Step state.
        let model = seedModel;
        const resultLog = [];
        for (const node of storedNodes) {
          const descriptor = node.operation.replay;
          const mask = descriptor.maskContext;
          const layers = new Set(mask.layerKeys);
          const elements = node.state.layout.elements
            .filter(
              (element) =>
                element.sourceCell === mask.cell &&
                layers.has(element.layer + '|' + element.datatype),
            )
            .map(({ kind, width, points }) => ({ kind, width, points }));
          if (elements.length !== 1) throw Error('History did not restore its Mask elements');
          const output = await new Promise((resolve, reject) => {
            const worker = new Worker('/process-worker.js');
            const timeout = setTimeout(() => {
              worker.terminate();
              reject(Error('6400-site production Worker did not finish'));
            }, 120000);
            worker.onmessage = ({ data }) => {
              if (data?.id !== 1 || data.type === 'progress') return;
              clearTimeout(timeout);
              worker.terminate();
              if (data.type === 'error' || data.rejected) {
                reject(Error(data.message || data.error || 'Worker rejected the process'));
              } else {
                resolve(data);
              }
            };
            worker.onerror = (error) => {
              clearTimeout(timeout);
              worker.terminate();
              reject(Error(error.message || 'Worker crashed'));
            };
            worker.postMessage({
              id: 1,
              model,
              params: descriptor.params,
              areaRequest: {
                mode: descriptor.areaMode,
                maskSourceMode: mask.sourceMode,
                maskTransform: mask.transform,
                maskRoi: mask.roi,
                elements,
              },
            });
          });
          if (!output.validated || !output.result?.changed)
            throw Error('Worker must validate and modify one physical site');
          resultLog.push({
            instances: output.model.array.instances.length,
            changed: output.result.arrayChangedInstances,
          });
          model = output.model;
        }
        return { model, resultLog };
      },
      { seedModel: seed, storedNodes: nodes },
    );
    assert.deepEqual(
      replayed.model,
      loaded.model,
      'Real browser Worker must reproduce the persisted 6400-site History HEAD exactly',
    );
    assert.deepEqual(replayed.resultLog, [
      { instances: 6400, changed: 1 },
      { instances: 6400, changed: 1 },
    ]);
    assert.deepEqual(pageErrors, []);
    console.log('V2_ARRAY_6400_WORKER_HISTORY_REPLAY: persisted Mask steps -> actual Worker PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
