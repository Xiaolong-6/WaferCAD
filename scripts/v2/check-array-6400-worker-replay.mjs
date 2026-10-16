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

    // The two full-field operations above used real Workers; now promote
    // those exact scientific states into an actual native v2 History project.
    // Editing the earlier 4725-device Mask through UI must replay the later
    // whole-device Mask Etch, not merely replay a synthetic per-site request.
    let uiProject = migrateProjectFile(
      projectForBenchmark({
        model: structuredClone(seed),
        section: { a: [-15, 0], b: [15, 0] },
      }),
    );
    uiProject.name = '4725 device full Mask History replay';
    uiProject.layout.root = 'GRID';
    uiProject.layout.hierarchy = { GRID: [] };
    uiProject.activeCell = 'GRID';
    uiProject.selectedLayerKeys = ['1|0'];
    uiProject.maskSourceMode = 'file';
    const uiHistory = createSnapshotManager({
      capture: () => uiProject,
      restore: (value) => {
        uiProject = value;
      },
      validateState: (value) => {
        validateProjectFile(value);
        return true;
      },
      nodeIdFactory: (() => {
        let n = 0;
        return () => 'full-mask-ui-' + ++n;
      })(),
    });
    // A native History edit requires a real restorable predecessor Process node.
    // Preserve the pristine 6400-site Base explicitly rather than disabling
    // History's safety checks for the first deposited Step.
    uiHistory.recordOperation({ kind: 'record', label: 'Pristine 6400-site Base' });
    const maskSteps = [
      {
        kind: 'add',
        label: '4725 device masked film',
        model: fullMask.deposited,
        elements: activeMask,
        params: {
          type: 'add',
          name: '4725-device mask 10nm',
          face: 'front',
          growth: 'direct',
          thickness: 0.01,
        },
        resultLayerId: fullMask.filmId,
      },
      {
        kind: 'etch',
        label: '4725 device masked selective Etch',
        model: fullMask.etched,
        elements: innerMask,
        params: {
          type: 'etch',
          face: 'front',
          etchProfile: 'directional',
          thickness: 0.01,
          etchTargetLayerIds: [fullMask.filmId],
        },
      },
    ];
    for (const step of maskSteps) {
      uiProject.model = structuredClone(step.model);
      uiProject.layout.elements = step.elements.map((element) => ({
        kind: 'polygon',
        sourceCell: 'GRID',
        layer: 1,
        datatype: 0,
        points: element.points,
      }));
      uiHistory.recordOperation({
        kind: step.kind,
        label: step.label,
        areaMode: 'mask',
        ...(step.resultLayerId ? { resultLayerId: step.resultLayerId } : {}),
        replay: {
          version: 1,
          params: structuredClone(step.params),
          areaMode: 'mask',
          maskContext: {
            sourceMode: 'file',
            cell: 'GRID',
            layerKeys: ['1|0'],
            transform: { x: 0, y: 0, scale: 1, rotation: 0 },
            roi: null,
          },
        },
      });
    }
    const uiSaved = {
      ...uiProject,
      snapshots: uiHistory.exportRecords(),
      snapshotBranches: uiHistory.exportBranchState(),
    };
    validateProjectFile(uiSaved);
    const uiBytes = serializeProject(uiSaved);
    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#openProjectInput').setInputFiles({
      name: '4725-device-full-mask-history.wafercad',
      mimeType: 'application/json',
      buffer: Buffer.from(uiBytes),
    });
    const openConfirmation = page.getByRole('button', {
      name: 'Open project',
      exact: true,
    });
    if (await openConfirmation.isVisible()) await openConfirmation.click();
    await page.waitForFunction(
      (name) => {
        const state = window.WaferCadV2Workstation.snapshot();
        return (
          state.projectName === name && state.workflow.steps.length === 3 && !state.workflow.busy
        );
      },
      uiSaved.name,
      { timeout: 180000 },
    );
    const imported = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(imported.model.array.instances.length, 6400);
    assert.deepEqual(
      imported.model,
      fullMask.etched,
      'Actual UI import keeps the complete Mask result',
    );
    await page.locator('[data-action="domain:history"]').click();
    const editRow = page
      .locator('.history-step-wrap', {
        hasText: '4725 device masked film',
      })
      .first();
    await editRow.locator('.snapshot-more-trigger').click();
    await editRow.locator('.snapshot-more-popover button', { hasText: 'Edit Step' }).click();
    await page.waitForFunction(
      () =>
        /Save edited Step/.test(document.querySelector('#applyOperationBtn')?.textContent || ''),
      null,
      { timeout: 120000 },
    );
    await page.locator('#operationThickness').fill('0.02');
    await page.evaluate(() => {
      const post = Worker.prototype.postMessage;
      window.__largeHistoryReplay = { requests: 0 };
      Worker.prototype.postMessage = function (message, ...rest) {
        if (message?.params && message?.model) window.__largeHistoryReplay.requests++;
        return Reflect.apply(post, this, [message, ...rest]);
      };
    });
    await page.locator('#applyOperationBtn').evaluate((button) => button.click());
    await page
      .getByRole('button', {
        name: 'Replace & replay later Steps',
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () =>
        /Replayed 1 later Step/.test(
          document.querySelector('[data-slot="status.message"]')?.textContent || '',
        ) && !window.WaferCadV2Workstation.snapshot().workflow.busy,
      null,
      { timeout: 300000 },
    );
    assert.equal(
      await page.evaluate(() => window.__largeHistoryReplay.requests),
      2,
      'Full-device-field edited Mask and selective successor Etch must use two real Workers',
    );
    const uiEdited = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.equal(uiEdited.workflow.steps.length, 3);
    assert.equal(uiEdited.workflow.branches.length, 1);
    const newParts = physicalSites(uiEdited.model);
    let replayDevices = 0;
    for (let n = 0; n < newParts.length; n++) {
      if (initialParts[n].role === 'background') {
        assert.deepEqual(
          newParts[n].model,
          initialParts[n].model,
          initialParts[n].id + ' must remain untouched by replay',
        );
        continue;
      }
      replayDevices++;
      const part = newParts[n];
      assert.deepEqual(
        stack(part, [0, 0]),
        [
          ['base', -1, 1],
          [fullMask.filmId, 1, 1.01],
        ],
        part.id + ' should retain 10 nm at the etched center',
      );
      assert.deepEqual(
        stack(part, [0.075, 0.075]),
        [
          ['base', -1, 1],
          [fullMask.filmId, 1, 1.02],
        ],
        part.id + ' should retain 20 nm outside selective Etch',
      );
      assert.deepEqual(
        stack(part, [0.15, 0.15]),
        [['base', -1, 1]],
        part.id + ' outside the file Mask must remain bare',
      );
    }
    assert.equal(replayDevices, 4725);
    await page.locator('[data-action="domain:project"]').click();
    await page.locator('#saveProjectBtn').click();
    await page.waitForFunction(
      () => /Saved/.test(document.querySelector('[data-slot="status.message"]')?.textContent || ''),
      null,
      { timeout: 180000 },
    );
    await page.goto(base + '/app.html', {
      waitUntil: 'domcontentloaded',
      timeout: 180000,
    });
    await page.waitForFunction(() => window.WaferCadV2Workstation?.ready, null, {
      timeout: 180000,
    });
    const afterReload = await page.evaluate(() => window.WaferCadV2Workstation.snapshot());
    assert.deepEqual(afterReload.model, uiEdited.model, 'Full Mask UI replay survives reopening');
    assert.deepEqual(afterReload.workflow.steps, uiEdited.workflow.steps);
    assert.deepEqual(afterReload.workflow.branches, uiEdited.workflow.branches);
    console.log(
      'V2_ARRAY_4725_HISTORY_UI: full Mask edit plus replayed Etch, 4725 Z probes, Save/Reload PASS',
    );

    assert.deepEqual(pageErrors, []);
    console.log('V2_ARRAY_6400_WORKER_HISTORY_REPLAY: persisted Mask steps -> actual Worker PASS');
  } finally {
    await context.close();
  }
} finally {
  await browser.close();
}
