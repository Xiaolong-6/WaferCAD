// Release-only strict attestation of immutable bundled example files.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { BUNDLED_EXAMPLES } from '../site/bundled-examples.js';
import { readProjectFile } from '../site/project-io.js';
import { CURRENT_PROJECT_VERSION } from '../site/project-schema.js';
import { loadGeometryKernel } from './process-benchmarks.mjs';

export async function buildBundledIntegrity({ source = resolve('site'), destination = source } = {}) {
  await loadGeometryKernel();
  const entries = {};
  for (const example of BUNDLED_EXAMPLES) {
    entries[example.id] = {};
    for (const [index, asset] of [example, example.previewProject].filter(Boolean).entries()) {
      assert.match(asset.path, /^\.\/examples\/[a-z0-9/.-]+\.wafercad$/);
      const bytes = await readFile(join(source, asset.path.slice(2)));
      const project = await readProjectFile({
        name: asset.filename,
        size: bytes.length,
        text: async () => bytes.toString('utf8'),
      });
      assert.equal(project.version, CURRENT_PROJECT_VERSION, `${example.id}: migration required`);
      assert.ok(project.model && project.layout, `${example.id}: missing geometry`);
      entries[example.id][index === 0 ? 'full' : 'preview'] = {
        path: asset.path,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    }
  }
  const manifest = { format: 'wafercad-validated-bundled-v1', entries };
  await writeFile(join(destination, 'examples/bundled-integrity.json'),
    JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(JSON.stringify(await buildBundledIntegrity(), null, 2));
