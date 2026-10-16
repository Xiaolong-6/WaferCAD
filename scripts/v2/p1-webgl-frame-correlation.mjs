// Diagnostic attribution only. DOM-observed frame end times can lag renderer.render()
// by a microtask, so overlap is evidence for prioritization, not proof that a
// Long Task was exclusively caused by GL. Never use this to waive the 500 ms gate.
export function correlateWebglFramesWithLongTasks(tasks = [], frames = []) {
  return tasks
    .filter((task) => Number.isFinite(task?.startEpochMs) && task.durationMs >= 500)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 12)
    .map((task) => {
      const taskEnd = task.startEpochMs + task.durationMs;
      let best = null;
      for (const frame of frames) {
        if (
          !Number.isFinite(frame?.startEpochMs) ||
          !Number.isFinite(frame?.endEpochMs) ||
          !(frame.endEpochMs >= frame.startEpochMs)
        ) {
          continue;
        }
        const overlapMs =
          Math.min(taskEnd, frame.endEpochMs) - Math.max(task.startEpochMs, frame.startEpochMs);
        if (!(overlapMs > 0) || (best && best.overlapMs >= overlapMs)) continue;
        best = {
          serial: frame.serial,
          quality: frame.quality,
          variant: frame.variant,
          renderMs: frame.renderMs,
          drawCalls: frame.drawCalls,
          triangles: frame.triangles,
          overlapMs: Math.round(overlapMs),
          taskOverlapFraction: Math.round((overlapMs / task.durationMs) * 1000) / 1000,
        };
      }
      return { startEpochMs: task.startEpochMs, durationMs: task.durationMs, frame: best };
    });
}
