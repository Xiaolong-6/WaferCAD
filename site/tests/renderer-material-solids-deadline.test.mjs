import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { materialSolidsFromTopology } = await import('../process-topology.js');
const { parallelMaterialSolids } = await import('../renderer-material-solids-parallel.js');

function overlappingMaterials() {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 5 });
  model.layers.push({ id: 'film', name: 'Film', color: '#999999' });
  const geom = model.regions[0].geom;
  model.regions = Array.from({ length: 850 }, (_, index) => ({
    id: `region-${index}`,
    geom,
    stack: [
      {
        layerId: index < 480 ? 'film' : 'base',
        z0: index < 480 ? 3 : -2.5,
        z1: index < 480 ? 4 : 2.5,
      },
    ],
  }));
  return model;
}

test('parent event-loop blocking cannot time out an already completed child', async () => {
  const model = overlappingMaterials();
  const serial = materialSolidsFromTopology(model);
  const workers = [];
  class DelayedDeliveryWorker {
    constructor() {
      workers.push(this);
    }
    postMessage({ model: childModel }) {
      const solids = materialSolidsFromTopology(childModel);
      // Synchronous postMessage structured-clone / parent computation can
      // block message delivery; this models that delay without test timers.
      const start = performance.now();
      while (performance.now() - start < 40) {
        /* blocked parent */
      }
      setTimeout(() => this.onmessage({ data: { id: 1, type: 'done', solids } }), 0);
    }
    terminate() {
      this.terminated = true;
    }
  }
  const result = await parallelMaterialSolids(model, null, {
    WorkerClass: DelayedDeliveryWorker,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    childTimeoutMs: 10,
  });
  assert.deepEqual(result, serial, 'completed child must not be discarded on late delivery');
  assert.equal(workers.length, 1);
  assert.equal(workers[0].terminated, true);
});
