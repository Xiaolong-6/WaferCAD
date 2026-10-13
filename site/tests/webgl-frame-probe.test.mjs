import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { installWebglFrameProbe } from '../../scripts/test-helpers/webgl-frame-probe.mjs';
import { validRendererRasterState } from '../../scripts/test-helpers/renderer-v3-raster-state.mjs';

function harness({
  timer = false,
  disjoint = false,
  busy = false,
  priorDiscard = false,
  forceDitherOff = false,
  forceMsaaOff = false,
  forcePreservedMsaa = false,
  throwOnDraw = false,
} = {}) {
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
  let dither = true;
  let contextOptions = null;
  const gl = {
    TRIANGLES: 4,
    RASTERIZER_DISCARD: 5,
    DITHER: 18,
    SAMPLES: 19,
    CURRENT_QUERY: 6,
    QUERY_RESULT_AVAILABLE: 7,
    QUERY_RESULT: 8,
    VENDOR: 12,
    RENDERER: 13,
    VERSION: 14,
    NO_ERROR: 0,
    RGBA: 15,
    UNSIGNED_BYTE: 16,
    drawingBufferWidth: 531,
    drawingBufferHeight: 275,
    readPixels: (x, y, width, height, format, type, out) => {
      assert.ok(Number.isInteger(width) && width >= 1);
      assert.ok(Number.isInteger(height) && height >= 1);
      assert.equal(format, 15);
      assert.equal(type, 16);
      calls.push(`read:${x}:${y}`);
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          out.set([(x + col) & 255, (y + row) & 255, 7, 255], (row * width + col) * 4);
        }
      }
    },
    getExtension: (name) =>
      name === 'EXT_disjoint_timer_query_webgl2' && timer ? extension : null,
    getParameter: (key) =>
      key === 19 ? (forceMsaaOff ? 0 : 4) : key === extension.GPU_DISJOINT_EXT ? disjoint : 'mock',
    getContextAttributes: () => ({
      antialias: contextOptions?.antialias ?? true,
      preserveDrawingBuffer: contextOptions?.preserveDrawingBuffer ?? false,
    }),
    getQuery: () => busy,
    getQueryParameter: (query, key) => (key === 7 ? true : 123000000),
    createQuery: () => ({}),
    beginQuery: () => calls.push('begin-query'),
    endQuery: () => calls.push('end-query'),
    deleteQuery: () => calls.push('delete-query'),
    isContextLost: () => false,
    getError: () => 0,
    isEnabled: (cap) => (cap === 18 ? dither : discard),
    enable: (cap) => {
      if (cap === 18) {
        dither = true;
        calls.push('enable-dither');
      } else {
        discard = true;
        calls.push('enable-discard');
      }
    },
    disable: (cap) => {
      if (cap === 18) {
        dither = false;
        calls.push('disable-dither');
      } else {
        discard = false;
        calls.push('disable-discard');
      }
    },
    finish: () => calls.push('finish'),
  };
  for (const name of [
    'drawArrays',
    'drawElements',
    'drawArraysInstanced',
    'drawElementsInstanced',
  ]) {
    gl[name] = () => {
      calls.push(`draw:${name}:${discard}:${dither}`);
      if (throwOnDraw && name === 'drawArrays') throw new Error('diagnostic draw exception');
    };
  }
  class Canvas {
    getContext(_type, options) {
      contextOptions = options || {};
      return gl;
    }
    closest() {
      return host;
    }
  }
  let now = 0;
  const window = {
    requestAnimationFrame: (callback) => raf.push(callback),
    __waferCadDitherProbeForceOff: forceDitherOff,
    __waferCadMsaaProbeForceOff: forceMsaaOff,
    __waferCadPreservedMsaaProbeForceOn: forcePreservedMsaa,
  };
  runInNewContext(`(${installWebglFrameProbe.toString()})()`, {
    HTMLCanvasElement: Canvas,
    window,
    performance: { now: () => ++now },
    setTimeout: (callback) => timers.push(callback),
  });
  new Canvas().getContext('webgl2', { antialias: true, alpha: true });
  const probe = window.__waferCadWebglProbe;
  return {
    gl,
    host,
    calls,
    probe,
    discard: () => discard,
    dither: () => dither,
    contextOptions: () => contextOptions,
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
  assert.deepEqual(h.calls, ['draw:drawArrays:false:true']);
});

