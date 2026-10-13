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

export async function buildRenderSurfacePlanAsync(model, clip = null) {
  if (!shouldBuildSurfacePlanInWorker(model)) {
    return buildRenderSurfacePlan(model, clip);
  }
  const cached = cachedRenderSurfacePlan(model, clip);
  if (cached) return cached;
  return new Promise((resolve, reject) => {
    let worker;
    let settled = false;
    const finish = (error, plan) => {
      if (settled) return;
      settled = true;
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
      worker.postMessage({ id: 1, action: 'surface-plan', model, clip });
    } catch (error) {
      finish(error);
    }
  });
}
