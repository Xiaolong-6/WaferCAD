import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { createModel } = await import('../model.js');
const { materialSolidsFromTopology } = await import('../process-topology.js');
const { buildRenderSurfacePlan } = await import('../renderer-geometry.js');
const { expandProjectStorage } = await import('../project-io.js');
const { migrateProjectFile } = await import('../project-schema.js');
const { splitHeavyMaterialLayer, assembleParallelMaterialSolids, parallelMaterialSolids } =
  await import('../renderer-material-solids-parallel.js');
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function largeSimpleModel() {
  const model = createModel({ shape: 'rect', width: 20, height: 20, thickness: 5 });
  model.layers.push({ id: 'film', name: 'Film', color: '#999999' });
  const geometry = model.regions[0].geom;
  model.regions = Array.from({ length: 850 }, (_, i) => ({
    id: `region-${i + 1}`,
    geom: geometry,
    stack: [{ layerId: i < 480 ? 'film' : 'base', z0: i < 480 ? 3 : -2.5, z1: i < 480 ? 4 : 2.5 }],
  }));
  return model;
}

test('parallel splitting respects memory/CPU bounds and preserves layer, region and XY/Z order', () => {
  const model = largeSimpleModel();
  assert.equal(splitHeavyMaterialLayer(model, 3, 8), null);
  assert.equal(splitHeavyMaterialLayer(model, 8, 4), null);
  assert.equal(splitHeavyMaterialLayer(model, 8, undefined), null);
  assert.equal(splitHeavyMaterialLayer(createModel(), 8, 8), null);
  const split = splitHeavyMaterialLayer(model, 8, 8);
  assert.equal(split.heavyId, 'film');
  assert.deepEqual(split.orderedIds, ['film', 'base']);
  assert.equal(split.heavy.regions.length, 480);
  assert.equal(split.other.regions.length, 370);
  assert.equal(split.heavy.regions[0].geom, model.regions[0].geom);
  assert.equal(split.heavy.regions[0].stack[0].z0, 3);
  assert.equal(model.regions[0].stack[0].layerId, 'film', 'partitioning must be read-only');
});

test('parallel result assembly reorders by original material order and rejects missing/extra results', () => {
  const partition = { heavyId: 'film', orderedIds: ['base', 'film'] };
  const heavy = [{ layerId: 'film', slabs: [] }];
  const other = [{ layerId: 'base', slabs: [] }];
  assert.deepEqual(assembleParallelMaterialSolids(partition, heavy, other), [other[0], heavy[0]]);
  assert.throws(() => assembleParallelMaterialSolids(partition, [], other), /incomplete/);
  assert.throws(
    () => assembleParallelMaterialSolids(partition, heavy, [...other, other[0]]),
    /duplicate/,
  );
  assert.throws(() => assembleParallelMaterialSolids(partition, heavy, []), /incomplete/);
});

test('worker branch returns exact serial solids and terminates child; worker error falls back to serial', async () => {
  const model = largeSimpleModel();
  let instances = [];
  class HealthyWorker {
    constructor(url) {
      assert.match(url.pathname, /renderer-material-solids-worker\.js$/);
      instances.push(this);
    }
    postMessage({ id, model: heavyModel }) {
      assert.equal(id, 1);
      const solids = materialSolidsFromTopology(heavyModel);
      queueMicrotask(() => this.onmessage({ data: { id: 1, type: 'done', solids } }));
    }
    terminate() {
      this.terminated = true;
    }
  }
  const expected = materialSolidsFromTopology(model);
  const result = await parallelMaterialSolids(model, null, {
    WorkerClass: HealthyWorker,
    hardwareConcurrency: 8,
    deviceMemory: 8,
  });
  assert.deepEqual(result, expected);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].terminated, true);
  class FailedWorker extends HealthyWorker {
    postMessage() {
      queueMicrotask(() =>
        this.onmessage({ data: { id: 1, type: 'error', message: 'no memory' } }),
      );
    }
  }
  const warn = console.warn;
  console.warn = () => {};
  try {
    const failed = await parallelMaterialSolids(model, null, {
      WorkerClass: FailedWorker,
      hardwareConcurrency: 8,
      deviceMemory: 8,
    });
    assert.equal(failed, null);
    assert.equal(instances.at(-1).terminated, true);
  } finally {
    console.warn = warn;
  }
});

test('complete saved M3D partition reconstructs bit-exact solids and Surface Plan', async () => {
  const bytes = await readFile(
    new URL('../examples/m3d-selfpowered-full-replay.wafercad', import.meta.url),
  );
  const model = migrateProjectFile(expandProjectStorage(JSON.parse(bytes.toString('utf8')))).model;
  const split = splitHeavyMaterialLayer(model, 8, 8);
  assert.ok(split && split.heavy.regions.length >= 256);
  assert.equal(split.heavyId, 'layer-26', 'must isolate the dominant multi-slab material');
  const heavy = materialSolidsFromTopology(split.heavy);
  const other = materialSolidsFromTopology(split.other);
  const combined = assembleParallelMaterialSolids(split, heavy, other);
  assert.equal(hash(combined), '69fdea6177a325303be406bbc6cd1a5ece575a581114754d789180a87e679ea6');
  const plan = buildRenderSurfacePlan(model, null, combined);
  assert.equal(hash(plan), '352edd7b0cc5e3d476d279c0e408b1b9d25e8a77ee83fd2acb2973f6dfe6fad6');
});
