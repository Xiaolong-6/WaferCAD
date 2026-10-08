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

function processRecipeSignature(operation) {
  if (operation?.kind === 'record') {
    return {
      kind: operation.kind,
      processType: operation.processType ?? null,
      temperatureC: operation.temperatureC ?? null,
      durationMin: operation.durationMin ?? null,
      ambient: operation.ambient ?? null,
      note: operation.note ?? null,
    };
  }
  const replay = structuredClone(operation?.replay ?? null);
  if (replay?.params?.growth === 'transfer' && !replay.params.transferMode)
    replay.params.transferMode = 'follow';
  return {
    kind: operation?.kind ?? null,
    replay,
  };
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
  assert.deepEqual(
    project.snapshotBranches.nodes.slice(0, 22).map((node) => processRecipeSignature(node.operation)),
    original.snapshotBranches.nodes.map((node) => processRecipeSignature(node.operation)),
    'Current full replay preserves the approved tier-1/tier-2 process recipe without requiring historical node/state identity',
  );
  assert.deepEqual(project.selectedLayerKeys, ['10|0', '11|0', '12|0', '13|0']);
});

test('Native full-wafer Fig3 retains the verified 625-site recipe and all recorded Steps', async () => {
  const { readProjectFile } = await import('../project-io.js');
  const { pointInMulti } = await import('../vector-geometry.js');
  const text = await readFile(
    new URL('../examples/three-tier-silicon-jlfets-full-wafer.wafercad', import.meta.url),
    'utf8',
  );
  const project = await readProjectFile({ size: Buffer.byteLength(text), text: async () => text });
  assert.deepEqual(assertNativeFig3Contract(project, pointInMulti), {
    tiers: 3,
    nativeConformalGates: 3,
    nativeConformalLiners: 2,
    steps: 40,
  });
  assert.equal(project.snapshots.length, 5);
});
