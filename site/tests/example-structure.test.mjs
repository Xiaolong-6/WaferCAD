import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { brotliDecompressSync } from 'node:zlib';
import {
  assertAnnotationKeepsMaterialTopology,
  assertTandemTextureContract,
  assertNativeFig3Contract,
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
  const project = await readJson('../examples/fully-textured-perovskite-silicon-tandem.wafercad');
  const result = assertTandemTextureContract(project);
  assert.equal(result.backLayerCount, 4);
  assert.equal(result.frontLayerCount, 12);
});

test('Native three-tier Fig3 preserves gates, contact windows, isolation, CMP and History', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const { pointInMulti } = await import('../vector-geometry.js');
  const { expandProjectStorage } = await import('../project-io.js');
  const project = expandProjectStorage(
    await readJson('../examples/three-tier-silicon-jlfets.wafercad'),
  );
  assert.deepEqual(assertNativeFig3Contract(project, pointInMulti), {
    tiers: 3,
    nativeConformalGates: 3,
    nativeConformalLiners: 2,
    steps: 40,
  });
  assert.equal(assertAnnotationKeepsMaterialTopology(project), 3);
  const original = expandProjectStorage(
    JSON.parse(
      brotliDecompressSync(
        await readFile(
          new URL(
            '../../tests/fixtures/native-fig3/tier2-before-gate.wafercad.br',
            import.meta.url,
          ),
        ),
      ),
    ),
  );
  assert.deepEqual(project.snapshotBranches.nodes.slice(0, 22), original.snapshotBranches.nodes);
  assert.deepEqual(project.selectedLayerKeys, ['10|0', '11|0', '12|0', '13|0']);
});
