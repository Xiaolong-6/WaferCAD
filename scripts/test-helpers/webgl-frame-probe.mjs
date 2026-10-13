// Injected only by the renderer benchmark, never loaded by the application.
// RASTERIZER_DISCARD is an intentionally incomplete diagnostic image, not LOD.
export function installWebglFrameProbe() {
  const contexts = new Map();
  const frames = [];
  let armed = null;
  let owner = { kind: 'untracked', name: '' };
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalRaf = window.requestAnimationFrame;

  // Diagnostic readback only: never mutate buffer bytes or VAO attribute pointers.
  // Bound the number of attributes and bytes to avoid a full-wafer CPU copy.
  function sampleDrawBuffers(gl, indexed) {
    const priorArray = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
    const attributes = [];
    try {
      const limit = Math.min(8, gl.getParameter(gl.MAX_VERTEX_ATTRIBS));
      for (let i = 0; i < limit; i++) {
        if (!gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_ENABLED)) continue;
        const buffer = gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING);
        if (!buffer) {
          attributes.push({ index: i, status: 'missing-buffer' });
          continue;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        const length = Math.min(4096, gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE));
        const data = new Uint8Array(length);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, data);
        attributes.push({
          index: i,
          status: 'read',
          totalBytes: gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE),
          offset: gl.getVertexAttribOffset(i, gl.VERTEX_ATTRIB_ARRAY_POINTER),
          size: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_SIZE),
          type: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_TYPE),
          stride: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_STRIDE),
          divisor: gl.getVertexAttrib(i, gl.VERTEX_ATTRIB_ARRAY_DIVISOR),
          bytes: Array.from(data),
        });
      }
      let indices = null;
      if (indexed) {
        const element = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
        if (!element) {
          indices = { status: 'missing-buffer' };
        } else {
          const totalBytes = gl.getBufferParameter(gl.ELEMENT_ARRAY_BUFFER, gl.BUFFER_SIZE);
          const data = new Uint8Array(Math.min(4096, totalBytes));
          gl.getBufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, data);
          indices = { status: 'read', totalBytes, bytes: Array.from(data) };
        }
      }
      return { attributes, indices };
    } finally {
      gl.bindBuffer(gl.ARRAY_BUFFER, priorArray);
    }
  }

  // Exact GL raster state at the draw checkpoint. Object identities and
  // program handles differ between contexts; only comparable scalar/array
  // values belong in fresh-context fingerprints. Read-only, opt-in evidence.
  function captureRasterState(gl) {
    const get = (name) => {
      const value = gl.getParameter(gl[name]);
      return ArrayBuffer.isView(value) ? Array.from(value) : value;
    };
    return {
      viewport: get('VIEWPORT'),
      scissorBox: get('SCISSOR_BOX'),
      scissorTest: gl.isEnabled(gl.SCISSOR_TEST),
      blend: gl.isEnabled(gl.BLEND),
      blendSrcRgb: get('BLEND_SRC_RGB'),
      blendDstRgb: get('BLEND_DST_RGB'),
      blendSrcAlpha: get('BLEND_SRC_ALPHA'),
      blendDstAlpha: get('BLEND_DST_ALPHA'),
      blendEquationRgb: get('BLEND_EQUATION_RGB'),
      blendEquationAlpha: get('BLEND_EQUATION_ALPHA'),
      blendColor: get('BLEND_COLOR'),
      colorMask: get('COLOR_WRITEMASK'),
      depthTest: gl.isEnabled(gl.DEPTH_TEST),
      depthMask: get('DEPTH_WRITEMASK'),
      depthFunc: get('DEPTH_FUNC'),
      depthRange: get('DEPTH_RANGE'),
      stencilTest: gl.isEnabled(gl.STENCIL_TEST),
      cullFace: gl.isEnabled(gl.CULL_FACE),
      cullFaceMode: get('CULL_FACE_MODE'),
      frontFace: get('FRONT_FACE'),
      dither: gl.isEnabled(gl.DITHER),
      polygonOffsetFill: gl.isEnabled(gl.POLYGON_OFFSET_FILL),
      polygonOffsetFactor: get('POLYGON_OFFSET_FACTOR'),
      polygonOffsetUnits: get('POLYGON_OFFSET_UNITS'),
      sampleAlphaToCoverage: gl.isEnabled(gl.SAMPLE_ALPHA_TO_COVERAGE),
      sampleCoverage: gl.isEnabled(gl.SAMPLE_COVERAGE),
      sampleCoverageValue: get('SAMPLE_COVERAGE_VALUE'),
      sampleCoverageInvert: get('SAMPLE_COVERAGE_INVERT'),
      samples: get('SAMPLES'),
    };
  }

  function capturePhaseFramebuffer(gl, active, endingKind, final = false) {
    if (!active.capturePhases || endingKind === null) return;
    // Reserve the last slot for the completed frame. Sampling the first
    // transitions only must never masquerade as full-stage coverage.
    if (active.phases.length >= (final ? 12 : 11)) {
      if (!final) active.phaseTransitionsSkipped++;
      return;
    }
    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const binding = gl.getParameter(gl.FRAMEBUFFER_BINDING);
    if (binding || width <= 0 || height <= 0 || width * height > 2000000) {
      active.phases.push({
        afterDraw: active.drawCalls,
        kind: endingKind,
        status: binding ? 'offscreen-framebuffer' : 'size-limit',
      });
      return;
    }
    const bytes = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    const error = gl.getError();
    const checkpoint = {
      afterDraw: active.drawCalls,
      kind: endingKind,
      width,
      height,
      status: error === gl.NO_ERROR ? 'valid' : 'gl-error',
      glError: error,
      ...(active.captureRasterState ? { rasterState: captureRasterState(gl) } : {}),
    };
    if (error === gl.NO_ERROR) {
      Object.defineProperty(checkpoint, 'rgba', { value: bytes });
    }
    active.phases.push(checkpoint);
  }

  function instrument(gl, canvas) {
    if (contexts.has(gl)) return;
    const entry = { gl, canvas, active: null, timer: null };
    contexts.set(gl, entry);
    for (const method of [
      'drawArrays',
      'drawElements',
      'drawArraysInstanced',
      'drawElementsInstanced',
    ]) {
      if (typeof gl[method] !== 'function') continue;
      const draw = gl[method].bind(gl);
      gl[method] = (...args) => {
        const host = canvas.closest('#threeHost');
        if (
          armed &&
          !entry.active &&
          host?.dataset.renderState === 'ready' &&
          host.dataset.sceneVariant === 'transparent' &&
          host.dataset.renderQuality === 'quality'
        ) {
          const options = armed;
          armed = null;
          entry.timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
          const query = entry.timer ? gl.createQuery() : null;
          // Do not steal a query started by another profiler.
          const timerBusy =
            entry.timer && gl.getQuery(entry.timer.TIME_ELAPSED_EXT, gl.CURRENT_QUERY);
          const priorDiscard = gl.isEnabled(gl.RASTERIZER_DISCARD);
          entry.active = {
            rasterDiscard: options.rasterDiscard,
            priorDiscard,
            // Optional completed-frame framebuffer evidence; disabled by default.
            pixelSamples: options.pixelSamples || [],
            captureGlState: options.captureGlState === true,
            captureFramebuffer: options.captureFramebuffer === true,
            captureDrawInputs: options.captureDrawInputs === true,
            drawInputs: [],
            capturePhases: options.capturePhases === true,
            captureRasterState: options.captureRasterState === true,
            phases: [],
            phaseKind: null,
            capturePhaseDraws: new Set(options.capturePhaseDraws || []),
            phaseTransitionsObserved: 0,
            phaseTransitionsSkipped: 0,
            firstElectricalState: null,
            forcedDitherDisabledDraws: 0,
            startedAt: performance.now(),
            query: timerBusy ? null : query,
            timerStatus: timerBusy ? 'busy' : query ? 'pending' : 'unsupported',
            drawCalls: 0,
            triangles: 0,
            owners: new Map(),
          };
          if (timerBusy && query) gl.deleteQuery(query);
          if (entry.active.query) gl.beginQuery(entry.timer.TIME_ELAPSED_EXT, query);
          if (options.rasterDiscard && !priorDiscard) gl.enable(gl.RASTERIZER_DISCARD);
        }
        const active = entry.active;
        if (active) {
          if (
            active.capturePhases &&
            active.capturePhaseDraws.size === 0 &&
            active.phaseKind !== null &&
            active.phaseKind !== owner.kind
          ) {
            active.phaseTransitionsObserved++;
            capturePhaseFramebuffer(gl, active, active.phaseKind);
          }
          active.phaseKind = owner.kind;
          if (
            active.captureGlState &&
            owner.kind === 'electrical-surface' &&
            active.firstElectricalState === null
          )
            active.firstElectricalState = {
              blend: gl.isEnabled(gl.BLEND),
              depthTest: gl.isEnabled(gl.DEPTH_TEST),
              dither: gl.isEnabled(gl.DITHER),
              cullFace: gl.isEnabled(gl.CULL_FACE),
              blendSrcRgb: gl.getParameter(gl.BLEND_SRC_RGB),
              blendDstRgb: gl.getParameter(gl.BLEND_DST_RGB),
              blendEquationRgb: gl.getParameter(gl.BLEND_EQUATION_RGB),
              depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
            };
          const instanced = method.endsWith('Instanced');
          const count = method.startsWith('drawArrays') ? args[2] : args[1];
          const instances = instanced ? args[method === 'drawArraysInstanced' ? 3 : 4] : 1;
          const triangles = args[0] === gl.TRIANGLES ? (count / 3) * instances : 0;
          active.drawCalls++;
          active.triangles += triangles;
          if (
            active.captureDrawInputs &&
            active.drawInputs.length < 48 &&
            (active.drawCalls <= 8 || active.drawCalls % 32 === 0)
          ) {
            const program = gl.getParameter(gl.CURRENT_PROGRAM);
            const shaders = program
              ? (gl.getAttachedShaders(program) || []).map((shader) => ({
                  type: gl.getShaderParameter(shader, gl.SHADER_TYPE),
                  source: (gl.getShaderSource(shader) || '').slice(0, 100000),
                }))
              : [];
            active.drawInputs.push({
              draw: active.drawCalls,
              kind: owner.kind,
              name: owner.name,
              method,
              mode: args[0],
              count,
              instances,
              shaders,
              indexedBuffer: Boolean(gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING)),
              blend: gl.isEnabled(gl.BLEND),
              cull: gl.isEnabled(gl.CULL_FACE),
              cullMode: gl.getParameter(gl.CULL_FACE_MODE),
              depthTest: gl.isEnabled(gl.DEPTH_TEST),
              depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
              depthFunc: gl.getParameter(gl.DEPTH_FUNC),
              blendSrcRgb: gl.getParameter(gl.BLEND_SRC_RGB),
              blendDstRgb: gl.getParameter(gl.BLEND_DST_RGB),
              blendEquationRgb: gl.getParameter(gl.BLEND_EQUATION_RGB),
              viewport: Array.from(gl.getParameter(gl.VIEWPORT)),
              buffers: sampleDrawBuffers(gl, method.startsWith('drawElements')),
            });
          }
          const key = JSON.stringify([owner.kind, owner.name]);
          const row = active.owners.get(key) || { ...owner, drawCalls: 0, triangles: 0 };
          row.drawCalls++;
          row.triangles += triangles;
          active.owners.set(key, row);
        }
        // Diagnostic-only isolation: disable dithering JUST for this draw,
        // then restore its pre-draw GL state even when drawing throws. All
        // browser/product settings stay unchanged in normal operation.
        const restoreDither =
          window.__waferCadDitherProbeForceOff === true && gl.isEnabled(gl.DITHER);
        if (restoreDither) {
          gl.disable(gl.DITHER);
          if (active) active.forcedDitherDisabledDraws++;
        }
        try {
          const result = draw(...args);
          if (active?.capturePhases && active.capturePhaseDraws.has(active.drawCalls)) {
            capturePhaseFramebuffer(gl, active, owner.kind);
          }
          return result;
        } finally {
          if (restoreDither) gl.enable(gl.DITHER);
        }
      };
    }
  }

  HTMLCanvasElement.prototype.getContext = function (...args) {
    // Test-only raster isolation, prior to Three.js WebGL context creation.
    // No change to the product or ordinary browser context attributes.
    const forcedNoMsaa = args[0] === 'webgl2' && window.__waferCadMsaaProbeForceOff === true;
    const preservedMsaa =
      args[0] === 'webgl2' && window.__waferCadPreservedMsaaProbeForceOn === true;
    const contextArgs = forcedNoMsaa
      ? [args[0], { ...(args[1] || {}), antialias: false }]
      : preservedMsaa
        ? [args[0], { ...(args[1] || {}), antialias: true, preserveDrawingBuffer: true }]
        : args;
    const gl = originalGetContext.apply(this, contextArgs);
    if (args[0] === 'webgl2' && gl) instrument(gl, this);
    return gl;
  };

  function finishFrames() {
    for (const entry of contexts.values()) {
      const active = entry.active;
      if (!active) continue;
      const { gl } = entry;
      try {
        if (active.query) gl.endQuery(entry.timer.TIME_ELAPSED_EXT);
        const submittedAt = performance.now();
        // An explicit completion barrier separates JS submission from the
        // remaining driver/GPU queue. It perturbs scheduling in BOTH arms.
        gl.finish();
        const finishedAt = performance.now();
        // Capture the final drawn phase even if there was no owner transition.
        // The readback is diagnostic-only and excluded from the finish latency.
        if (active.capturePhases) capturePhaseFramebuffer(gl, active, active.phaseKind, true);
        const frame = {
          rasterDiscard: active.rasterDiscard,
          drawCalls: active.drawCalls,
          triangles: active.triangles,
          forcedDitherDisabledDraws: active.forcedDitherDisabledDraws,
          contextAntialias: gl.getContextAttributes?.().antialias ?? null,
          contextPreserveDrawingBuffer: gl.getContextAttributes?.().preserveDrawingBuffer ?? null,
          defaultFramebufferSamples: gl.getParameter(gl.SAMPLES),
          submissionMs: submittedAt - active.startedAt,
          finishWaitMs: finishedAt - submittedAt,
          completedDrawMs: finishedAt - active.startedAt,
          glError: gl.getError(),
          priorRasterDiscard: active.priorDiscard,
          timerStatus: active.timerStatus,
          gpuMs: null,
          frameSerial: Number(entry.canvas.closest('#threeHost')?.dataset.rendererFrameSerial || 0),
          owners: [...active.owners.values()].sort((a, b) => b.triangles - a.triangles),
          ...(active.captureDrawInputs ? { drawInputs: active.drawInputs } : {}),
          ...(active.capturePhases
            ? {
                phases: active.phases,
                phaseCoverage: {
                  captured: active.phases.length,
                  transitionsObserved: active.phaseTransitionsObserved,
                  transitionsSkipped: active.phaseTransitionsSkipped,
                  mode: active.capturePhaseDraws.size ? 'draw-milestones' : 'owner-transitions',
                  complete:
                    active.capturePhaseDraws.size === 0 && active.phaseTransitionsSkipped === 0,
                  finalFrameCaptured: active.phases.at(-1)?.afterDraw === active.drawCalls,
                },
              }
            : {}),
          vendor: gl.getParameter(gl.VENDOR),
          renderer: gl.getParameter(gl.RENDERER),
          version: gl.getParameter(gl.VERSION),
        };
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        if (debug) frame.unmaskedRenderer = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
        if (active.captureGlState) {
          frame.glState = {
            blend: gl.isEnabled(gl.BLEND),
            dither: gl.isEnabled(gl.DITHER),
            depthTest: gl.isEnabled(gl.DEPTH_TEST),
            cullFace: gl.isEnabled(gl.CULL_FACE),
            blendSrcRgb: gl.getParameter(gl.BLEND_SRC_RGB),
            blendDstRgb: gl.getParameter(gl.BLEND_DST_RGB),
            blendEquationRgb: gl.getParameter(gl.BLEND_EQUATION_RGB),
            depthMask: gl.getParameter(gl.DEPTH_WRITEMASK),
            framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) ? 'offscreen' : 'default',
            firstElectricalState: active.firstElectricalState,
          };
        }
        if (active.pixelSamples.length) {
          frame.pixelSamples = active.pixelSamples.map(({ x, y, sourceWidth, sourceHeight }) => {
            const width = gl.drawingBufferWidth;
            const height = gl.drawingBufferHeight;
            // The screenshot and GL backing store can differ by one pixel
            // (or DPR). Map pixel centers, never assume identical dimensions.
            const displayWidth = sourceWidth || width;
            const displayHeight = sourceHeight || height;
            if (
              x < 0 ||
              y < 0 ||
              x >= displayWidth ||
              y >= displayHeight ||
              width <= 0 ||
              height <= 0
            )
              return { x, y, status: 'out-of-bounds', width, height };
            const readX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / displayWidth));
            const readY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / displayHeight));
            const rgba = new Uint8Array(4);
            gl.readPixels(readX, height - 1 - readY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
            const error = gl.getError();
            return {
              x,
              y,
              readX,
              readY,
              width,
              height,
              displayWidth,
              displayHeight,
              rgba: Array.from(rgba),
              status: error === gl.NO_ERROR ? 'valid' : 'gl-error',
              glError: error,
            };
          });
        }
        if (active.captureFramebuffer) {
          const width = gl.drawingBufferWidth;
          const height = gl.drawingBufferHeight;
          if (width > 0 && height > 0 && width * height <= 2000000) {
            const rgba = new Uint8Array(width * height * 4);
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
            const readError = gl.getError();
            frame.framebuffer = {
              width,
              height,
              status: readError === gl.NO_ERROR ? 'valid' : 'gl-error',
              glError: readError,
            };
            // Keep the large raw backing data off JSON/log serialization.
            Object.defineProperty(frame, 'framebufferRgba', { value: rgba });
          } else {
            frame.framebuffer = { width, height, status: 'size-limit' };
          }
        }
        frames.push(frame);
        if (frames.length > 16) frames.shift();
        if (active.query) {
          const query = active.query;
          let attempts = 0;
          const poll = () => {
            if (gl.isContextLost()) frame.timerStatus = 'context-lost';
            else if (gl.getParameter(entry.timer.GPU_DISJOINT_EXT)) frame.timerStatus = 'disjoint';
            else if (gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
              frame.gpuMs = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
              frame.timerStatus = 'valid';
            } else if (++attempts < 100) {
              setTimeout(poll, 20);
              return;
            } else frame.timerStatus = 'timeout';
            gl.deleteQuery(query);
          };
          setTimeout(poll, 0);
        }
      } finally {
        if (active.rasterDiscard && !active.priorDiscard) gl.disable(gl.RASTERIZER_DISCARD);
        entry.active = null;
      }
    }
  }

  window.requestAnimationFrame = (callback) =>
    originalRaf.call(window, (timestamp) => {
      try {
        callback(timestamp);
      } finally {
        finishFrames();
      }
    });

  window.__waferCadWebglProbe = {
    arm(options) {
      if (armed || [...contexts.values()].some((entry) => entry.active)) {
        throw new Error('WebGL frame probe already armed');
      }
      const pixels = options.pixelSamples || [];
      if (
        !Array.isArray(pixels) ||
        pixels.length > 16 ||
        pixels.some(
          (point) =>
            !point ||
            !Number.isInteger(point.x) ||
            !Number.isInteger(point.y) ||
            (point.sourceWidth != null &&
              (!Number.isInteger(point.sourceWidth) || point.sourceWidth <= 0)) ||
            (point.sourceHeight != null &&
              (!Number.isInteger(point.sourceHeight) || point.sourceHeight <= 0)),
        )
      )
        throw new Error('Invalid bounded WebGL diagnostic sample coordinates');
      const capturePhaseDraws = options.capturePhaseDraws || [];
      if (
        !Array.isArray(capturePhaseDraws) ||
        capturePhaseDraws.length > 11 ||
        capturePhaseDraws.some(
          (draw, i) =>
            !Number.isSafeInteger(draw) ||
            draw <= 0 ||
            draw > 100000 ||
            (i > 0 && draw <= capturePhaseDraws[i - 1]),
        )
      ) {
        throw new Error('Invalid ordered bounded WebGL draw checkpoints');
      }
      armed = {
        rasterDiscard: options.rasterDiscard === true,
        capturePhaseDraws: [...capturePhaseDraws],
        captureGlState: options.captureGlState === true,
        captureFramebuffer: options.captureFramebuffer === true,
        captureDrawInputs: options.captureDrawInputs === true,
        capturePhases: options.capturePhases === true,
        captureRasterState: options.captureRasterState === true,
        pixelSamples: pixels.map(({ x, y, sourceWidth, sourceHeight }) => ({
          x,
          y,
          sourceWidth,
          sourceHeight,
        })),
      };
    },
    owner(object) {
      owner = {
        kind:
          object.userData?.waferCadPresentation?.kind ||
          (object.type === 'AxesHelper' && object.isLineSegments === true
            ? 'reference-axes'
            : 'untracked'),
        name: object.name || '',
      };
    },
    frames() {
      return frames;
    },
  };
}
