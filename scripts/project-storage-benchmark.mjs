import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import { expandProjectStorage, readProjectFile, serializeProject } from '../site/project-io.js';
import { migrateProjectFile } from '../site/project-schema.js';

const [
  sourcePath,
  outputPath,
  reportPath = 'test-results/project-io/storage-benchmark.json',
  legacyOutputPath,
] = process.argv.slice(2);
if (!sourcePath || !outputPath)
  throw new Error(
    'Usage: node scripts/project-storage-benchmark.mjs input.wafercad[.br] output.wafercad [report.json] [legacy-output.wafercad]',
  );
await loadGeometryKernel();
const fixtureBytes = await readFile(resolve(sourcePath));
const sourceBytes = sourcePath.endsWith('.br') ? brotliDecompressSync(fixtureBytes) : fixtureBytes;
if (legacyOutputPath) await writeFile(resolve(legacyOutputPath), sourceBytes);
const original = migrateProjectFile(expandProjectStorage(JSON.parse(sourceBytes)));
const exportStarted = performance.now();
const text = serializeProject(original);
const exportMs = performance.now() - exportStarted;
const importStarted = performance.now();
const loaded = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
const importMs = performance.now() - importStarted;
assert.deepStrictEqual(loaded, original);
await writeFile(resolve(outputPath), text);
const report = {
  sourceBytes: sourceBytes.length,
  outputBytes: Buffer.byteLength(text),
  exportMs,
  importMs,
  entireProjectEqual: true,
  steps: loaded.snapshotBranches?.nodes?.length || 0,
  bookmarks: loaded.snapshots?.length || 0,
  uniqueGeometries: JSON.parse(text).sharedGeometries.length,
};
await writeFile(resolve(reportPath), JSON.stringify(report, null, 2));
console.log('STORAGE_ROUNDTRIP', JSON.stringify(report));
