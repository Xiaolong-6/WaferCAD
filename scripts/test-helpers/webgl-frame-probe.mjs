// Injected only by the renderer benchmark, never loaded by the application.
// RASTERIZER_DISCARD is an intentionally incomplete diagnostic image, not LOD.
export function installWebglFrameProbe() {
  const contexts = new Map();
  const frames = [];
  let armed = null;
  let owner = { kind: 'untracked', name: '' };
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalRaf = window.requestAnimationFrame;

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
          const instanced = method.endsWith('Instanced');
          const count = method.startsWith('drawArrays') ? args[2] : args[1];
          const instances = instanced ? args[method === 'drawArraysInstanced' ? 3 : 4] : 1;
          const triangles = args[0] === gl.TRIANGLES ? (count / 3) * instances : 0;
          active.drawCalls++;
          active.triangles += triangles;
          const key = JSON.stringify([owner.kind, owner.name]);
          const row = active.owners.get(key) || { ...owner, drawCalls: 0, triangles: 0 };
          row.drawCalls++;
          row.triangles += triangles;
          active.owners.set(key, row);
        }
        return draw(...args);
      };
    }
  }

  HTMLCanvasElement.prototype.getContext = function (...args) {
    const gl = originalGetContext.apply(this, args);
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
        const frame = {
          rasterDiscard: active.rasterDiscard,
          drawCalls: active.drawCalls,
          triangles: active.triangles,
          submissionMs: submittedAt - active.startedAt,
          finishWaitMs: finishedAt - submittedAt,
          completedDrawMs: finishedAt - active.startedAt,
          glError: gl.getError(),
          priorRasterDiscard: active.priorDiscard,
          timerStatus: active.timerStatus,
          gpuMs: null,
          frameSerial: Number(entry.canvas.closest('#threeHost')?.dataset.rendererFrameSerial || 0),
          owners: [...active.owners.values()].sort((a, b) => b.triangles - a.triangles),
          vendor: gl.getParameter(gl.VENDOR),
          renderer: gl.getParameter(gl.RENDERER),
          version: gl.getParameter(gl.VERSION),
        };
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        if (debug) frame.unmaskedRenderer = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
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
      armed = { rasterDiscard: options.rasterDiscard === true };
    },
    owner(object) {
      owner = {
        kind: object.userData?.waferCadPresentation?.kind || 'untracked',
        name: object.name || '',
      };
    },
    frames() {
      return frames;
    },
  };
}
