import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { installWebglFrameProbe } from '../../scripts/test-helpers/webgl-frame-probe.mjs';

function harness({ timer = false, disjoint = false, busy = false, priorDiscard = false } = {}) {
  const host = {
    dataset: {
      renderState: 'ready',
      sceneVariant: 'transparent',
      renderQuality: 'quality',
      rendererFrameSerial: '7',
    },
  };
  const raf = [],
    timers = [],
    calls = [];
  const extension = { TIME_ELAPSED_EXT: 10, GPU_DISJOINT_EXT: 11 };
  let discard = priorDiscard;
  const gl = {
    TRIANGLES: 4,
    RASTERIZER_DISCARD: 5,
    CURRENT_QUERY: 6,
    QUERY_RESULT_AVAILABLE: 7,
    QUERY_RESULT: 8,
    VENDOR: 12,
    RENDERER: 13,
    VERSION: 14,
    getExtension: (name) =>
      name === 'EXT_disjoint_timer_query_webgl2' && timer ? extension : null,
    getParameter: (key) => (key === extension.GPU_DISJOINT_EXT ? disjoint : 'mock'),
    getQuery: () => busy,
    getQueryParameter: (query, key) => (key === 7 ? true : 123000000),
    createQuery: () => ({}),
    beginQuery: () => calls.push('begin-query'),
    endQuery: () => calls.push('end-query'),
    deleteQuery: () => calls.push('delete-query'),
    isContextLost: () => false,
    getError: () => 0,
    isEnabled: () => discard,
    enable: () => {
      discard = true;
      calls.push('enable-discard');
    },
    disable: () => {
      discard = false;
      calls.push('disable-discard');
    },
    finish: () => calls.push('finish'),
  };
  for (const name of [
    'drawArrays',
    'drawElements',
    'drawArraysInstanced',
    'drawElementsInstanced',
  ]) {
    gl[name] = () => calls.push(`draw:${name}:${discard}`);
  }
  class Canvas {
    getContext() {
      return gl;
    }
    closest() {
      return host;
    }
  }
  let now = 0;
  const window = { requestAnimationFrame: (callback) => raf.push(callback) };
  runInNewContext(`(${installWebglFrameProbe.toString()})()`, {
    HTMLCanvasElement: Canvas,
    window,
    performance: { now: () => ++now },
    setTimeout: (callback) => timers.push(callback),
  });
  new Canvas().getContext('webgl2');
  const probe = window.__waferCadWebglProbe;
  return {
    gl,
    host,
    calls,
    probe,
    discard: () => discard,
    frame(callback) {
      window.requestAnimationFrame(callback);
      raf.shift()(0);
      while (timers.length) timers.shift()();
      return JSON.parse(JSON.stringify(probe.frames().at(-1) || null));
    },
  };
}

test('inactive probe preserves native draws and does not add a finish barrier', () => {
  const h = harness();
  assert.equal(
    h.frame(() => h.gl.drawArrays(4, 0, 6)),
    null,
  );
  assert.deepEqual(h.calls, ['draw:drawArrays:false']);
});

test('census honors actual indexed/instanced submissions, including second passes and line calls', () => {
  const h = harness();
  h.probe.arm({ rasterDiscard: false });
  const result = h.frame(() => {
    h.probe.owner({
      name: 'buried wall',
      userData: { waferCadPresentation: { kind: 'sidewall' } },
    });
    h.gl.drawElementsInstanced(4, 6, 0, 0, 625);
    h.gl.drawElementsInstanced(4, 6, 0, 0, 625);
    h.probe.owner({ name: 'cap', userData: { waferCadPresentation: { kind: 'cap' } } });
    h.gl.drawArraysInstanced(4, 0, 3, 625);
    h.gl.drawArrays(1, 0, 12);
  });
  assert.equal(result.drawCalls, 4);
  assert.equal(result.triangles, 3125);
  assert.deepEqual(
    result.owners.map((x) => [x.kind, x.triangles]),
    [
      ['sidewall', 2500],
      ['cap', 625],
    ],
  );
  assert.equal(result.timerStatus, 'unsupported');
  assert.equal(result.gpuMs, null);
  assert.equal(result.frameSerial, 7);
  assert.ok(result.completedDrawMs > 0);
});

test('diagnostic discard restores GL state before later normal draws', () => {
  const h = harness({ timer: true });
  h.probe.arm({ rasterDiscard: true });
  const result = h.frame(() => h.gl.drawArrays(4, 0, 6));
  assert.equal(result.timerStatus, 'valid');
  assert.equal(result.gpuMs, 123);
  assert.equal(h.discard(), false);
  assert.deepEqual(h.calls, [
    'begin-query',
    'enable-discard',
    'draw:drawArrays:true',
    'end-query',
    'finish',
    'disable-discard',
    'delete-query',
  ]);
  h.frame(() => h.gl.drawArrays(4, 0, 6));
  assert.equal(h.calls.at(-1), 'draw:drawArrays:false');
});

test('discard leaves an existing enabled rasterizer state intact', () => {
  const h = harness({ priorDiscard: true });
  h.probe.arm({ rasterDiscard: true });
  h.frame(() => h.gl.drawArrays(4, 0, 6));
  assert.equal(h.discard(), true);
  assert.equal(h.calls.includes('disable-discard'), false);
});

test('disjoint and busy timers cannot be interpreted as valid GPU timings', () => {
  for (const options of [
    { timer: true, disjoint: true },
    { timer: true, busy: true },
  ]) {
    const h = harness(options);
    h.probe.arm({ rasterDiscard: false });
    const result = h.frame(() => h.gl.drawArrays(4, 0, 6));
    assert.equal(result.timerStatus, options.disjoint ? 'disjoint' : 'busy');
    assert.equal(result.gpuMs, null);
    assert.equal(h.calls.filter((x) => x === 'delete-query').length, 1);
    if (options.busy) assert.equal(h.calls.includes('begin-query'), false);
  }
});

test('probe waits for a ready exact Quality transparent frame', () => {
  const h = harness();
  h.host.dataset.sceneVariant = 'opaque';
  h.probe.arm({ rasterDiscard: true });
  assert.equal(
    h.frame(() => h.gl.drawArrays(4, 0, 6)),
    null,
  );
  assert.throws(() => h.probe.arm({}), /already armed/);
  h.host.dataset.sceneVariant = 'transparent';
  assert.equal(h.frame(() => h.gl.drawArrays(4, 0, 6)).triangles, 2);
});
