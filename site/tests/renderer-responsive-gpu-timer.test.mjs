import assert from 'node:assert/strict';
import test from 'node:test';
import { createRendererGpuTimer } from '../renderer-responsive-gpu-timer.js';

function fakeGpu({ supported = true } = {}) {
  const ext = { TIME_ELAPSED_EXT: 35007, GPU_DISJOINT_EXT: 36795 };
  const queries = [];
  const deleted = [];
  let disjoint = false;
  let opened = null;
  const gl = {
    QUERY_RESULT_AVAILABLE: 34919,
    QUERY_RESULT: 34918,
    createQuery() {
      const q = { available: false, ns: 0 };
      queries.push(q);
      return q;
    },
    beginQuery(target, q) {
      assert.equal(target, ext.TIME_ELAPSED_EXT);
      assert.equal(opened, null);
      opened = q;
    },
    endQuery(target) {
      assert.equal(target, ext.TIME_ELAPSED_EXT);
      opened = null;
    },
    getQueryParameter(q, param) {
      return param === gl.QUERY_RESULT_AVAILABLE ? q.available : q.ns;
    },
    getParameter(param) {
      assert.equal(param, ext.GPU_DISJOINT_EXT);
      return disjoint;
    },
    getExtension() {
      return supported ? ext : null;
    },
    deleteQuery(q) {
      deleted.push(q);
    },
  };
  return { gl, queries, deleted, setDisjoint(value) { disjoint = value; } };
}

test('GPU timer never synchronously waits for GPU; polls available results', () => {
  const g = fakeGpu();
  let clock = 0;
  const ticks = [];
  const timer = createRendererGpuTimer(g.gl, {
    now: () => clock,
    schedule: (fn) => { ticks.push(fn); return ticks.length; },
    cancel: () => {},
    sampleIntervalMs: 100,
  });
  assert.equal(timer.supported, true);
  assert.equal(timer.beginFrame(), true);
  assert.equal(timer.endFrame(), true);
  assert.equal(timer.beginFrame(), false, 'bounded sampling interval');
  clock = 120;
  assert.equal(timer.beginFrame(), true);
  assert.equal(timer.endFrame(), true);
  g.queries[0].ns = 24_500_000;
  g.queries[0].available = true;
  ticks.shift()();
  assert.deepEqual(timer.snapshot(), {
    supported: true, samples: 1, pending: 1, p95Ms: 24.5,
    maxMs: 24.5, dropped: 0, disjointCount: 0,
  });
  g.queries[1].ns = 2_000_000;
  g.queries[1].available = true;
  ticks.shift()();
  assert.equal(timer.snapshot().samples, 2);
  assert.equal(timer.snapshot().p95Ms, 24.5);
  timer.dispose();
  assert.equal(g.deleted.length, 2);
});

test('disjoint GPU results are discarded; unsupported WebGL is a no-op', () => {
  const g = fakeGpu();
  const ticks = [];
  const timer = createRendererGpuTimer(g.gl, {
    now: () => 1000,
    schedule: (fn) => { ticks.push(fn); return ticks.length; },
    cancel: () => {},
  });
  timer.beginFrame();
  timer.endFrame();
  g.setDisjoint(true);
  ticks.shift()();
  assert.equal(timer.snapshot().samples, 0);
  assert.equal(timer.snapshot().disjointCount, 1);
  assert.equal(timer.snapshot().dropped, 1);
  timer.dispose({ contextLost: true });
  const unsupported = createRendererGpuTimer(fakeGpu({ supported: false }).gl);
  assert.equal(unsupported.supported, false);
  assert.equal(unsupported.beginFrame(), false);
  assert.equal(unsupported.endFrame(), false);
  unsupported.dispose();
});

test('sampling is bounded; invalid settings fail closed', () => {
  const g = fakeGpu();
  let clock = 0;
  const timer = createRendererGpuTimer(g.gl, {
    now: () => clock,
    maxPending: 1,
    sampleIntervalMs: 1,
    schedule: () => 1,
    cancel: () => {},
  });
  timer.beginFrame();
  timer.endFrame();
  clock = 2;
  assert.equal(timer.beginFrame(), false);
  assert.equal(timer.snapshot().dropped, 1);
  timer.dispose();
  assert.throws(() => createRendererGpuTimer(g.gl, { pollIntervalMs: 0 }), RangeError);
});
