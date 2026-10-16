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

    // #289: whole-mask scientific acceptance of all 4,725 active devices.
    // Each site has an independent 200 nm selected square: all 1,675
    // background sites are deliberately excluded from the same file Mask.
    // One Worker request must commit every selected device atomically.
    const allDevices = seed.array.instances.filter((item) => item.role === 'device');
    assert.equal(allDevices.length, 4725);
    const activeMask = allDevices.map((site) => ({
      kind: 'polygon',
      points: rectMulti(0.2, 0.2, site.x, site.y)[0][0].slice(0, -1),
    }));
    const innerMask = allDevices.map((site) => ({
      kind: 'polygon',
      points: rectMulti(0.1, 0.1, site.x, site.y)[0][0].slice(0, -1),
    }));
    const fullMask = await page.evaluate(
      async ({ initialModel, maskDeposit, maskEtch }) => {
        const operate = (model, params, elements) =>
          new Promise((resolve, reject) => {
            const worker = new Worker('/process-worker.js');
            const timeout = setTimeout(() => {
              worker.terminate();
              reject(Error('Full-mask 4725-device production Worker timed out'));
            }, 180000);
            const fail = (message) => {
              clearTimeout(timeout);
              worker.terminate();
              reject(Error(message));
            };
            worker.onmessage = ({ data }) => {
              if (data?.id !== 1 || data.type === 'progress') return;
              if (data.type === 'error' || data.rejected)
                return fail(data.message || data.error || 'Full-mask Worker rejected Process');
              clearTimeout(timeout);
              worker.terminate();
              resolve(data);
            };
            worker.onerror = (error) => fail(error.message || 'Full-mask Worker crashed');
            worker.postMessage({
              id: 1,
              model,
              params,
              areaRequest: {
                mode: 'mask',
                maskSourceMode: 'file',
                maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
                maskRoi: null,
                elements,
              },
            });
          });
        const deposit = await operate(
          initialModel,
          {
            type: 'add',
            name: '4725-device mask 10nm',
            face: 'front',
            growth: 'direct',
            thickness: 0.01,
          },
          maskDeposit,
        );
        if (!deposit.validated || !deposit.result?.changed || !deposit.result.layerId)
          throw Error('Full-mask 10 nm film must be validated and get a material ID');
        const etch = await operate(
          deposit.model,
          {
            type: 'etch',
            face: 'front',
            etchProfile: 'directional',
            thickness: 0.01,
            etchTargetLayerIds: [deposit.result.layerId],
          },
          maskEtch,
        );
        if (!etch.validated || !etch.result?.changed)
          throw Error('Full-mask selective Etch must be validated');
        return {
          deposited: deposit.model,
          etched: etch.model,
          filmId: deposit.result.layerId,
          depositResult: deposit.result,
          etchResult: etch.result,
        };
      },
      { initialModel: seed, maskDeposit: activeMask, maskEtch: innerMask },
    );
    assert.equal(fullMask.depositResult.arrayChangedInstances, 4725);
    assert.equal(fullMask.etchResult.arrayChangedInstances, 4725);
    assert.equal(fullMask.deposited.array.instances.length, 6400);
    assert.equal(fullMask.etched.array.instances.length, 6400);

    const physicalSites = (model) => {
      const templates = new Map(model.array.templates.map((item) => [item.id, item.model]));
      return model.array.instances.map((item) => ({
        ...item,
        model: templates.get(item.templateId),
      }));
    };
    const initialParts = physicalSites(seed);
    const addedParts = physicalSites(fullMask.deposited);
    const etchedParts = physicalSites(fullMask.etched);
    const { pointInMulti } = await import('../../site/vector-geometry.js');
    const stack = (part, point) => {
      const owners = part.model.regions.filter((region) => pointInMulti(point, region.geom));
      assert.equal(owners.length, 1, part.id + ' must have one physical owner at ' + point);
      return owners[0].stack.map(({ layerId, z0, z1 }) => [layerId, z0, z1]);
    };
    let verifiedDevices = 0;
    let verifiedBackground = 0;
    for (let index = 0; index < 6400; index++) {
      const basePart = initialParts[index];
      const deposited = addedParts[index];
      const etched = etchedParts[index];
      assert.deepEqual(
        [deposited.id, deposited.role, deposited.x, deposited.y],
        [basePart.id, basePart.role, basePart.x, basePart.y],
        'Deposit must preserve site identity, placement and role',
      );
      assert.deepEqual(
        [etched.id, etched.role, etched.x, etched.y],
        [basePart.id, basePart.role, basePart.x, basePart.y],
        'Etch must preserve site identity, placement and role',
      );
      const substrate = [['base', -1, 1]];
      if (basePart.role === 'background') {
        verifiedBackground++;
        assert.deepEqual(deposited.model, basePart.model, basePart.id + ' deposit leak');
        assert.deepEqual(etched.model, basePart.model, basePart.id + ' etch leak');
        continue;
      }
      verifiedDevices++;
      const coated = [...substrate, [fullMask.filmId, 1, 1.01]];
      assert.deepEqual(stack(deposited, [0, 0]), coated, basePart.id + ' center coating');
      assert.deepEqual(
        stack(deposited, [0.15, 0.15]),
        substrate,
        basePart.id + ' outside Mask must stay bare',
      );
      assert.deepEqual(stack(etched, [0, 0]), substrate, basePart.id + ' selected Etch');
      assert.deepEqual(
        stack(etched, [0.075, 0.075]),
        coated,
        basePart.id + ' retained annular 10 nm film',
      );
      assert.deepEqual(
        stack(etched, [0.15, 0.15]),
        substrate,
        basePart.id + ' outside Mask Etch untouched',
      );
    }
    assert.equal(verifiedDevices, 4725);
    assert.equal(verifiedBackground, 1675);
    const fullProject = migrateProjectFile(
      projectForBenchmark({
        model: fullMask.etched,
        section: { a: [-15, 0], b: [15, 0] },
      }),
    );
    validateProjectFile(fullProject);
    const fullSerialized = serializeProject(fullProject);
    const fullReopened = await readProjectFile({
      size: Buffer.byteLength(fullSerialized),
      text: async () => fullSerialized,
    });
    assert.deepEqual(
      fullReopened.model,
      fullMask.etched,
      'All 4725 processed device stacks must survive canonical Save/Reload',
    );
    console.log(
      'V2_ARRAY_4725_FULL_MASK: 4725 exact deposits/etches, 1675 protected background, IO PASS',
    );

    assert.deepEqual(pageErrors, []);
    console.log('V2_ARRAY_6400_WORKER_HISTORY_REPLAY: persisted Mask steps -> actual Worker PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
