// Yield scene assembly past a paint opportunity and a subsequent task boundary.
// A promise resolved inside requestAnimationFrame resumes in a microtask before
// the browser paints; the task hop prevents a long assembly loop from doing so.
export function yieldRendererAssembly({ requestFrame, postTask } = {}) {
  if (typeof requestFrame !== 'function' || typeof postTask !== 'function') {
    throw new TypeError('Renderer assembly scheduler requires frame and task callbacks');
  }
  return new Promise((resolve) => {
    requestFrame(() => postTask(resolve));
  });
}

// A budget applies between completed geometry units; it cannot preempt a
// single expensive triangulation or a synchronous WebGL renderer.render().
export function shouldYieldRendererAssembly(now, deadline, { heavy = true } = {}) {
  return heavy && Number.isFinite(now) && Number.isFinite(deadline) && now >= deadline;
}

export const INTERACTIVE_ASSEMBLY_SLICE_MS = 8;
