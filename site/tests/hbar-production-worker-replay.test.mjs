import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { readProjectFile } = await import('../project-io.js');
const { createModel } = await import('../model.js');
const fixture = new URL(
  '../../examples/projects/hbar-blesin-2024-candidate/hbar-blesin-2024-author-roi.wafercad',
  import.meta.url,
);
const workerSource = fileURLToPath(new URL('../process-worker.js', import.meta.url));
const polygonVendor = fileURLToPath(new URL('../vendor/polygon-clipping.umd.js', import.meta.url));

// Execute the *production* browser Process Worker handler in a real Node
// worker thread. The adapter supplies only browser bootstrap globals and
// messages; no Process Kernel or Mask geometry is mocked.
const adapter = `
const { parentPort, workerData } = require('node:worker_threads');
const { readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const polygonVendor = { exports: {} };
new Function('module', 'exports', readFileSync(workerData.vendor, 'utf8'))(
  polygonVendor, polygonVendor.exports,
);
globalThis.polygonClipping = polygonVendor.exports;
globalThis.self = {
  location: { href: pathToFileURL(workerData.source).href, search: '' },
  importScripts: () => {},
  postMessage: (message) => parentPort.postMessage(message),
};
import(pathToFileURL(workerData.source).href)
  .then(() => {
    parentPort.on('message', (data) => {
      void self.onmessage({ data });
    });
    parentPort.postMessage({ id: 0, type: 'ready' });
  })
  .catch((error) => parentPort.postMessage({
    id: 0, type: 'error', message: error.stack || String(error),
  }));
`;

function waitForMessage(worker, id, accepted) {
  return new Promise((resolve, reject) => {
    const fail = (error) => {
      cleanup();
      reject(error);
    };
    const receive = (message) => {
      if (message.id !== id || !accepted.includes(message.type)) return;
      cleanup();
      if (message.type === 'error') fail(new Error(message.message));
      else resolve(message);
    };
    function cleanup() {
      worker.off('message', receive);
      worker.off('error', fail);
    }
    worker.on('message', receive);
    worker.on('error', fail);
  });
}

test('production Process Worker thread replays every physical HBAR Recipe Step', async () => {
  const bytes = readFileSync(fixture);
  const project = await readProjectFile({
    size: bytes.length,
    text: async () => bytes.toString('utf8'),
  });
  const { processRecipe: recipe } = project;
  const worker = new Worker(adapter, {
    eval: true,
    workerData: { source: workerSource, vendor: polygonVendor },
  });
  try {
    await waitForMessage(worker, 0, ['ready', 'error']);
    let model = createModel(recipe.base);
    model.layers[0].name = recipe.base.material;
    let workerSteps = 0;
    for (const [index, step] of recipe.steps.entries()) {
      const p = step.params;
      if (step.command === 'record') {
        // Record is a Workstation/History transaction, not a Process Worker
        // geometry operation. Its actual browser commit is checked separately.
        model.revision++;
        model.processRevision++;
        continue;
      }
      const areaRequest = p.mask
        ? {
            mode: p.area || 'mask',
            maskSourceMode: 'file',
            elements: project.layout.elements.filter((element) =>
              p.mask.layerKeys.includes(`${element.layer}|${element.datatype || 0}`),
            ),
            maskTransform: project.maskTransform,
          }
        : { mode: 'full' };
      let params;
      if (step.command === 'deposit') {
        params = {
          type: 'add',
          name: p.material,
          thickness: p.thicknessUm,
          growth: p.coverage,
          face: p.face,
        };
      } else if (step.command === 'etch') {
        params = {
          type: 'etch',
          etchProfile: p.profile,
          face: p.face,
          thickness: p.thicknessUm,
          etchTargetLayerIds: p.target
            ? model.layers.filter((layer) => layer.name === p.target).map((layer) => layer.id)
            : [],
          ...(p.profile === 'planarize' ? { targetZ: p.thicknessUm } : {}),
          ...(p.profile === 'continuous'
            ? {
                continuousShape: p.continuousShape,
                continuousLateralUm: p.continuousLateralUm,
              }
            : {}),
        };
      } else {
        assert.fail(`Unexpected HBAR physical Recipe command: ${step.command}`);
      }
      const id = index + 1;
      const result = waitForMessage(worker, id, ['done', 'error']);
      worker.postMessage({ id, model, params, areaRequest });
      const response = await result;
      assert.equal(response.validated, true, `Worker validation failed at Step ${id}`);
      assert.equal(response.result?.changed, true, `No physical operation at Step ${id}`);
      model = response.model;
      assert.equal(
        model.regions.length,
        project.snapshotBranches.nodes[index + 1].state.model.regions.length,
        `Worker Step ${id} disagrees with stored History region count`,
      );
      workerSteps++;
    }
    assert.equal(recipe.steps.length, 11);
    assert.equal(workerSteps, 9, 'Record Steps must never execute in Process Worker');
    assert.equal(model.kernel, 'vector-continuous-etch-v1');
    const canonicalOwner = (candidate) => {
      const owner = structuredClone(candidate.continuousEtchOwner);
      for (const layer of owner.sourceModel.layers) delete layer.color;
      return owner;
    };
    assert.deepEqual(canonicalOwner(model), canonicalOwner(project.model));
  } finally {
    await worker.terminate();
  }
});
