import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSurfacePlanAssembler,
  sendSurfacePlanChunks,
} from '../renderer-surface-plan-stream.js';
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

test('chunked worker transport preserves every cap, wall, and metadata field in original order', () => {
  const plan = {
    caps: Array.from({ length: 31 }, (_, i) => ({ id: i, polys: [[[i, i + 0.1]]] })),
    sidewalls: Array.from({ length: 23 }, (_, i) => ({ id: i, z0: i / 7 })),
    arrayInstances: 24,
    arrayNeighborhoods: 7,
    reserved: { owner: 'science', boundaries: [1, 2, 3] },
  };
  const messages = [];
  sendSurfacePlanChunks(plan, (message) => messages.push(structuredClone(message)), 5);
  assert.ok(messages.length > 10, 'Large payload arrives as independent tasks');
  const assembler = createSurfacePlanAssembler();
  let resolved = null;
  for (const message of messages) {
    const result = assembler.accept(message);
    if (result) resolved = result;
  }
  assert.deepEqual(resolved, plan);
  assert.notStrictEqual(resolved.caps, plan.caps);
  assert.equal(messages[0].type, 'start');
  assert.equal(messages.at(-1).type, 'done');
});

test('surface plan receiver rejects missing and out-of-order chunks rather than caching partial topology', () => {
  const packets = [];
  sendSurfacePlanChunks(
    { caps: [{ id: 1 }, { id: 2 }], sidewalls: [{ id: 3 }], arrayInstances: 0 },
    (packet) => packets.push(packet),
    1,
  );
  const first = createSurfacePlanAssembler();
  first.accept(packets[0]);
  assert.throws(() => first.accept(packets[2]), /order or count/);
  const second = createSurfacePlanAssembler();
  second.accept(packets[0]);
  second.accept(packets[1]);
  assert.throws(() => second.accept(packets.at(-1)), /Incomplete/);
  const empty = [];
  sendSurfacePlanChunks({ caps: [], sidewalls: [], arrayInstances: 0 }, (part) => empty.push(part));
  const third = createSurfacePlanAssembler();
  third.accept(empty[0]);
  assert.deepEqual(third.accept(empty[1]), { caps: [], sidewalls: [], arrayInstances: 0 });
});
