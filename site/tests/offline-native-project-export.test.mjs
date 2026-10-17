import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { exportValidatedModel } from '../../scripts/offline-native-project-export.mjs';

test('native project exporter uses strict production file validation', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'wafercad-native-export-'));
  try {
    const input = resolve('site/examples/photodetector-literature-examples.wafercad');
    const output = join(folder, 'model.json');
    const result = await exportValidatedModel(input, output);
    const payload = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(result.modelLayerCount, 6);
    assert.equal(result.modelRegionCount, 5);
    assert.equal(payload.schema, 'wafercad-offline-native-model-v1');
    assert.equal(payload.nativeApplicationStateLoaded, false);
    assert.ok(payload.inputSha256.length === 64);
    assert.deepEqual(payload.model.layers.length, 6);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('native project exporter rejects invalid input and does not write a model', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'wafercad-native-export-'));
  try {
    const input = join(folder, 'bad.wafercad');
    const output = join(folder, 'model.json');
    await writeFile(input, '{"format":"invalid"}');
    await assert.rejects(exportValidatedModel(input, output), /Invalid project/);
    await assert.rejects(readFile(output), /ENOENT/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
