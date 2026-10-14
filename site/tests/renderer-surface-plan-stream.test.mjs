import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSurfacePlanStreamReceiver,
  shouldStreamSurfacePlan,
  surfacePlanStreamPackets,
} from '../renderer-surface-plan-stream.js';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { buildRenderSurfacePlan, cachedRenderSurfacePlan } = await import('../renderer-geometry.js');
const { buildRenderSurfacePlanAsync } = await import('../renderer-surface-plan-async.js');

function largeSurfacePlan() {
  const poly = (index) => [
    [
      [index + 0.000000001, 0.1],
      [index + 0.6, 0.1],
      [index + 0.6, 0.7],
      [index + 0.000000001, 0.1],
    ],
  ];
  return {
    caps: Array.from({ length: 28 }, (_, index) => ({
      layerId: 'L-1',
      z: 0.0000000004,
      polys: Array.from({ length: 24 }, (_, n) => poly(index * 24 + n)),
      appearance: null,
      sidewallBoundaryIntervals: [],
    })),
    sidewalls: Array.from({ length: 140 }, (_, index) => ({
      p: [index * 0.0000001, 0],
      q: [index * 0.0000001, 1],
      z0: 0.001,
      z1: 0.002,
      layerId: 'L-1',
    })),
    borderLines: Array.from({ length: 310 }, (_, index) => [
      [index / 13, 0, 1],
      [index / 13, 1, 1],
    ]),
    annotation: { revision: 19, exportOnly: false },
  };
}

test('bounded stream reproduces every physical coordinate and owner unchanged', () => {
  const plan = largeSurfacePlan();
  assert.equal(shouldStreamSurfacePlan(plan), true);
  const packets = [...surfacePlanStreamPackets(plan)];
  assert.ok(packets.length > 16, 'Dense ownership is split into separate browser tasks');
  assert.ok(packets.filter((packet) => packet.type === 'stream-items').length > 3);
  const receiver = createSurfacePlanStreamReceiver();
  let completed = null;
  for (const packet of packets) {
    const result = receiver.accept(structuredClone(packet));
    if (result) completed = result;
    else assert.notEqual(packet.type, 'stream-done');
  }
  assert.deepEqual(completed, plan);
  assert.notStrictEqual(completed.caps[0].polys[0], plan.caps[0].polys[0]);
  assert.equal(completed.caps[0].z, 0.0000000004);
  assert.equal(completed.caps[0].polys[0][0][0][0], 0.000000001);
});

test('incomplete/out-of-order packets cannot publish a surface plan', () => {
  const messages = [...surfacePlanStreamPackets(largeSurfacePlan())];
  const receiver = createSurfacePlanStreamReceiver();
  receiver.accept(structuredClone(messages[0]));
  assert.throws(() => receiver.accept({ id: 1, type: 'stream-done' }), /Incomplete/);
  const second = createSurfacePlanStreamReceiver();
  assert.throws(() => second.accept(messages[1]), /without stream header/);
  second.accept(structuredClone(messages[0]));
  assert.throws(
    () =>
      second.accept({ id: 1, type: 'stream-items', key: 'sidewalls', startIndex: 2, items: [{}] }),
    /Out-of-order/,
  );
});

test('real Kernel surface plan survives transport with identical scientific topology', () => {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 2 });
  const plan = buildRenderSurfacePlan(model);
  const receiver = createSurfacePlanStreamReceiver();
  let restored;
  for (const packet of surfacePlanStreamPackets(plan)) {
    restored = receiver.accept(structuredClone(packet)) || restored;
  }
  assert.deepEqual(restored, plan);
});

test('worker chunks only publish to the cache at complete stream-done', async () => {
  const original = globalThis.Worker;
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 2 });
  model.layers.push(...Array.from({ length: 5 }, (_, i) => ({ id: `ghost-${i}` })));
  let worker;
  globalThis.Worker = class {
    constructor() {
      worker = this;
    }
    postMessage() {}
    terminate() {
      this.terminated = true;
    }
  };
  try {
    const expected = largeSurfacePlan();
    const frames = [...surfacePlanStreamPackets(expected)];
    const pending = buildRenderSurfacePlanAsync(model);
    for (const packet of frames.slice(0, -1)) {
      worker.onmessage({ data: structuredClone(packet) });
      assert.equal(cachedRenderSurfacePlan(model), null);
    }
    worker.onmessage({ data: frames.at(-1) });
    assert.deepEqual(await pending, expected);
    assert.equal(worker.terminated, true);
    assert.deepEqual(cachedRenderSurfacePlan(model), expected);

    model.layers[0].visible = false;
    const abort = new AbortController();
    const cancelled = buildRenderSurfacePlanAsync(model, null, { signal: abort.signal });
    worker.onmessage({ data: structuredClone(frames[0]) });
    abort.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    worker.onmessage({ data: structuredClone(frames.at(-1)) });
    assert.equal(cachedRenderSurfacePlan(model), null, 'Late stream finalization cannot write');
  } finally {
    globalThis.Worker = original;
  }
});
