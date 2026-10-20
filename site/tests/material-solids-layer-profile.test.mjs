import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(
  new URL('../../scripts/perf-material-layer-offline.mjs', import.meta.url),
);
const source = 'fully-textured-perovskite-silicon-tandem';
const layerHash = '0218d70ca139793a45c97fe7ecf01bc267162f8a592c486f7769bf064ab3c0a8';
const fullHash = '932215039f55e0f5942660f2a9895aee55f5f67d348c5956a81df6aabcd6c94f';

function run(...args) {
  return spawnSync(process.execPath, [script, '--example', source, ...args], {
    encoding: 'utf8',
    timeout: 15_000,
  });
}

test('isolated material layers exactly match full derived solids', () => {
  const result = run('--verify');
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.fullVerification.matches, true);
  assert.equal(data.fullVerification.sha256, fullHash);
  assert.ok(data.layers.length > 1);
  assert.ok(data.layers.every((item) => item.elapsedMs >= 0 && item.slabs > 0));
  assert.ok(Number.isFinite(data.peakRssMiB) && data.peakRssMiB > 0);
});

test('selected layer supports pinned receipt and exact full-solids verification', () => {
  const result = run('--layer', 'layer-6', '--expected-sha256', layerHash, '--verify');
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.layers.length, 1);
  assert.equal(data.layers[0].sha256, layerHash);
  assert.equal(data.fullVerification.matches, true);
});

test('wrong receipt and absent layer fail closed without inventing results', () => {
  const badHash = run('--layer', 'layer-6', '--expected-sha256', '0'.repeat(64));
  assert.notEqual(badHash.status, 0);
  assert.match(badHash.stderr, /does not match/);
  const badLayer = run('--layer', 'nonexistent');
  assert.notEqual(badLayer.status, 0);
  assert.match(badLayer.stderr, /Layer is absent/);
});

test('opt-in per-layer Boolean timings preserve pinned geometry and exclude full verification', () => {
  const result = run('--layer', 'layer-6', '--boolean-stats', '--verify');
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.layers[0].sha256, layerHash);
  assert.equal(data.fullVerification.sha256, fullHash);
  assert.ok(data.layers[0].booleanMetrics.union.calls > 0);
  assert.ok(Number.isFinite(data.layers[0].booleanMetrics.union.kernelMs));
  assert.ok(data.layers[0].booleanMetrics.union.maxMs >= 0);
  assert.ok(data.layers[0].slowestBooleanCalls.length > 0);
});
