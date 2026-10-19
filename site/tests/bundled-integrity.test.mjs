import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readProjectFile } from '../project-io.js';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const bytes = await readFile(new URL('../examples/previews/tio2-metalens-four-unit.wafercad', import.meta.url));
const hash = createHash('sha256').update(bytes).digest('hex');
const file = (value) => ({
  name: 'metalens.wafercad', size: value.length,
  text: async () => value.toString('utf8'),
  arrayBuffer: async () => Uint8Array.from(value).buffer,
});

test('attested bundled reader matches strict project data', async () => {
  const strict = await readProjectFile(file(bytes));
  const trusted = await readProjectFile(file(bytes), { trustedBundledExample: { sha256: hash } });
  assert.deepEqual(trusted, strict);
});
test('changed content cannot reuse a strict publication receipt', async () => {
  const modified = Buffer.from(bytes);
  modified[30] ^= 1;
  await assert.rejects(readProjectFile(file(modified), { trustedBundledExample: { sha256: hash } }),
    /integrity verification failed/);
  await assert.rejects(readProjectFile(file(bytes), { trustedBundledExample: { sha256: 'invalid' } }),
    /Invalid bundled integrity receipt/);
});
