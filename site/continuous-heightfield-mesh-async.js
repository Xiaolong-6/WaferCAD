// Display-only Si tessellation. Transfer the large typed arrays out of the
// Worker; the immutable analytic Continuous Material Owner never changes.
import { buildContinuousSiHeightfieldMesh } from './continuous-heightfield-mesh.js';

function aborted() {
  return Object.assign(new Error('Continuous mesh build superseded'), { name: 'AbortError' });
}

export async function buildContinuousSiHeightfieldMeshAsync(
  owner,
  { xyStepUm = 1, maxTriangles = 1200000, adaptiveChordErrorUm = null, signal } = {},
) {
  if (signal?.aborted) throw aborted();
  let worker;
  try {
    if (typeof Worker !== 'function') throw new Error('Worker unavailable');
    const url = new URL('./continuous-heightfield-mesh-worker.js', import.meta.url);
    url.search = new URL(import.meta.url).search;
    worker = new Worker(url);
  } catch {
    // Restricted/null-origin viewers still render, but must report that the
    // CPU work ran synchronously. In a normal app Origin, use the Worker.
    if (signal?.aborted) throw aborted();
    return {
      mesh: buildContinuousSiHeightfieldMesh(owner, {
        xyStepUm,
        maxTriangles,
        adaptiveChordErrorUm,
      }),
      backend: 'sync-worker-unavailable',
    };
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const onAbort = () => finish(aborted());
    worker.onmessage = ({ data }) => {
      if (settled || data?.id !== 1) return;
      if (data.type === 'error') {
        finish(new Error(data.message || 'Continuous Si Worker failed'));
      } else if (data.type === 'done') {
        const mesh = data.mesh;
        if (
          !mesh ||
          !(mesh.positions instanceof Float32Array) ||
          !(mesh.normals instanceof Float32Array) ||
          mesh.positions.length !== mesh.normals.length ||
          mesh.positions.length !== mesh.triangles * 9
        ) {
          finish(new RangeError('Continuous Si Worker returned invalid mesh'));
        } else {
          finish(null, { mesh, backend: 'worker' });
        }
      } else {
        finish(new Error('Unexpected Continuous Si Worker response'));
      }
    };
    worker.onerror = (event) => finish(new Error(event.message || 'Continuous Si Worker crashed'));
    worker.onmessageerror = () => finish(new Error('Continuous Si Worker message decode failed'));
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) return onAbort();
    try {
      worker.postMessage({ id: 1, owner, xyStepUm, maxTriangles, adaptiveChordErrorUm });
    } catch (error) {
      finish(error);
    }
  });
}
