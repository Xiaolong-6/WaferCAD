import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { loadBundledProject } = await import('../ui-v2/workstation-runtime.js');
const { BUNDLED_EXAMPLES } = await import('../bundled-examples.js');
const example = BUNDLED_EXAMPLES.find((item) => item.id === 'tio2-metalens-four-unit');
const raw = await readFile(
  new URL('../examples/previews/tio2-metalens-four-unit.wafercad', import.meta.url),
);
const hash = createHash('sha256').update(raw).digest('hex');
const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const originalFetch = globalThis.fetch;

const installFetch = ({ receipt = true, valid = true } = {}) => {
  const requests = [];
  globalThis.fetch = async (url) => {
    const path = String(url);
    requests.push(path);
    if (path.includes('build-info.json')) return { ok: false };
    if (path.includes('bundled-integrity.json'))
      return receipt
        ? {
            ok: true,
            json: async () => ({
              format: 'wafercad-validated-bundled-v1',
              entries: {
                [example.id]: {
                  preview: {
                    path: example.previewProject.path,
                    bytes: bytes.byteLength,
                    sha256: valid ? hash : '0'.repeat(64),
                  },
                },
              },
            }),
          }
        : { ok: false };
    if (path.includes('tio2-metalens-four-unit.wafercad'))
      return { ok: true, arrayBuffer: async () => bytes };
    throw new Error('unexpected fetch: ' + path);
  };
  return requests;
};

test('matching receipt opts into bundled fast read and keeps digest stable', async () => {
  const requests = installFetch();
  try {
    const options = [];
    const result = await loadBundledProject(
      example.id,
      async (file, opts) => {
        options.push(opts);
        return { ok: file.name };
      },
      { preview: true },
    );
    assert.deepEqual(options, [{ trustedBundledExample: { sha256: hash } }]);
    assert.equal(result.hash, hash);
    assert.ok(requests.some((url) => url.includes('bundled-integrity.json')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('explicit strict developer path never fetches or uses release receipts', async () => {
  const requests = installFetch();
  try {
    const options = [];
    await loadBundledProject(
      example.id,
      async (_file, opts) => {
        options.push(opts);
        return { ok: true };
      },
      { preview: true, strict: true },
    );
    assert.deepEqual(options, [{}]);
    assert.equal(
      requests.some((url) => url.includes('bundled-integrity.json')),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('missing attestation falls back to strict reader', async () => {
  installFetch({ receipt: false });
  try {
    const options = [];
    await loadBundledProject(
      example.id,
      async (_file, opts) => {
        options.push(opts);
        return { ok: true };
      },
      { preview: true },
    );
    assert.deepEqual(options, [{}]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mismatched attestation rejects before the project reader', async () => {
  installFetch({ valid: false });
  try {
    let called = false;
    await assert.rejects(
      loadBundledProject(
        example.id,
        async () => {
          called = true;
          return { ok: true };
        },
        { preview: true },
      ),
      /integrity mismatch/,
    );
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
