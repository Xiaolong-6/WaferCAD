import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { buildRenderSurfacePlan, cachedRenderSurfacePlan } = await import('../renderer-geometry.js');
const { buildRenderSurfacePlanAsync, shouldBuildSurfacePlanInWorker } =
  await import('../renderer-surface-plan-async.js');

test('without a browser Worker, the async renderer returns the identical canonical surface plan', async () => {
  const original = globalThis.Worker;
  globalThis.Worker = undefined;
  try {
    const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 2 });
    const expected = buildRenderSurfacePlan(model);
    assert.strictEqual(await buildRenderSurfacePlanAsync(model), expected);
    assert.equal(shouldBuildSurfacePlanInWorker(model), false);
  } finally {
    globalThis.Worker = original;
  }
});

test('large scenes use a disposable worker and cache the exact completed result', async () => {
  const original = globalThis.Worker;
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 2 });
  model.layers.push(
    ...Array.from({ length: 5 }, (_, i) => ({
      id: `ghost-${i}`,
      name: 'No region',
      color: '#000000',
    })),
  );
  let instance;
  globalThis.Worker = class {
    constructor(url) {
      this.url = url;
      instance = this;
    }
    postMessage(value) {
      this.request = structuredClone(value);
    }
    terminate() {
      this.terminated = true;
    }
  };
  try {
    assert.equal(shouldBuildSurfacePlanInWorker(model), true);
    const pending = buildRenderSurfacePlanAsync(model);
    assert.match(instance.url.pathname, /renderer-surface-plan-worker\.js$/);
    assert.equal(instance.request.action, 'surface-plan');
    assert.equal(instance.request.model.layers.length, 6);
    instance.onmessage({ data: { id: 90, type: 'done', plan: {} } });
    assert.equal(instance.terminated, undefined);
    const result = { caps: [{ layerId: 'material-1' }], sidewalls: [], borders: [] };
    instance.onmessage({ data: { id: 1, type: 'done', plan: result } });
    assert.strictEqual(await pending, result);
    assert.strictEqual(cachedRenderSurfacePlan(model), result);
    assert.equal(instance.terminated, true);
    assert.strictEqual(await buildRenderSurfacePlanAsync(model), result);

    model.layers[0].visible = false;
    assert.equal(cachedRenderSurfacePlan(model), null, 'Visibility invalidates ownership cache');
    const changed = buildRenderSurfacePlanAsync(model);
    instance.onmessage({ data: { id: 1, type: 'error', message: 'boolean failed' } });
    await assert.rejects(changed, /boolean failed/);
    assert.equal(instance.terminated, true);

    for (const fail of [
      () => instance.onerror({ message: 'worker crashed' }),
      () => instance.onmessageerror(),
    ]) {
      const request = buildRenderSurfacePlanAsync(model);
      fail();
      await assert.rejects(request);
      assert.equal(instance.terminated, true);
    }
    const controller = new AbortController();
    const aborted = buildRenderSurfacePlanAsync(model, null, { signal: controller.signal });
    controller.abort();
    await assert.rejects(aborted, { name: 'AbortError' });
    assert.equal(instance.terminated, true);
    assert.equal(cachedRenderSurfacePlan(model), null);
    instance.onmessage({ data: { id: 1, type: 'done', plan: { caps: [], sidewalls: [] } } });
    assert.equal(
      cachedRenderSurfacePlan(model),
      null,
      'A late worker reply cannot commit stale geometry',
    );

    globalThis.Worker.prototype.postMessage = () => {
      throw new Error('DataCloneError');
    };
    await assert.rejects(buildRenderSurfacePlanAsync(model), /DataCloneError/);
    assert.equal(instance.terminated, true);
  } finally {
    globalThis.Worker = original;
  }
});

test('ROI suppresses sketch requests, and Abort rejects late exact Worker replies', async () => {
  const original = globalThis.Worker;
  const model = createModel({ shape: 'rect', width: 22, height: 20, thickness: 2 });
  model.layers.push(...Array.from({ length: 5 }, (_, i) => ({ id: `roi-${i}` })));
  const clip = [
    [
      [
        [-3, -2],
        [3, -2],
        [3, 2],
        [-3, 2],
        [-3, -2],
      ],
    ],
  ];
  let worker;
  globalThis.Worker = class {
    constructor() {
      worker = this;
    }
    postMessage(request) {
      this.request = structuredClone(request);
    }
    terminate() {
      this.terminated = true;
    }
  };
  try {
    const controller = new AbortController();
    const pending = buildRenderSurfacePlanAsync(model, clip, { signal: controller.signal });
    assert.equal(worker.request.preview, false, 'ROI cannot request an uncut sketch');
    assert.deepEqual(worker.request.clip, clip, 'Worker preserves the physical ROI');
    worker.onmessage({
      data: { id: 1, type: 'preview', preview: { kind: 'approximate-caps-preview' } },
    });
    assert.equal(cachedRenderSurfacePlan(model, clip), null);
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(worker.terminated, true);
    worker.onmessage({ data: { id: 1, type: 'done', plan: { caps: [], sidewalls: [] } } });
    assert.equal(cachedRenderSurfacePlan(model, clip), null, 'Abort discards stale ROI geometry');
  } finally {
    globalThis.Worker = original;
  }
});

test('exact Worker failure after a displayed sketch never commits the sketch or a late plan', async () => {
  const original = globalThis.Worker;
  const model = createModel({ shape: 'rect', width: 23, height: 20, thickness: 2 });
  model.layers.push(...Array.from({ length: 5 }, (_, i) => ({ id: `failed-${i}` })));
  let worker;
  globalThis.Worker = class {
    constructor() {
      worker = this;
    }
    postMessage(request) {
      this.request = request;
    }
    terminate() {
      this.terminated = true;
    }
  };
  try {
    let visible = 0;
    const sketch = {
      kind: 'approximate-caps-preview',
      caps: [],
      borderPositions: new Float32Array(),
    };
    const pending = buildRenderSurfacePlanAsync(model, null, { onPreview: () => visible++ });
    assert.equal(worker.request.preview, true);
    worker.onmessage({ data: { id: 1, type: 'preview', preview: sketch } });
    assert.equal(visible, 1);
    assert.equal(cachedRenderSurfacePlan(model), null, 'Sketch cannot populate the exact cache');
    worker.onmessage({ data: { id: 1, type: 'error', message: 'Injected ownership failure' } });
    await assert.rejects(pending, /Injected ownership failure/);
    assert.equal(worker.terminated, true);
    worker.onmessage({ data: { id: 1, type: 'done', plan: { caps: [], sidewalls: [] } } });
    assert.equal(
      cachedRenderSurfacePlan(model),
      null,
      'Late completion cannot resurrect a failure',
    );
  } finally {
    globalThis.Worker = original;
  }
});
