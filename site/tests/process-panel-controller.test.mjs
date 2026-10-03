import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vendorSource = readFileSync(
  new URL('../vendor/polygon-clipping.umd.js', import.meta.url),
  'utf8',
);
const commonJsModule = { exports: {} };
new Function('module', 'exports', vendorSource)(commonJsModule, commonJsModule.exports);
globalThis.polygonClipping = commonJsModule.exports;

const { createModel } = await import('../model.js');
const { createProcessPanelController } = await import('../controllers/process-panel-controller.js');

function fakeRoot() {
  const values = {
    operationType: 'add',
    operationThickness: '0.1',
    operationArea: 'full',
    layerName: 'Probe',
    targetLayer: '',
    etchSurfaceMode: 'smooth',
    growthMode: 'direct',
    implantName: 'Implant 1',
    implantTilt: '0',
    roughFeatureSize: '1',
    roughAmplitude: '1',
    roughFeatureCv: '0',
    roughHeightCv: '0',
    roughPolarity: 'inverted',
  };
  const elements = new Map(
    Object.entries(values).map(([id, value]) => [
      id,
      {
        id,
        value,
        disabled: false,
        textContent: '',
        classList: { toggle() {} },
      },
    ]),
  );
  return {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          id,
          value: '',
          disabled: false,
          textContent: '',
          classList: { toggle() {} },
        });
      }
      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    },
  };
}

function controllerForTask(taskResult, events) {
  let model = createModel();
  const root = fakeRoot();
  const controller = createProcessPanelController({
    root,
    getModel: () => model,
    setModel: (value) => {
      events.push('set-model');
      model = value;
    },
    getActiveFace: () => 'front',
    getMaskState: () => ({
      maskSourceMode: 'file',
      maskRoi: null,
      drawMask: { shapes: [] },
      maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      layout: { elements: [] },
    }),
    operationAreaGeometry: () => [],
    selectedElement: () => true,
    manualMicron: (value) => Number(value),
    formatLengthField: (value) => String(value),
    processTaskController: {
      isBusy: () => false,
      run: async () => {
        events.push('run-worker');
        return taskResult(model);
      },
    },
    saveHistory: () => events.push('save-history'),
    beforeApply: async () => {
      events.push('prepare-variant');
      return { createVariant: true };
    },
    commitApplyBranch: async () => events.push('commit-variant'),
    recordProcessOperation: () => events.push('record-operation'),
    clearBaseRevertSnapshot: () => {},
    colorNewLayer: () => {},
    colorNewImplant: () => {},
    renderAll: () => events.push('render'),
    status: () => {},
  });
  return controller;
}

test('historical Apply does not commit a variant when the worker does not change the model', async () => {
  for (const taskResult of [
    () => ({ aborted: true }),
    () => ({ error: 'synthetic failure' }),
    () => ({ busy: true }),
    () => ({ result: { changed: false, error: 'no change' } }),
  ]) {
    const events = [];
    const controller = controllerForTask(taskResult, events);
    await controller.applyOperation();
    assert.equal(events.includes('commit-variant'), false);
    assert.equal(events.includes('set-model'), false);
    assert.equal(events.includes('record-operation'), false);
  }
});

test('historical Apply commits the variant only after a successful changed worker result', async () => {
  const events = [];
  const controller = controllerForTask(
    (model) => ({
      result: { changed: true },
      model: {
        ...model,
        revision: model.revision + 1,
        processRevision: model.processRevision + 1,
      },
    }),
    events,
  );

  await controller.applyOperation();

  assert.ok(events.indexOf('run-worker') >= 0);
  assert.ok(events.indexOf('commit-variant') > events.indexOf('run-worker'));
  assert.ok(events.indexOf('set-model') > events.indexOf('commit-variant'));
  assert.ok(events.indexOf('record-operation') > events.indexOf('set-model'));
});
