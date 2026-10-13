// JS event-to-WebGL-submit telemetry. renderer.render() returning is not
// GPU completion or compositor presentation. Keep terminology explicit.
function p95(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * 0.95) - 1];
}

export function createRendererLatencyTracker({ capacity = 120 } = {}) {
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('Invalid capacity');
  const input = [];
  const frames = [];
  let firstInputAt = null;

  const append = (values, item) => {
    values.push(item);
    if (values.length > capacity) values.shift();
  };

  return {
    markInput(time) {
      if (!Number.isFinite(time)) return;
      if (firstInputAt === null) firstInputAt = time;
    },
    completeFrame(time, durationMs) {
      if (Number.isFinite(durationMs) && durationMs >= 0) append(frames, durationMs);
      let latencyMs = null;
      if (firstInputAt !== null && Number.isFinite(time)) {
        latencyMs = Math.max(0, time - firstInputAt);
        append(input, latencyMs);
        firstInputAt = null;
      }
      return latencyMs;
    },
    resetPendingInput() {
      firstInputAt = null;
    },
    snapshot() {
      return {
        inputSamples: input.length,
        inputToSubmitP95Ms: p95(input),
        inputToSubmitMaxMs: input.length ? Math.max(...input) : null,
        frameSamples: frames.length,
        frameSubmitP95Ms: p95(frames),
        frameSubmitMaxMs: frames.length ? Math.max(...frames) : null,
      };
    },
  };
}
