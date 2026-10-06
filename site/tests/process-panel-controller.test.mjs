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
globalThis.Option ??= class Option {
  constructor(textContent = '', value = '') {
    this.textContent = textContent;
    this.value = value;
  }
};

const { createModel } = await import('../model.js');
const { createProcessPanelController } = await import('../controllers/process-panel-controller.js');

function fakeElement(id, value = '') {
  return {
    id,
    value,
    disabled: false,
    textContent: '',
    options: [],
    add(option) {
      this.options.push(option);
    },
    classList: { toggle() {} },
  };
}

function fakeRoot() {
  const values = {
    operationType: 'add',
    operationThickness: '0.1',
    operationArea: 'full',
    layerName: 'Probe',
    targetLayer: '',
    etchTargetLayer: '',
    etchSurfaceMode: 'smooth',
    growthMode: 'direct',
    implantName: 'Implant 1',
    implantTilt: '0',
    electricalName: 'Electrical Region 1',
    electricalRegionType: 'p-inversion',
    electricalRegionSource: 'induced',
    roughFeatureSize: '1',
    roughAmplitude: '1',
    roughFeatureCv: '0',
    roughHeightCv: '0',
    roughPolarity: 'inverted',
    recordProcessType: 'anneal',
    recordProcessLabel: 'Anneal',
    recordTemperature: '',
    recordDuration: '',
    recordAmbient: '',
    recordNote: '',
  };
  const elements = new Map(
    Object.entries(values).map(([id, value]) => [id, fakeElement(id, value)]),
  );
  elements.get('recordProcessType').selectedOptions = [{ textContent: 'Anneal' }];
  return {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, fakeElement(id));
      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    },
  };
}

function controllerForTask(taskResult, events, { mode = 'add', recorded = [] } = {}) {
  let model = createModel();
  const root = fakeRoot();
  root.getElementById('operationType').value = mode;
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
      layout: { root: 'TOP', elements: [] },
      activeCell: 'TOP',
      selectedLayerKeys: ['7|0', '8|2'],
    }),
    operationAreaGeometry: () => [],
    selectedElement: () => true,
    manualMicron: (value) => Number(value),
    formatLengthField: (value) => String(value),
    processTaskController: {
      isBusy: () => false,
      run: async (...args) => {
        events.push('run-worker');
        return taskResult(model, ...args);
      },
    },
    saveHistory: () => events.push('save-history'),
    beforeApply: async () => {
      events.push('prepare-variant');
      return { createVariant: true };
    },
    commitApplyBranch: async () => events.push('commit-variant'),
    recordProcessOperation: (operation) => {
      events.push('record-operation');
      recorded.push(operation);
    },
    clearBaseRevertSnapshot: () => {},
    colorNewLayer: () => {},
    colorNewImplant: () => {},
    colorNewElectricalRegion: () => events.push('color-electrical'),
    renderAll: () => events.push('render'),
    status: () => {},
  });
  controller.__root = root;
  controller.__getModel = () => model;
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

test('changed worker result is validated before Variant, model, or History commit', async () => {
  const events = [];
  const controller = controllerForTask(
    (model) => {
      const invalid = structuredClone(model);
      invalid.regions[0].stack[0].z1 = invalid.regions[0].stack[0].z0;
      invalid.revision += 1;
      invalid.processRevision += 1;
      return { result: { changed: true }, model: invalid };
    },
    events,
  );

  await controller.applyOperation();

  assert.ok(events.includes('run-worker'));
  assert.equal(events.includes('commit-variant'), false);
  assert.equal(events.includes('save-history'), false);
  assert.equal(events.includes('set-model'), false);
  assert.equal(events.includes('record-operation'), false);
});

