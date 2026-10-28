import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const SCRIPT = 'scripts/transmon-q2-acceptance.mjs';
const invoke = (...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 10_000 });

test('Q2 acceptance reports help without trying to download source data', () => {
  const result = invoke('--help');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--gds ORIGINAL_SAMPLE_GDS/);
});

test('Q2 acceptance rejects absent original GDS instead of reporting skipped tests', () => {
  const result = invoke('--gds', join(tmpdir(), 'wafercad-absent-author-q2.gds'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Original author GDS is absent/);
  assert.doesNotMatch(result.stdout, /science-gates-passed/);
});

test('Q2 acceptance rejects non-author GDS by SHA-256 before running replay', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'wafercad-author-q2-'));
  try {
    const fixture = join(folder, 'sample.gds');
    await writeFile(fixture, 'not the original Tuokkola author GDS');
    const result = invoke('--gds', fixture, '--output-dir', folder);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Original GDS SHA-256 mismatch/);
    assert.doesNotMatch(result.stdout, /science-gates-passed/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('Q2 acceptance fails on unknown or incomplete flags', () => {
  for (const flags of [[], ['--gds'], ['--gds', 'a', '--unknown', 'b']]) {
    const result = invoke(...flags);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--gds|Expected/);
  }
});
