import { isArrayModel } from './model-array.js';
import {
  buildRenderSurfacePlan,
  cachedRenderSurfacePlan,
  rememberRenderSurfacePlan,
} from './renderer-geometry.js';

// The tiny-project path stays synchronous. Large non-array ownership plans
// run on a dedicated disposable worker to keep UI input and viewport painting
// responsive while polygon-clipping processes the exact topology.
export function shouldBuildSurfacePlanInWorker(model) {
  return (
    typeof globalThis.Worker === 'function' &&
    model &&
    !isArrayModel(model) &&
    ((model.layers?.length || 0) >= 6 || (model.regions?.length || 0) >= 64)
  );
}

export async function buildRenderSurfacePlanAsync(model, clip = null, { signal } = {}) {
  if (!shouldBuildSurfacePlanInWorker(model)) {
    return buildRenderSurfacePlan(model, clip);
  }
  const cached = cachedRenderSurfacePlan(model, clip);
  if (cached) return cached;
  if (signal?.aborted)
    throw Object.assign(new Error('Surface build superseded'), { name: 'AbortError' });
  return new Promise((resolve, reject) => {
    let worker;
    let settled = false;
    const onAbort = () =>
      finish(Object.assign(new Error('Surface build superseded'), { name: 'AbortError' }));
    const finish = (error, plan) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      worker?.terminate();
      if (error) reject(error);
      else resolve(rememberRenderSurfacePlan(model, clip, plan));
    };
    try {
      const url = new URL('./renderer-surface-plan-worker.js', import.meta.url);
      url.search = new URL(import.meta.url).search;
      worker = new globalThis.Worker(url);
      worker.onmessage = ({ data }) => {
        if (data?.id !== 1) return;
        if (data.type === 'done' && data.plan) finish(null, data.plan);
        else if (data.type === 'error')
          finish(new Error(data.message || 'Surface ownership worker failed.'));
      };
      worker.onerror = (event) =>
        finish(new Error(event.message || 'Surface ownership worker crashed.'));
      worker.onmessageerror = () =>
        finish(new Error('Surface ownership worker returned unreadable geometry.'));
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      worker.postMessage({ id: 1, action: 'surface-plan', model, clip });
    } catch (error) {
      finish(error);
    }
  });
}