test('replay rejects invalid worker geometry before mutating replay History', async () => {
  const events = [];
  const controller = controllerForTask(
    (model) => {
      const invalid = structuredClone(model);
      invalid.regions[0].stack[0].z1 = invalid.regions[0].stack[0].z0;
      invalid.revision += 1;
      invalid.processRevision += 1;
      return { result: { changed: true, layerId: 'layer-invalid' }, model: invalid };
    },
    events,
  );

  const result = await controller.replayOperations([
    {
      operation: {
        kind: 'add',
        label: 'Invalid replay result',
        replay: {
          version: 1,
          params: {
            type: 'add',
            name: 'Invalid',
            targetLayerId: '',
            thickness: 0.2,
            face: 'front',
            growth: 'direct',
          },
          areaMode: 'full',
        },
      },
      state: {
        maskSourceMode: 'file',
        maskRoi: null,
        maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
        selectedLayerKeys: [],
        activeCell: null,
        layout: { elements: [], hierarchy: {} },
      },
    },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.completed, 0);
  assert.match(result.error, /Process result rejected/);
  assert.equal(events.includes('save-history'), false);
  assert.equal(events.includes('set-model'), false);
  assert.equal(events.includes('record-operation'), false);
});

test('Record process step advances History without running geometry worker', async () => {
  const events = [],
    recorded = [],
    controller = controllerForTask(
      () => {
        throw new Error('record-only step must not run the geometry worker');
      },
      events,
      { mode: 'record', recorded },
    );
  controller.__root.getElementById('recordTemperature').value = '425';
  controller.__root.getElementById('recordDuration').value = '30';
  controller.__root.getElementById('recordAmbient').value = 'forming gas';
  controller.__root.getElementById('recordNote').value = 'contact anneal';

  await controller.applyOperation();

  assert.equal(events.includes('run-worker'), false);
  assert.ok(events.indexOf('commit-variant') > events.indexOf('prepare-variant'));
  assert.ok(events.indexOf('save-history') > events.indexOf('commit-variant'));
  assert.ok(events.indexOf('set-model') > events.indexOf('save-history'));
  assert.ok(events.indexOf('record-operation') > events.indexOf('set-model'));
  assert.equal(controller.__getModel().processRevision, 1);
  assert.equal(recorded.length, 1);
  assert.deepEqual(recorded[0], {
    kind: 'record',
    label: 'Anneal',
    processType: 'anneal',
    geometryChanged: false,
    temperatureC: 425,
    durationMin: 30,
    ambient: 'forming gas',
    note: 'contact anneal',
    replay: { version: 1, kind: 'record' },
  });
});

test('Electrical process mode sends typed annotation metadata through the worker path', async () => {
  const events = [],
    recorded = [],
    controller = controllerForTask(
      (model) => ({
        result: { changed: true, electricalRegionId: 'electrical-1' },
        model: {
          ...model,
          electricalRegions: [
            {
              id: 'electrical-1',
              name: 'Electrical Region 1',
              color: '#7A6FD0',
              face: 'front',
              thickness: 0.1,
              regionType: 'p-inversion',
              source: 'induced',
              visible: true,
              patches: [],
            },
          ],
          nextElectricalRegionId: 2,
          revision: model.revision + 1,
          processRevision: model.processRevision + 1,
        },
      }),
      events,
      { mode: 'electrical', recorded },
    );

  await controller.applyOperation();

  assert.ok(events.includes('run-worker'));
  assert.ok(events.includes('color-electrical'));
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].kind, 'electrical');
  assert.equal(recorded[0].electricalRegionType, 'p-inversion');
  assert.equal(recorded[0].electricalRegionSource, 'induced');
});

test('successful geometry Apply stores a deterministic replay request', async () => {
  const events = [],
    recorded = [],
    controller = controllerForTask(
      (model) => ({
        result: { changed: true, layerId: 'layer-1' },
        model: {
          ...model,
          revision: model.revision + 1,
          processRevision: model.processRevision + 1,
        },
      }),
      events,
      { mode: 'add', recorded },
    );

  controller.__root.getElementById('operationThickness').value = '0.25';
  controller.__root.getElementById('operationArea').value = 'full';
  controller.__root.getElementById('growthMode').value = 'conformal';

  await controller.applyOperation();

  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].replay.version, 1);
  assert.deepEqual(recorded[0].replay.params, {
    type: 'add',
    name: 'Probe',
    targetLayerId: '',
    thickness: 0.25,
    face: 'front',
    growth: 'conformal',
  });
  assert.equal(recorded[0].replay.areaMode, 'full');
  assert.deepEqual(recorded[0].maskContext, {
    sourceMode: 'file',
    cell: 'TOP',
    layerKeys: ['7|0', '8|2'],
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    roi: null,
  });
  assert.deepEqual(recorded[0].replay.maskContext, recorded[0].maskContext);
  assert.equal('areaRequest' in recorded[0].replay, false);
});

