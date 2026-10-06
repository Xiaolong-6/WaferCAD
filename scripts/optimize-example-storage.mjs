import assert from 'node:assert/strict';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { loadGeometryKernel } from './process-benchmarks.mjs';
import {
  expandProjectStorage,
  prepareProjectForWorkspaceStorage,
  readProjectFile,
} from '../site/project-io.js';
import { migrateProjectFile } from '../site/project-schema.js';
await loadGeometryKernel();
const apply = process.argv.includes('--write');
const output = 'test-results/example-storage';
await mkdir(join(output, 'before'), { recursive: true });
const reports = [];
for (const directory of ['site/examples', 'examples/projects']) {
  for (const file of (await readdir(directory))
    .filter((name) => name.endsWith('.wafercad'))
    .sort()) {
    const path = join(directory, file),
      source = await readFile(path);
    // JSON has one zero representation; normalize signed zeros without rounding coordinates.
    const expected = JSON.parse(
      JSON.stringify(migrateProjectFile(expandProjectStorage(JSON.parse(source)))),
    );
    const start = performance.now(),
      packed = prepareProjectForWorkspaceStorage(expected),
      text = JSON.stringify(packed);
    const packMs = performance.now() - start,
      importStart = performance.now();
    const actual = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
    const importMs = performance.now() - importStart;
    assert.deepStrictEqual(
      JSON.parse(JSON.stringify(actual)),
      expected,
      `${path}: every state and metadata field must survive`,
    );
    const report = {
      path,
      beforeBytes: source.length,
      afterBytes: Buffer.byteLength(text),
      packMs,
      importMs,
      geometries: packed.sharedGeometries.length,
      steps: expected.snapshotBranches?.nodes?.length || 0,
      bookmarks: expected.snapshots?.length || 0,
      variants: expected.snapshotBranches?.branches?.length || 0,
      entireNormalizedProjectEqual: true,
    };
    reports.push(report);
    if (apply && report.afterBytes < report.beforeBytes) {
      const backup = join(output, 'before', basename(path));
      try {
        assert.deepStrictEqual(await readFile(backup), source);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await writeFile(backup, source, { flag: 'wx' });
      }
      await writeFile(path, text);
    }
    console.log('EXAMPLE_STORAGE', JSON.stringify(report));
  }
}
await writeFile(
  join(output, 'validation.json'),
  JSON.stringify({ applied: apply, reports }, null, 2),
);
