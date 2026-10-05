import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertAnnotationKeepsMaterialTopology,
  assertTandemTextureContract,
} from '../../scripts/test-helpers/example-contracts.mjs';

async function readJson(relativeUrl) {
  return JSON.parse(await readFile(new URL(relativeUrl, import.meta.url), 'utf8'));
}

test('Photodetector annotation steps preserve material topology', async () => {
  const project = await readJson('../examples/photodetector-literature-examples.wafercad');
  const checked = assertAnnotationKeepsMaterialTopology(project);
  assert.ok(checked >= 4);
});

test('Fully textured tandem propagates deterministic pyramid profiles through every layer', async () => {
  const project = await readJson(
    '../examples/fully-textured-perovskite-silicon-tandem.wafercad',
  );
  const result = assertTandemTextureContract(project);
  assert.equal(result.backLayerCount, 4);
  assert.equal(result.frontLayerCount, 12);
});