test('MSAA isolation changes only WebGL context creation and reports actual samples', () => {
  const noMsaa = harness({ forceMsaaOff: true });
  assert.equal(noMsaa.contextOptions().antialias, false);
  assert.equal(noMsaa.contextOptions().alpha, true);
  noMsaa.probe.arm({ captureGlState: true, captureFramebuffer: true });
  const measured = noMsaa.frame(() => noMsaa.gl.drawArrays(4, 0, 6));
  assert.equal(measured.contextAntialias, false);
  assert.equal(measured.defaultFramebufferSamples, 0);
  assert.equal(measured.forcedDitherDisabledDraws, 0);
  assert.equal(noMsaa.dither(), true);

  const standard = harness();
  assert.equal(standard.contextOptions().antialias, true);
  standard.probe.arm({ captureFramebuffer: true });
  const defaultFrame = standard.frame(() => standard.gl.drawArrays(4, 0, 6));
  assert.equal(defaultFrame.contextAntialias, true);
  assert.equal(defaultFrame.defaultFramebufferSamples, 4);
});

test('preserved-MSAA probe changes only fresh context attributes, not standard GL draws', () => {
  const h = harness({ forcePreservedMsaa: true });
  assert.equal(h.contextOptions().antialias, true);
  assert.equal(h.contextOptions().preserveDrawingBuffer, true);
  assert.deepEqual(h.calls, []);
  h.probe.arm({ captureFramebuffer: true });
  const sample = h.frame(() => h.gl.drawArrays(4, 0, 6));
  assert.equal(sample.contextAntialias, true);
  assert.equal(sample.contextPreserveDrawingBuffer, true);
  assert.equal(sample.defaultFramebufferSamples, 4);
  assert.equal(sample.forcedDitherDisabledDraws, 0);

  const baseline = harness();
  assert.equal(baseline.contextOptions().preserveDrawingBuffer, undefined);
  baseline.probe.arm({ captureFramebuffer: true });
  const regular = baseline.frame(() => baseline.gl.drawArrays(4, 0, 6));
  assert.equal(regular.contextPreserveDrawingBuffer, false);
  assert.equal(regular.defaultFramebufferSamples, 4);
  assert.deepEqual(
    h.calls.filter((call) => call.startsWith('draw:')),
    baseline.calls.filter((call) => call.startsWith('draw:')),
  );
});

