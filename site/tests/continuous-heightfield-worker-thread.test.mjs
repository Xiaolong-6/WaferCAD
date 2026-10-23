import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Worker } from 'node:worker_threads';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const [{ readProjectFile }, { buildContinuousSiHeightfieldMesh }] = await Promise.all([
  import('../project-io.js'),
  import('../continuous-heightfield-mesh.js'),
]);

// Node's worker_threads adapter executes the exact browser Worker source.
// This validates parallel-thread bytes, not native normal-Origin Chromium.
const workerEntry = new URL('../continuous-heightfield-mesh-worker.js', import.meta.url).href;
const workerBootstrap = `
  const { parentPort } = require('node:worker_threads');
  const { readFileSync } = require('node:fs');
  const { runInNewContext } = require('node:vm');
  const workerUrl = new URL(${JSON.stringify(workerEntry)});
  globalThis.self = globalThis;
  self.location = { href: workerUrl.href, search: workerUrl.search };
  self.importScripts = (relative) => {
    const vendorGlobal = {};
    runInNewContext(readFileSync(new URL(relative, workerUrl), 'utf8'), vendorGlobal);
    self.polygonClipping = vendorGlobal.polygonClipping;
  };
  self.postMessage = (value, transfer) => parentPort.postMessage(value, transfer);
  import(workerUrl.href)
    .then(() => parentPort.on('message', (data) => self.onmessage({ data })))
    .catch((error) => parentPort.postMessage({ id: 1, type: 'error', message: String(error) }));
`;

test('published M08 Si Worker output is byte-identical to canonical sampled display mesh', async () => {
  const project = await readProjectFile(
    new Blob([
      await readFile(
        new URL('../examples/suspended-silica-microdisks-continuous.wafercad', import.meta.url),
      ),
    ]),
  );
  const owner = project.model.continuousEtchOwner;
  assert.ok(owner, 'published M08 must have exact analytical Continuous material');
  const expected = buildContinuousSiHeightfieldMesh(owner, { xyStepUm: 1 });
  const worker = new Worker(workerBootstrap, { eval: true });
  try {
    const response = new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
      worker.once('exit', (code) => {
        if (code !== 0) reject(new Error('Display Worker exited before completion: ' + code));
      });
    });
    worker.postMessage({ id: 1, owner, xyStepUm: 1, maxTriangles: 1200000 });
    const result = await response;
    assert.equal(result.type, 'done', result.message || 'Worker must build actual mesh');
    assert.equal(result.mesh.triangles, expected.triangles);
    assert.deepEqual(
      Buffer.from(result.mesh.positions.buffer),
      Buffer.from(expected.positions.buffer),
      'Worker transferred exact position bytes',
    );
    assert.deepEqual(
      Buffer.from(result.mesh.normals.buffer),
      Buffer.from(expected.normals.buffer),
      'Worker transferred exact normal bytes',
    );
  } finally {
    await worker.terminate();
  }
});
