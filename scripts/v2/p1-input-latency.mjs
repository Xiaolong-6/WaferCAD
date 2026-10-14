// Summarize trusted browser input events separately from Long Task durations.
// Event.timeStamp and performance.now() share a clock in supported Chrome.
// The resulting delay is an input-dispatch estimate, not a compositor latency
// or proof that the camera gesture has painted.
export const INPUT_QUEUE_LIMIT_MS = 500;
const VALID_PHASES = new Set(['loading', 'coarse', 'refining', 'ready']);

export function summarizeHardwareInput(samples, limitMs = INPUT_QUEUE_LIMIT_MS) {
  const events = (Array.isArray(samples) ? samples : []).filter(
    (entry) =>
      entry?.trusted === true &&
      VALID_PHASES.has(entry.phase) &&
      Number.isFinite(entry.queueMs) &&
      entry.queueMs >= 0,
  );
  const loading = events.filter((entry) => entry.phase !== 'ready');
  const canvas = events.filter((entry) => entry.threeCanvas === true);
  const max = (list) => Math.max(0, ...list.map((entry) => entry.queueMs));
  const worstQueueMs = max(events);
  return {
    eventCount: events.length,
    loadingEventCount: loading.length,
    canvasEventCount: canvas.length,
    worstQueueMs: Math.round(worstQueueMs),
    worstLoadingQueueMs: Math.round(max(loading)),
    overLimitCount: events.filter((event) => event.queueMs > limitMs).length,
    phases: [...new Set(events.map((event) => event.phase))],
    responsive: events.length > 0 && loading.length > 0 && worstQueueMs <= limitMs,
  };
}

export function threeCameraGestureChanged(before, after) {
  const triple = (value) =>
    Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  if (
    !triple(before?.position) ||
    !triple(before?.target) ||
    !triple(after?.position) ||
    !triple(after?.target)
  ) {
    return false;
  }
  const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
  return (
    distance(before.position, after.position) > 1e-6 || distance(before.target, after.target) > 1e-6
  );
}
