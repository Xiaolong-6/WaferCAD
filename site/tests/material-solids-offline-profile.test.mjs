import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const profiler = fileURLToPath(
  new URL('../../scripts/perf-material-solids-offline.mjs', import.meta.url),
);
const site = fileURLToPath(new URL('../', import.meta.url));
const example = 'fully-textured-perovskite-silicon-tandem';
const knownHash = '4a26b1caf52414ccf304b94c58c836b4dad5c872b568592df7ccd021b1d88ce2';

function run(...extra) {
  const result = spawnSync(
    process.execPath,
    [profiler, '--site', site, '--example', example, ...extra],
    {
      encoding: 'utf8',
      timeout: 15000,
    },
  );
  if (result.error) throw result.error;
  return { status: result.status, data: JSON.parse(result.stdout) };
}

test('offline profiler retains exact production Surface Plan hash and kernel timings', () => {
  const { status, data } = run('--expected-sha256', knownHash);
  assert.equal(status, 0);
  assert.equal(data.outputSha256, knownHash);
  assert.equal(data.matchesExpected, true);
  assert.ok(data.elapsedMs > 0);
  assert.ok(Number.isFinite(data.gc.observedMs));
  assert.ok(data.kernelMetrics.union.calls > 0);
  assert.ok(data.counts.caps > 0);
});

test('offline profiler fails a mismatched full output hash', () => {
  const { status, data } = run('--expected-sha256', '0'.repeat(64));
  assert.equal(status, 1);
  assert.equal(data.matchesExpected, false);
});

test('material-solids-only mode is a distinct explicit diagnostic', () => {
  const { status, data } = run('--mode', 'solids');
  assert.equal(status, 0);
  assert.equal(data.mode, 'solids');
  assert.ok(data.counts.materials > 0);
  assert.ok(data.counts.slabs > 0);
});
