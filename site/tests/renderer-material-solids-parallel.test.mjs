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
const {
  splitHeavyMaterialLayer,
  survivingMaterialLayerIds,
  assembleParallelMaterialSolids,
  parallelMaterialSolids,
} = await import('../renderer-material-solids-parallel.js');
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

test('clipped material assembly accepts only the proven surviving layer set', () => {
  const partition = { heavyId: 'film', orderedIds: ['base', 'film', 'passivation'] };
  const film = { layerId: 'film', slabs: [] };
  const base = { layerId: 'base', slabs: [] };
  assert.deepEqual(
    assembleParallelMaterialSolids(partition, [film], [base], { expectedIds: ['base', 'film'] }),
    [base, film],
  );
  assert.deepEqual(
    assembleParallelMaterialSolids(partition, [], [base], { expectedIds: ['base'] }),
    [base],
  );
  assert.deepEqual(assembleParallelMaterialSolids(partition, [], [], { expectedIds: [] }), []);
  assert.throws(() => assembleParallelMaterialSolids(partition, [film], [base]), /incomplete/);
  assert.throws(
    () => assembleParallelMaterialSolids(partition, [film], [], { expectedIds: ['base', 'film'] }),
    /incomplete/,
  );
  assert.throws(
    () => assembleParallelMaterialSolids(partition, [film, film], [], { expectedIds: ['film'] }),
    /duplicate/,
  );
  assert.throws(
    () =>
      assembleParallelMaterialSolids(partition, [film], [base, base], {
        expectedIds: ['film', 'base'],
      }),
    /duplicate/,
  );
  assert.throws(
    () =>
      assembleParallelMaterialSolids(partition, [film], [{ layerId: 'foreign' }], {
        expectedIds: ['film', 'base'],
      }),
    /incomplete/,
  );
  assert.throws(
    () => assembleParallelMaterialSolids(partition, [base], [], { expectedIds: ['base'] }),
    /incomplete/,
  );
  assert.throws(
    () =>
      assembleParallelMaterialSolids(partition, [film], [base], { expectedIds: ['film', 'film'] }),
    /incomplete/,
  );
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

test('unresponsive child worker times out, terminates, and leaves serial ownership intact', async () => {
  const model = largeSimpleModel();
  const expected = materialSolidsFromTopology(model);
  let instance;
  class SilentWorker {
    constructor() {
      instance = this;
    }
    postMessage() {
      // A live child can fail to respond without firing onerror.
    }
    terminate() {
      this.terminated = true;
    }
  }
  const warn = console.warn;
  console.warn = () => {};
  try {
    const start = performance.now();
    const missing = await parallelMaterialSolids(model, null, {
      WorkerClass: SilentWorker,
      hardwareConcurrency: 8,
      deviceMemory: 8,
      childTimeoutMs: 25,
    });
    assert.equal(missing, null, 'no partial geometry may be returned after a timeout');
    assert.equal(instance.terminated, true, 'the timed-out child must be terminated');
    assert.ok(performance.now() - start < 2_000, 'timeout cannot hang the parent');
    // This is exactly what the production Surface Plan worker does on null.
    assert.deepEqual(materialSolidsFromTopology(model), expected);
  } finally {
    console.warn = warn;
  }
});

test('worker constructor failure falls back without publishing partial solids', async () => {
  const model = largeSimpleModel();
  const warn = console.warn;
  console.warn = () => {};
  class BrokenWorker {
    constructor() {
      throw new Error('worker unavailable');
    }
  }
  try {
    assert.equal(
      await parallelMaterialSolids(model, null, {
        WorkerClass: BrokenWorker,
        hardwareConcurrency: 8,
        deviceMemory: 8,
      }),
      null,
    );
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

test('ROI can remove one or all material layers without triggering serial fallback', async () => {
  const { rectMulti } = await import('../vector-geometry.js');
  const model = largeSimpleModel();
  for (const region of model.regions) {
    region.geom = rectMulti(3, 3, region.stack[0].layerId === 'film' ? -5 : 5, 0);
  }
  const partition = splitHeavyMaterialLayer(model, 8, 8);
  assert.ok(partition);
  for (const [name, clip, expected] of [
    ['heavy-only', rectMulti(4, 4, -5, 0), ['film']],
    ['other-only', rectMulti(4, 4, 5, 0), ['base']],
    ['empty', rectMulti(4, 4, 35, 0), []],
  ]) {
    const heavy = materialSolidsFromTopology(partition.heavy, clip);
    const other = materialSolidsFromTopology(partition.other, clip);
    const survivingIds = survivingMaterialLayerIds(model, clip);
    assert.deepEqual(survivingIds, expected, name + ' clipped layer ordering');
    const combined = assembleParallelMaterialSolids(partition, heavy, other, {
      expectedIds: survivingIds,
    });
    const serial = materialSolidsFromTopology(model, clip);
    assert.deepEqual(
      combined.map((item) => item.layerId),
      expected,
      name,
    );
    assert.equal(hash(combined), hash(serial), name);
    const render = buildRenderSurfacePlan(structuredClone(model), clip, combined);
    const reference = buildRenderSurfacePlan(model, clip);
    assert.equal(hash(render), hash(reference), name + ' Surface Plan');
  }
  // Exercise the actual asynchronous branch, not just its assembly helper.
  class RoiWorker {
    postMessage({ model: heavyModel, clip }) {
      const solids = materialSolidsFromTopology(heavyModel, clip);
      queueMicrotask(() => this.onmessage({ data: { id: 1, type: 'done', solids } }));
    }
    terminate() {
      this.terminated = true;
    }
  }
  const clip = rectMulti(4, 4, 5, 0);
  const result = await parallelMaterialSolids(model, clip, {
    WorkerClass: RoiWorker,
    hardwareConcurrency: 8,
    deviceMemory: 8,
  });
  assert.ok(result, 'ROI must not discard valid parallel solids');
  assert.equal(hash(result), hash(materialSolidsFromTopology(model, clip)));
});

test('mixed ROI first surviving material reorders even when all layers remain', async () => {
  const { rectMulti } = await import('../vector-geometry.js');
  const model = largeSimpleModel();
  // The first film Region is entirely clipped. All subsequent base Regions
  // precede the later surviving film Regions in the *clipped* input.
  const firstFilm = model.regions[0];
  const otherFilm = model.regions.slice(1, 480);
  const base = model.regions.slice(480);
  model.regions = [firstFilm, ...base, ...otherFilm];
  for (const region of model.regions) {
    region.geom = rectMulti(3, 3, region === firstFilm ? -5 : 5, 0);
  }
  const clip = rectMulti(4, 4, 5, 0);
  const partition = splitHeavyMaterialLayer(model, 8, 8);
  assert.ok(partition, 'must use actual eligible parallel workload');
  assert.deepEqual(partition.orderedIds, ['film', 'base']);
  const expectedIds = survivingMaterialLayerIds(model, clip);
  assert.deepEqual(expectedIds, ['base', 'film']);
  const serialSolids = materialSolidsFromTopology(model, clip);
  assert.deepEqual(
    serialSolids.map((item) => item.layerId),
    expectedIds,
  );
  const heavy = materialSolidsFromTopology(partition.heavy, clip);
  const other = materialSolidsFromTopology(partition.other, clip);
  const combined = assembleParallelMaterialSolids(partition, heavy, other, { expectedIds });
  assert.equal(hash(combined), hash(serialSolids));
  assert.equal(
    hash(buildRenderSurfacePlan(structuredClone(model), clip, combined)),
    hash(buildRenderSurfacePlan(structuredClone(model), clip)),
    'complete Surface Plan, including solidIndex, is byte-identical',
  );
  class SimulatedWorker {
    postMessage({ model: childModel, clip: childClip }) {
      const solids = materialSolidsFromTopology(childModel, childClip);
      queueMicrotask(() => this.onmessage({ data: { id: 1, type: 'done', solids } }));
    }
    terminate() {
      this.terminated = true;
    }
  }
  const actual = await parallelMaterialSolids(model, clip, {
    WorkerClass: SimulatedWorker,
    hardwareConcurrency: 8,
    deviceMemory: 8,
  });
  assert.equal(hash(actual), hash(serialSolids));
  class PartialWorker extends SimulatedWorker {
    postMessage() {
      queueMicrotask(() => this.onmessage({ data: { id: 1, type: 'done', solids: [] } }));
    }
  }
  const warn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(
      await parallelMaterialSolids(model, clip, {
        WorkerClass: PartialWorker,
        hardwareConcurrency: 8,
        deviceMemory: 8,
      }),
      null,
      'incomplete done payload must trigger full serial recomputation in Surface Plan worker',
    );
  } finally {
    console.warn = warn;
  }
});
