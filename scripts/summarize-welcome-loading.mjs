// Assemble independently measured, source-pinned Welcome Example baseline shards.
// No guessed timings and no missing/shard-failed samples are accepted.
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dir = resolve(process.argv[2] || 'test-results/welcome-load-baseline');
const names = (await readdir(dir)).filter((name) => /^shard-\d+-of-\d+\.json$/.test(name)).sort();
assert.ok(names.length > 0, 'No baseline shards available');
const shards = await Promise.all(
  names.map(async (name) => JSON.parse(await readFile(resolve(dir, name), 'utf8'))),
);
const expectedCatalog = shards[0].catalogIds;
const expectedSamples = shards[0].samplesPerProject;
const shardCount = shards[0].shard.count;
const source = shards[0].sourceSha;
assert.equal(names.length, shardCount, 'Some benchmark shards are missing');
const seenShards = new Set();
const samples = [];
for (const shard of shards) {
  assert.equal(shard.schema, 'wafercad-welcome-loading-v1');
  assert.equal(shard.scope, 'all-shipped-welcome');
  assert.equal(shard.sourceSha, source, 'Shards used different source revisions');
  assert.deepEqual(shard.catalogIds, expectedCatalog, 'Welcome catalog changed between shards');
  assert.equal(shard.samplesPerProject, expectedSamples);
  assert.equal(shard.shard.count, shardCount);
  assert.ok(!seenShards.has(shard.shard.index), 'Duplicate shard index');
  seenShards.add(shard.shard.index);
  samples.push(...shard.samples);
}
assert.equal(samples.length, expectedCatalog.length * expectedSamples, 'Missing or extra samples');
assert.ok(
  samples.every((sample) => sample.status === 'pass'),
  'At least one sample failed',
);
const measures = [
  ['workstationReadyMs', (s) => s.workstationReadyMs],
  ['projectReadyMs', (s) => s.projectReadyMs],
  ['workerTotalMs', (s) => s.worker?.elapsedMs],
  ['workerModuleLoadMs', (s) => s.worker?.timingsMs?.moduleLoad],
  ['workerParseMs', (s) => s.worker?.timingsMs?.parse],
  ['workerExpandMs', (s) => s.worker?.timingsMs?.expand],
  ['workerMigrationValidationMs', (s) => s.worker?.timingsMs?.migrationAndValidation],
  ['postWorkerToSnapshotMs', (s) => s.worker?.doneToSnapshotMs],
  ['threeReadyMs', (s) => s.threeReadyMs],
  ['threeTopologyMs', (s) => s.threeScene?.metrics?.rendererTopologyMs],
  ['threeSmoothCapsMs', (s) => s.threeScene?.metrics?.rendererSmoothCapsMs],
  ['threeSidewallsMs', (s) => s.threeScene?.metrics?.rendererSidewallsMs],
  ['threeAssemblyMs', (s) => s.threeScene?.metrics?.rendererAssemblyMs],
  ['threeRoughMs', (s) => s.threeScene?.metrics?.rendererRoughMs],
  ['navigationToThreeMs', (s) => s.navigationToThreeMs],
  ['warmMainMs', (s) => s.warmViewsMs?.main],
  ['warmMaskMs', (s) => s.warmViewsMs?.mask],
  ['warmSectionMs', (s) => s.warmViewsMs?.section],
];
const median = (values) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const numeric = (value) => Number.isFinite(value);
const summary = expectedCatalog.map((id) => {
  const subset = samples.filter((sample) => sample.id === id);
  assert.equal(subset.length, expectedSamples, `${id}: incomplete repetitions`);
  assert.deepEqual(
    subset.map((sample) => sample.repeat).sort((a, b) => a - b),
    Array.from({ length: expectedSamples }, (_, index) => index + 1),
    `${id}: repetition mismatch`,
  );
  assert.equal(
    new Set(subset.map((sample) => sample.inputSha256)).size,
    1,
    `${id}: saved project changed between repeats`,
  );
  assert.equal(new Set(subset.map((sample) => sample.bytes)).size, 1);
  assert.ok(
    subset.every((sample) => sample.threeScene?.metrics?.sceneVisibleObjectCount > 0),
    `${id}: a 3D scene is blank`,
  );
  const stats = Object.fromEntries(
    measures.map(([key, get]) => {
      const values = subset.map(get);
      if (values.some((value) => !numeric(value))) return [key, null];
      return [
        key,
        {
          median: +median(values).toFixed(1),
          min: +Math.min(...values).toFixed(1),
          max: +Math.max(...values).toFixed(1),
          samples: values.map((value) => +value.toFixed(1)),
        },
      ];
    }),
  );
  return {
    id,
    bytes: subset[0].bytes,
    sha256: subset[0].inputSha256,
    visible3dObjects: subset.map((sample) => sample.threeScene.metrics.sceneVisibleObjectCount),
    stats,
  };
});
const report = {
  schema: 'wafercad-welcome-loading-summary-v1',
  sourceSha: source,
  sampleCount: samples.length,
  examples: summary.length,
  repeats: expectedSamples,
  method:
    'fresh Chromium process per sample; OS caches not purged; warm Main/Mask/Section after 3D',
  summary,
};
const cols = ['id', 'bytes', ...measures.map(([key]) => key)];
const csv =
  [
    cols.join(','),
    ...summary.map((entry) =>
      [entry.id, entry.bytes, ...measures.map(([key]) => entry.stats[key]?.median ?? 'NA')].join(
        ',',
      ),
    ),
  ].join('\n') + '\n';
const md = [
  '# WaferCAD Welcome Example loading baseline',
  '',
  `- Source revision: \`${source}\``,
  `- Projects: ${summary.length}; independent Chromium samples: ${samples.length} (${expectedSamples} per example)`,
  '- Statistics: median, min and max of raw recorded milliseconds; all nine input SHA-256 values pinned.',
  '- This is **process-cold**, not OS-cache-cold; browser startup is excluded from navigation-to-3D.',
  '- Main/Mask/Section are **warm inspection timings after completed 3D**; do not compare them to cold 3D.',
  '- Browser workers report module loading, JSON parsing, expansion, and migration/validation from inside the real project Worker.',
  '',
  '| Example | Open median | Worker median | 3D median | Topology median | Smooth caps median | Navigation → 3D |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...summary.map((s) => {
    const fmt = (key) =>
      s.stats[key] ? `${s.stats[key].median.toFixed(0)} ms` : 'not instrumented';
    return `| ${s.id} | ${fmt('projectReadyMs')} | ${fmt('workerTotalMs')} | ${fmt('threeReadyMs')} | ${fmt('threeTopologyMs')} | ${fmt('threeSmoothCapsMs')} | ${fmt('navigationToThreeMs')} |`;
  }),
  '',
  'Raw per-run data and screenshots are in the same workflow artifacts. These are diagnostic timings, not scientific acceptance or cross-device SLA promises.',
  '',
].join('\n');
await writeFile(resolve(dir, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(dir, 'summary.csv'), csv);
await writeFile(resolve(dir, 'summary.md'), md);
console.log(md);