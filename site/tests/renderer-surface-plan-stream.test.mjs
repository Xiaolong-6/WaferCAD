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
  assert.ok(packets.filter((packet) => packet.type === 'stream-items').length >= 2);
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

function giantPolygonSurfacePlan() {
  const plan = largeSurfacePlan();
  const ring = (count, radius) => {
    const points = Array.from({ length: count - 1 }, (_, index) => {
      const angle = (index * Math.PI * 2) / (count - 1);
      return [radius * Math.cos(angle) + 0.0000000004, radius * Math.sin(angle)];
    });
    return [...points, [...points[0]]];
  };
  plan.caps[0].polys = [[ring(9000, 20), ring(7000, 6)], plan.caps[0].polys[1]];
  return plan;
}

test('one oversized polygon streams in bounded exact point batches with a hole', () => {
  const plan = giantPolygonSurfacePlan();
  const packets = [...surfacePlanStreamPackets(plan)];
  assert.equal(shouldStreamSurfacePlan(plan), true);
  assert.ok(packets.some((packet) => packet.type === 'stream-big-poly-start'));
  assert.ok(packets.some((packet) => packet.type === 'stream-big-ring-points'));
  for (const packet of packets) {
    if (packet.type === 'stream-big-ring-points') {
      assert.ok(packet.points.length > 0 && packet.points.length <= 4096);
    }
    if (packet.type === 'stream-cap-polys') {
      const count = packet.polys.reduce(
        (sum, poly) => sum + poly.reduce((n, r) => n + r.length, 0),
        0,
      );
      assert.ok(count <= 4096, 'ordinary polygon packets stay under the same budget');
    }
  }
  const receiver = createSurfacePlanStreamReceiver();
  let result = null;
  for (const packet of packets) {
    const completed = receiver.accept(structuredClone(packet));
    if (completed) result = completed;
  }
  assert.deepEqual(result, plan);
  assert.equal(result.caps[0].polys[0][0].length, 9000);
  assert.equal(result.caps[0].polys[0][1].length, 7000);
  assert.equal(result.caps[0].polys[0][0][0][0], 20.0000000004);
  result.caps[0].polys[0][0][0][0] = 88;
  assert.equal(plan.caps[0].polys[0][0][0][0], 20.0000000004);
});