test('replayOperations re-runs saved geometry requests and preserves record-only Steps', async () => {
  const events = [],
    recorded = [],
    controller = controllerForTask(
      (model) => ({
        result: { changed: true, layerId: 'layer-replayed' },
        model: {
          ...model,
          revision: model.revision + 1,
          processRevision: model.processRevision + 1,
        },
      }),
      events,
      { mode: 'add', recorded },
    );

  const geometry = {
    operation: {
      kind: 'add',
      label: 'Deposit replayed layer',
      replay: {
        version: 1,
        params: {
          type: 'add',
          name: 'Replayed',
          targetLayerId: '',
          thickness: 0.2,
          face: 'front',
          growth: 'direct',
        },
        areaMode: 'full',
      },
    },
    state: {
      maskSourceMode: 'file',
      maskRoi: null,
      maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
      selectedLayerKeys: [],
      activeCell: null,
      layout: { elements: [], hierarchy: {} },
    },
  };
  const recordOnly = {
    kind: 'record',
    label: 'Anneal',
    replay: { version: 1, kind: 'record' },
  };

  const result = await controller.replayOperations([geometry, recordOnly]);

  assert.deepEqual(result, { ok: true, completed: 2 });
  assert.equal(controller.__getModel().processRevision, 2);
  assert.deepEqual(
    recorded.map((operation) => operation.label),
    ['Deposit replayed layer', 'Anneal'],
  );
  assert.equal(events.filter((event) => event === 'save-history').length, 2);
  assert.equal(events.filter((event) => event === 'record-operation').length, 2);
});

test('legacy downstream Step stops replay without guessing missing parameters', async () => {
  const events = [],
    controller = controllerForTask(() => {
      throw new Error('legacy operation must not reach worker');
    }, events);

  const result = await controller.replayOperations([{ kind: 'etch', label: 'Legacy etch' }]);

  assert.equal(result.ok, false);
  assert.equal(result.completed, 0);
  assert.match(result.error, /predates replay metadata/i);
  assert.equal(events.includes('run-worker'), false);
});

test('replay selected mask traverses the saved Cell hierarchy and pinned Layer context', async () => {
  const events = [],
    capturedAreas = [],
    controller = controllerForTask((model, _workerModel, _params, _label, areaRequest) => {
      capturedAreas.push(areaRequest);
      return {
        result: { changed: true, layerId: 'layer-root-replay' },
        model: {
          ...model,
          revision: model.revision + 1,
          processRevision: model.processRevision + 1,
        },
      };
    }, events);

  const maskContext = {
    sourceMode: 'file',
    cell: 'TOP',
    layerKeys: ['7|0'],
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    roi: null,
  };
  const result = await controller.replayOperations([
    {
      operation: {
        kind: 'add',
        label: 'Deposit selected ITO',
        areaMode: 'mask',
        maskContext,
        replay: {
          version: 1,
          params: {
            type: 'add',
            name: 'ITO',
            targetLayerId: '',
            thickness: 0.075,
            face: 'front',
            growth: 'direct',
          },
          areaMode: 'mask',
          maskContext,
        },
      },
      state: {
        maskSourceMode: 'file',
        maskRoi: null,
        maskTransform: { x: 0, y: 0, scale: 1, rotation: 0 },
        selectedLayerKeys: ['99|0'],
        activeCell: null,
        layout: {
          root: 'TOP',
          hierarchy: {
            TOP: [{ name: 'CHILD', count: 1 }],
            CHILD: [],
          },
          elements: [
            {
              kind: 'polygon',
              layer: 7,
              datatype: 0,
              sourceCell: 'CHILD',
              points: [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
              ],
            },
          ],
        },
      },
    },
  ]);

  assert.deepEqual(result, { ok: true, completed: 1 });
  assert.equal(capturedAreas.length, 1);
  assert.equal(capturedAreas[0].mode, 'mask');
  assert.equal(capturedAreas[0].elements.length, 1);
  assert.deepEqual(capturedAreas[0].maskTransform, maskContext.transform);
});
