// Optional WebGL2 GPU timer-query diagnostics. This is asynchronous GPU
// execution time, not JS submit duration, gl.finish(), or compositor display.
// No pixel/mesh state is changed and the sample rate is explicitly bounded.
export function createRendererGpuTimer(
  gl,
  {
    now = () => performance.now(),
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = (handle) => clearTimeout(handle),
    onUpdate = () => {},
    sampleIntervalMs = 250,
    pollIntervalMs = 200,
    maxPending = 3,
    capacity = 64,
  } = {},
) {
  if (
    !Number.isFinite(sampleIntervalMs) ||
    sampleIntervalMs < 1 ||
    !Number.isFinite(pollIntervalMs) ||
    pollIntervalMs < 1 ||
    !Number.isSafeInteger(maxPending) ||
    maxPending < 1 ||
    !Number.isSafeInteger(capacity) ||
    capacity < 1
  ) {
    throw new RangeError('GPU sampling bounds must be positive');
  }
  let extension = null;
  try {
    if (
      gl &&
      typeof gl.createQuery === 'function' &&
      typeof gl.beginQuery === 'function' &&
      typeof gl.endQuery === 'function' &&
      typeof gl.getQueryParameter === 'function'
    ) {
      extension = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    }
  } catch {
    // Browsers may reject extensions during context initialization.
  }
  const supported = Boolean(
    extension &&
    Number.isFinite(extension.TIME_ELAPSED_EXT) &&
    Number.isFinite(extension.GPU_DISJOINT_EXT),
  );
  const pending = [];
  const samples = [];
  let activeQuery = null;
  let pollHandle = null;
  let lastIssuedAt = -Infinity;
  let disposed = false;
  let dropped = 0;
  let disjointCount = 0;
  let failed = false;

  const snapshot = () => {
    const sorted = [...samples].sort((a, b) => a - b);
    return {
      supported: supported && !failed,
      samples: samples.length,
      pending: pending.length + Number(activeQuery !== null),
      p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null,
      maxMs: sorted.length ? sorted[sorted.length - 1] : null,
      dropped,
      disjointCount,
    };
  };
  const publish = () => {
    try {
      onUpdate(snapshot());
    } catch {
      // Metrics must never affect scientific rendering.
    }
  };
  const deleteQuery = (query) => {
    try {
      gl.deleteQuery(query);
    } catch {
      // Ignore invalid deletion after context loss.
    }
  };
  const clearPending = () => {
    while (pending.length) deleteQuery(pending.shift());
  };
  const stopPoll = () => {
    if (pollHandle != null) cancel(pollHandle);
    pollHandle = null;
  };
  const invalidate = () => {
    failed = true;
    stopPoll();
    clearPending();
    activeQuery = null;
    publish();
  };
  const poll = () => {
    pollHandle = null;
    if (disposed || !supported || failed) return;
    try {
      if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
        // All unresolved timing results are invalid after a GPU disjoint.
        disjointCount++;
        dropped += pending.length;
        clearPending();
      } else {
        for (let i = 0; i < pending.length;) {
          const query = pending[i];
          if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
            i++;
            continue;
          }
          const durationNs = gl.getQueryParameter(query, gl.QUERY_RESULT);
          pending.splice(i, 1);
          deleteQuery(query);
          if (Number.isFinite(durationNs) && durationNs >= 0) {
            samples.push(durationNs / 1e6);
            if (samples.length > capacity) samples.shift();
          } else {
            dropped++;
          }
        }
      }
      publish();
    } catch {
      invalidate();
      return;
    }
    if (pending.length) pollHandle = schedule(poll, pollIntervalMs);
  };
  const schedulePoll = () => {
    if (pollHandle == null && pending.length && !disposed && !failed) {
      pollHandle = schedule(poll, pollIntervalMs);
    }
  };

  publish();
  return {
    get supported() {
      return supported && !disposed && !failed;
    },
    beginFrame() {
      if (!supported || failed || disposed || activeQuery) return false;
      const stamp = now();
      if (!Number.isFinite(stamp) || stamp - lastIssuedAt < sampleIntervalMs) return false;
      if (pending.length >= maxPending) {
        dropped++;
        publish();
        return false;
      }
      try {
        const query = gl.createQuery();
        if (!query) return false;
        gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
        activeQuery = query;
        lastIssuedAt = stamp;
        return true;
      } catch {
        invalidate();
        return false;
      }
    },
    endFrame() {
      if (!activeQuery || disposed || failed) return false;
      const query = activeQuery;
      activeQuery = null;
      try {
        gl.endQuery(extension.TIME_ELAPSED_EXT);
        pending.push(query);
        schedulePoll();
        publish();
        return true;
      } catch {
        deleteQuery(query);
        invalidate();
        return false;
      }
    },
    // Safe during WebGL context loss: no synchronous wait for GPU work.
    dispose({ contextLost = false } = {}) {
      if (disposed) return;
      disposed = true;
      stopPoll();
      if (!contextLost) {
        if (activeQuery) {
          try {
            gl.endQuery(extension.TIME_ELAPSED_EXT);
          } catch {
            // Ignore error on teardown.
          }
        }
        if (activeQuery) deleteQuery(activeQuery);
        clearPending();
      }
      activeQuery = null;
      pending.length = 0;
      publish();
    },
    snapshot,
  };
}