test('large polygon truncated, out-of-order or oversized packets fail closed', () => {
  const packets = [...surfacePlanStreamPackets(giantPolygonSurfacePlan())];
  const bigStartIndex = packets.findIndex((packet) => packet.type === 'stream-big-poly-start');
  const firstPointsIndex = packets.findIndex((packet) => packet.type === 'stream-big-ring-points');
  assert.ok(bigStartIndex > 0);
  assert.ok(firstPointsIndex > bigStartIndex);

  const fresh = () => {
    const receiver = createSurfacePlanStreamReceiver();
    for (const packet of packets.slice(0, firstPointsIndex)) {
      assert.equal(receiver.accept(structuredClone(packet)), null);
    }
    return receiver;
  };
  assert.throws(() => fresh().accept({ id: 1, type: 'stream-done' }), /Incomplete/);
  const firstPoints = packets[firstPointsIndex];
  assert.throws(
    () => fresh().accept({ ...structuredClone(firstPoints), startIndex: 5 }),
    /Out-of-order/,
  );
  assert.throws(
    () =>
      fresh().accept({
        ...structuredClone(firstPoints),
        points: Array.from({ length: 4097 }, () => [0, 0]),
      }),
    /Invalid large polygon point batch/,
  );
  const premature = fresh();
  premature.accept(structuredClone(firstPoints));
  assert.throws(
    () =>
      premature.accept({
        id: 1,
        type: 'stream-big-poly-done',
        capIndex: firstPoints.capIndex,
        polyIndex: firstPoints.polyIndex,
      }),
    /Incomplete/,
  );
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

test('optional worker sketch is delivered before exact ownership without caching it', async () => {
  const original = globalThis.Worker;
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 2 });
  model.layers.push(...Array.from({ length: 5 }, (_, i) => ({ id: `preview-${i}` })));
  let worker;
  let requested;
  globalThis.Worker = class {
    constructor() {
      worker = this;
    }
    postMessage(data) {
      requested = data;
    }
    terminate() {
      this.terminated = true;
    }
  };
  try {
    const sketch = {
      kind: 'approximate-caps-preview',
      caps: [],
      borderPositions: new Float32Array(0),
      lineCount: 0,
    };
    const exact = largeSurfacePlan();
    const published = [];
    const pending = buildRenderSurfacePlanAsync(model, null, {
      onPreview: (preview) => published.push(preview),
    });
    assert.equal(requested.preview, true);
    worker.onmessage({ data: { id: 1, type: 'preview', preview: sketch } });
    assert.deepEqual(published, [sketch]);
    assert.equal(cachedRenderSurfacePlan(model), null);
    worker.onmessage({ data: { id: 1, type: 'done', plan: exact } });
    assert.deepEqual(await pending, exact);
    assert.equal(worker.terminated, true);
    assert.deepEqual(cachedRenderSurfacePlan(model), exact);

    const fresh = createModel({ shape: 'rect', width: 21, height: 21, thickness: 2 });
    fresh.layers.push(...Array.from({ length: 5 }, (_, i) => ({ id: `cancel-${i}` })));
    const controller = new AbortController();
    let lateSketchCount = 0;
    const cancelled = buildRenderSurfacePlanAsync(fresh, null, {
      signal: controller.signal,
      onPreview: () => lateSketchCount++,
    });
    controller.abort();
    await assert.rejects(cancelled, { name: 'AbortError' });
    worker.onmessage({ data: { id: 1, type: 'preview', preview: sketch } });
    worker.onmessage({ data: { id: 1, type: 'done', plan: exact } });
    assert.equal(lateSketchCount, 0);
    assert.equal(cachedRenderSurfacePlan(fresh), null);
  } finally {
    globalThis.Worker = original;
  }
});

test('many small rings in one cap are transported in bounded batches, not one task per ring', () => {
  const plan = giantPolygonSurfacePlan();
  const smallRing = (n) => [
    [n, 0],
    [n + 0.1, 0],
    [n, 0.1],
    [n, 0],
  ];
  plan.caps[0].polys[0] = [
    plan.caps[0].polys[0][0],
    ...Array.from({ length: 12000 }, (_, n) => smallRing(n)),
  ];
  const packets = [...surfacePlanStreamPackets(plan)];
  const batched = packets.filter((packet) => packet.type === 'stream-big-rings');
  assert.ok(batched.length > 1 && batched.length < 25);
  assert.ok(
    batched.every((packet) => packet.rings.reduce((sum, ring) => sum + ring.length, 0) <= 4096),
  );
  assert.ok(packets.length < 140, 'Small rings must not create tens of thousands of messages');
  const receiver = createSurfacePlanStreamReceiver();
  let restored;
  for (const packet of packets) restored = receiver.accept(structuredClone(packet)) || restored;
  assert.deepEqual(restored, plan);
  const firstBatch = batched[0];
  const prefix = packets.slice(0, packets.indexOf(firstBatch));
  const fresh = () => {
    const rx = createSurfacePlanStreamReceiver();
    for (const packet of prefix) rx.accept(structuredClone(packet));
    return rx;
  };
  assert.throws(
    () => fresh().accept({ ...firstBatch, startRingIndex: firstBatch.startRingIndex + 1 }),
    /Invalid large polygon ring batch/,
  );
  assert.throws(
    () => fresh().accept({ ...firstBatch, rings: [Array.from({ length: 4097 }, () => [0, 0])] }),
    /Invalid large polygon ring batch/,
  );
  const premature = fresh();
  premature.accept(structuredClone(firstBatch));
  assert.throws(
    () =>
      premature.accept({
        id: 1,
        type: 'stream-big-poly-done',
        capIndex: firstBatch.capIndex,
        polyIndex: firstBatch.polyIndex,
      }),
    /Incomplete/,
  );
});