test('diagnostic-only dither isolation wraps draws and restores GL state on error', () => {
  const off = harness({ forceDitherOff: true });
  off.frame(() => off.gl.drawArrays(4, 0, 6));
  assert.deepEqual(off.calls, ['disable-dither', 'draw:drawArrays:false:false', 'enable-dither']);
  assert.equal(off.dither(), true);
  const sampled = harness({ forceDitherOff: true });
  sampled.probe.arm({ captureFramebuffer: true });
  const measured = sampled.frame(() => sampled.gl.drawArrays(4, 0, 6));
  assert.equal(measured.forcedDitherDisabledDraws, 1);
  assert.equal(sampled.dither(), true);
  const normal = harness();
  normal.frame(() => normal.gl.drawArrays(4, 0, 6));
  assert.deepEqual(normal.calls, ['draw:drawArrays:false:true']);
  assert.equal(normal.dither(), true);
  const exceptional = harness({ forceDitherOff: true, throwOnDraw: true });
  assert.throws(() => exceptional.gl.drawArrays(4, 0, 6), /diagnostic draw exception/);
  assert.deepEqual(exceptional.calls, [
    'disable-dither',
    'draw:drawArrays:false:false',
    'enable-dither',
  ]);
  assert.equal(exceptional.dither(), true);
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

test('opt-in WebGL readback samples the completed frame, with vertical flip', () => {
  const h = harness();
  h.probe.arm({
    rasterDiscard: false,
    captureGlState: true,
    pixelSamples: [
      { x: 301, y: 138 },
      { x: 301, y: 139 },
    ],
  });
  const frame = h.frame(() => {
    h.probe.owner({
      name: 'electrical cap',
      userData: { waferCadPresentation: { kind: 'electrical-surface' } },
    });
    h.gl.drawArrays(4, 0, 6);
  });
  assert.deepEqual(
    Array.from(frame.pixelSamples, (sample) => [sample.x, sample.y, sample.rgba]),
    [
      [301, 138, [45, 136, 7, 255]],
      [301, 139, [45, 135, 7, 255]],
    ],
  );
  assert.equal(
    frame.pixelSamples.every((sample) => sample.status === 'valid'),
    true,
  );
  assert.equal(frame.glState.firstElectricalState.blend, false);
  assert.ok(h.calls.indexOf('finish') < h.calls.indexOf('read:301:136'));
  assert.equal(h.calls.includes('read:301:135'), true);
});

test('readback maps screenshot centers to a fractional-DPR GL backing size', () => {
  const h = harness();
  h.gl.drawingBufferWidth = 530;
  h.gl.drawingBufferHeight = 274;
  h.probe.arm({
    pixelSamples: [{ x: 301, y: 138, sourceWidth: 531, sourceHeight: 275 }],
  });
  const result = h.frame(() => h.gl.drawArrays(4, 0, 6));
  const sample = result.pixelSamples[0];
  assert.equal(sample.status, 'valid');
  assert.equal(sample.displayWidth, 531);
  assert.equal(sample.displayHeight, 275);
  assert.equal(sample.width, 530);
  assert.equal(sample.height, 274);
  assert.equal(sample.readX, 300);
  assert.equal(sample.readY, 137);
  assert.deepEqual(sample.rgba, [44, 136, 7, 255]);
  assert.ok(h.calls.includes('read:300:136'));
});

test('bounded framebuffer capture is available only when explicitly requested', () => {
  const h = harness();
  h.gl.drawingBufferWidth = 2;
  h.gl.drawingBufferHeight = 2;
  h.probe.arm({ rasterDiscard: false, captureFramebuffer: true });
  const frame = h.frame(() => h.gl.drawArrays(4, 0, 6));
  assert.equal(frame.framebuffer.status, 'valid');
  assert.equal(frame.framebuffer.width, 2);
  assert.equal(frame.framebuffer.height, 2);
  // harness.frame() JSON-clones the result, intentionally dropping the
  // non-enumerable raw buffer. Inspect the original probe-owned frame here.
  const original = h.probe.frames().at(-1);
  assert.equal(original.framebufferRgba.length, 16);
  assert.equal(Object.keys(original).includes('framebufferRgba'), false);
  assert.equal(frame.framebufferRgba, undefined);
  assert.ok(h.calls.includes('read:0:0'));
  const capturedCount = h.probe.frames().length;
  h.frame(() => h.gl.drawArrays(4, 0, 6));
  assert.equal(h.probe.frames().length, capturedCount, 'one-shot probe must not recapture');
});

test('invalid or excessive WebGL readback coordinates fail before arming', () => {
  const h = harness();
  assert.throws(() => h.probe.arm({ pixelSamples: [{ x: 0.5, y: 0 }] }), /Invalid bounded/);
  assert.throws(
    () => h.probe.arm({ pixelSamples: Array.from({ length: 17 }, () => ({ x: 0, y: 0 })) }),
    /Invalid bounded/,
  );
  h.probe.arm({ rasterDiscard: false });
  const frame = h.frame(() => h.gl.drawArrays(4, 0, 6));
  assert.equal(frame.pixelSamples, undefined);
  assert.equal(
    h.calls.some((call) => call.startsWith('read:')),
    false,
  );
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
    'draw:drawArrays:true:true',
    'end-query',
    'finish',
    'disable-discard',
    'delete-query',
  ]);
  h.frame(() => h.gl.drawArrays(4, 0, 6));
  assert.equal(h.calls.at(-1), 'draw:drawArrays:false:true');
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

test('reference axes are attributed separately, without concealing unknown material objects', () => {
  const h = harness();
  h.probe.arm({ rasterDiscard: false });
  const result = h.frame(() => {
    h.probe.owner({ type: 'AxesHelper', isLineSegments: true });
    h.gl.drawArrays(1, 0, 6);
    h.probe.owner({ type: 'Mesh' });
    h.gl.drawArrays(4, 0, 3);
  });
  assert.equal(result.drawCalls, 2);
  assert.deepEqual(
    result.owners.map((row) => [row.kind, row.triangles]),
    [
      ['untracked', 1],
      ['reference-axes', 0],
    ],
  );
});

test('opt-in raster census records comparable WebGL2 state at bounded draw milestones', () => {
  const h = harness();
  const values = {
    VIEWPORT: [0, 0, 531, 275],
    SCISSOR_BOX: [0, 0, 531, 275],
    BLEND_COLOR: [0, 0, 0, 0],
    COLOR_WRITEMASK: [true, true, true, true],
    DEPTH_RANGE: [0, 1],
  };
  const booleanValues = new Set(['DEPTH_WRITEMASK', 'SAMPLE_COVERAGE_INVERT']);
  const enumerations = [
    'VIEWPORT',
    'SCISSOR_BOX',
    'BLEND_SRC_RGB',
    'BLEND_DST_RGB',
    'BLEND_SRC_ALPHA',
    'BLEND_DST_ALPHA',
    'BLEND_EQUATION_RGB',
    'BLEND_EQUATION_ALPHA',
    'BLEND_COLOR',
    'COLOR_WRITEMASK',
    'DEPTH_WRITEMASK',
    'DEPTH_FUNC',
    'DEPTH_RANGE',
    'CULL_FACE_MODE',
    'FRONT_FACE',
    'POLYGON_OFFSET_FACTOR',
    'POLYGON_OFFSET_UNITS',
    'SAMPLE_COVERAGE_VALUE',
    'SAMPLE_COVERAGE_INVERT',
    'FRAMEBUFFER_BINDING',
  ];
  const readings = new Map();
  enumerations.forEach((name, index) => {
    h.gl[name] = index + 70;
    readings.set(
      index + 70,
      name === 'FRAMEBUFFER_BINDING'
        ? null
        : Object.hasOwn(values, name)
          ? name === 'COLOR_WRITEMASK'
            ? values[name]
            : new Float32Array(values[name])
          : booleanValues.has(name)
            ? true
            : 1,
    );
  });
  const originalGet = h.gl.getParameter;
  h.gl.getParameter = (key) => (readings.has(key) ? readings.get(key) : originalGet(key));
  h.probe.arm({
    capturePhases: true,
    captureRasterState: true,
    capturePhaseDraws: [1],
  });
  const frame = h.frame(() => h.gl.drawArrays(h.gl.TRIANGLES, 0, 6));
  assert.deepEqual(
    frame.phases.map((phase) => phase.afterDraw),
    [1, 1],
  );
  assert.ok(frame.phases.every((phase) => validRendererRasterState(phase.rasterState)));
  assert.deepEqual(Array.from(frame.phases[0].rasterState.viewport), [0, 0, 531, 275]);
  assert.equal(frame.phases[0].rasterState.samples, 4);
  assert.equal(frame.phases[0].rasterState.depthMask, true);
  assert.equal(frame.phases[0].rasterState.dither, true);
  const unused = harness();
  unused.probe.arm({ capturePhases: true, capturePhaseDraws: [1] });
  const normal = unused.frame(() => unused.gl.drawArrays(unused.gl.TRIANGLES, 0, 6));
  assert.equal(normal.phases[0].rasterState, undefined, 'ordinary probe does no raster census');
});
