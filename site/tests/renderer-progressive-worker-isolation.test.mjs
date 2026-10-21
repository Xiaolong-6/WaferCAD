import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the actual classic Worker entrypoint with only its import boundary
// replaced by deterministic modules. This checks preview failure isolation,
// not a mocked reimplementation of the Worker onmessage handler.
function workerHarness({ makePreview, throwOnPreviewTransfer = false, makeExact } = {}) {
  const source = readFileSync(
    new URL('../renderer-surface-plan-worker.js', import.meta.url),
    'utf8',
  ).replace(/\bimport\(/g, 'loadModule(');
  const posted = [];
  const warnings = [];
  const exact = { caps: [{ layerId: 'exact' }], sidewalls: [{ layerId: 'exact' }] };
  const self = {
    location: { href: 'https://wafercad.local/renderer-surface-plan-worker.js', search: '' },
    importScripts() {},
    postMessage(packet, transfers) {
      if (throwOnPreviewTransfer && packet.type === 'preview') {
        throw new Error('Preview transferable buffer rejected');
      }
      posted.push({ packet, transfers });
    },
  };
  const context = {
    self,
    URL,
    setTimeout,
    console: { warn: (...args) => warnings.push(args) },
    loadModule: (url) => {
      if (url.includes('renderer-progressive-preview.js')) {
        return Promise.resolve({
          buildProgressiveSurfacePreview: makePreview || (() => null),
        });
      }
      if (url.includes('renderer-surface-plan-stream.js')) {
        return Promise.resolve({ shouldStreamSurfacePlan: () => false });
      }
      if (url.includes('renderer-geometry.js')) {
        return Promise.resolve({ buildRenderSurfacePlan: makeExact || (() => exact) });
      }
      throw new Error('Unexpected Worker import: ' + url);
    },
  };
  vm.runInNewContext(source, context, { filename: 'renderer-surface-plan-worker.js' });
  return { self, posted, warnings, exact };
}

const request = { data: { id: 1, action: 'surface-plan', preview: true, model: {} } };

test('preview generation failure cannot abort the authoritative exact Surface Plan', async () => {
  const worker = workerHarness({
    makePreview: () => {
      throw new Error('sketch failure');
    },
  });
  await worker.self.onmessage(request);
  assert.deepEqual(
    worker.posted.map(({ packet }) => packet.type),
    ['done'],
  );
  assert.strictEqual(worker.posted[0].packet.plan, worker.exact);
  assert.equal(worker.warnings.length, 1);
});

test('preview structured-clone/transfer failure cannot abort exact ownership', async () => {
  const worker = workerHarness({
    makePreview: () => ({ borderPositions: new Float32Array(6), caps: [] }),
    throwOnPreviewTransfer: true,
  });
  await worker.self.onmessage(request);
  assert.deepEqual(
    worker.posted.map(({ packet }) => packet.type),
    ['done'],
  );
  assert.strictEqual(worker.posted[0].packet.plan, worker.exact);
  assert.equal(worker.warnings.length, 1);
});

test('normal preview precedes exact, and a real exact error still surfaces', async () => {
  const success = workerHarness({
    makePreview: () => ({ borderPositions: new Float32Array(6), caps: [] }),
  });
  await success.self.onmessage(request);
  assert.deepEqual(
    success.posted.map(({ packet }) => packet.type),
    ['preview', 'done'],
  );
  assert.equal(success.posted[0].transfers.length, 1);
  const failure = workerHarness({
    makeExact: () => {
      throw new Error('ownership failure');
    },
  });
  await failure.self.onmessage(request);
  assert.deepEqual(
    failure.posted.map(({ packet }) => packet.type),
    ['error'],
  );
  assert.equal(failure.posted[0].packet.message, 'ownership failure');
});
