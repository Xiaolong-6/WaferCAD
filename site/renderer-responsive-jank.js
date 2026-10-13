// Long-task telemetry complements input-to-WebGL-submit timing. It does not
// measure GPU completion or presentation latency.
export function createRendererLongTaskSampler({ capacity = 256, thresholdMs = 50 } = {}) {
  if (!Number.isSafeInteger(capacity) || capacity < 1 ||
      !Number.isFinite(thresholdMs) || thresholdMs <= 0) {
    throw new RangeError('Invalid long-task telemetry bounds');
  }
  const durations = [];
  return {
    record(durationMs) {
      if (!Number.isFinite(durationMs) || durationMs < thresholdMs) return false;
      durations.push(durationMs);
      if (durations.length > capacity) durations.shift();
      return true;
    },
    snapshot() {
      const sorted = durations.slice().sort((a, b) => a - b);
      const p95Index = Math.ceil(sorted.length * 0.95) - 1;
      return {
        count: sorted.length,
        p95Ms: sorted.length ? sorted[p95Index] : null,
        maxMs: sorted.length ? sorted[sorted.length - 1] : null,
        blockingMs: durations.reduce((sum, duration) => sum + duration - thresholdMs, 0),
      };
    },
  };
}
