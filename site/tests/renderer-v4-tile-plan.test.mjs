import assert from 'node:assert/strict';
import test from 'node:test';
import { observeAdaptiveArrayTiles } from '../renderer-v4-adaptive-tiles.js';
import {
  buildAdaptiveTilePlan,
  createAdaptiveTilePlanCache,
  observePreparedAdaptiveTiles,
} from '../renderer-v4-tile-plan.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const perspectiveNear = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0];
const source = (count = 128, offset = 0) => [
  {
    layerId: 'buried-oxide',
    buried: true,
    instanceTranslations: Array.from({ length: count }, (_, index) => [
      offset + (index % 16) * 0.00001,
      Math.floor(index / 16) * 0.00001,
    ]),
    parts: [
      { p: [0, 0], q: [0.002, 0], z0: 0, z1: 0.002 },
      { p: [0.002, 0], q: [0.002, 0.002], z0: 0, z1: 0.002 },
    ],
  },
];
const view = {
  viewProjectionMatrix: identity,
  viewportWidth: 200,
  viewportHeight: 200,
  farTier: true,
};

test('R2 prepared tiles reproduce R1 observable footprint classification without changing source', () => {
  const owners = source();
  const original = structuredClone(owners);
  const plan = buildAdaptiveTilePlan(owners);
  const oldResult = observeAdaptiveArrayTiles(owners, view);
  const newResult = observePreparedAdaptiveTiles(plan, view);
  assert.equal(plan.valid, true);
  assert.deepEqual(owners, original);
  assert.equal(plan.tiles.length, 2);
  for (const field of [
    'tiles',
    'owners',
    'farTiles',
    'midTiles',
    'nearTiles',
    'uncertainTiles',
    'offscreenTiles',
    'tileOverflow',
    'ownerOverflow',
    'candidateFarTiles',
    'skippedTriangles',
  ]) {
    assert.equal(newResult[field], oldResult[field], field);
  }
  assert.deepEqual(newResult.sample, oldResult.sample);
  assert.deepEqual([...newResult.nextTiers], [...oldResult.nextTiers]);
});

test('R2 plan serves near, ROI, Section Z, and perspective uncertainty without geometry mutation', () => {
  const owners = source();
  const plan = buildAdaptiveTilePlan(owners);
  const tilted = [...identity];
  tilted[9] = 1;
  const cases = [
    [view, 'alpha-coverage-unverified'],
    [{ ...view, clipped: true }, 'roi'],
    [{ ...view, zCollapsed: true }, 'z-collapse'],
    [{ ...view, nearEdgeOn: true }, 'edge-on'],
    [{ ...view, farTier: false }, 'not-far'],
    [{ ...view, displayZScale: 400, viewProjectionMatrix: tilted }, 'alpha-coverage-unverified'],
    [{ ...view, viewProjectionMatrix: perspectiveNear }, 'alpha-coverage-unverified'],
  ];
  for (const [camera, gate] of cases) {
    const result = observePreparedAdaptiveTiles(plan, camera);
    assert.equal(result.reductionGate, gate);
    assert.equal(result.skippedTriangles, 0);
    assert.equal(result.tiles, 2);
    assert.equal(
      result.nearTiles +
        result.midTiles +
        result.farTiles +
        result.uncertainTiles +
        result.offscreenTiles,
      2,
    );
  }
  assert.equal(
    observePreparedAdaptiveTiles(plan, { ...view, viewProjectionMatrix: perspectiveNear })
      .uncertainTiles,
    2,
  );
  assert.equal(owners[0].parts[0].z1, 0.002);
});

test('repeated camera views reuse the CPU plan but preserve LOD hysteresis separately', () => {
  const owners = source();
  const cache = createAdaptiveTilePlanCache();
  const cold = cache.get(owners, 'rev-12');
  assert.equal(cold.hit, false);
  const old = observePreparedAdaptiveTiles(cold.plan, view);
  const warm = cache.get(owners, 'rev-12');
  assert.equal(warm.hit, true);
  assert.equal(warm.plan, cold.plan);
  const next = observePreparedAdaptiveTiles(warm.plan, { ...view, previousTiers: old.nextTiers });
  assert.deepEqual([...next.nextTiers], [...old.nextTiers]);
  assert.deepEqual(cache.stats(), {
    hits: 1,
    misses: 1,
    evictions: 0,
    retainedPlans: 1,
    retainedTiles: 2,
  });
});

test('same revision with a different Surface Plan never returns stale bound geometry', () => {
  const cache = createAdaptiveTilePlanCache();
  const a = source(128, 0);
  const b = source(128, 2);
  const first = cache.get(a, 'same-revision');
  const next = cache.get(b, 'same-revision');
  assert.equal(first.hit, false);
  assert.equal(next.hit, false);
  assert.notEqual(first.plan, next.plan);
  const visible = observePreparedAdaptiveTiles(first.plan, view);
  const hidden = observePreparedAdaptiveTiles(next.plan, view);
  assert.equal(visible.farTiles, 2);
  assert.equal(hidden.offscreenTiles, 2);
  assert.equal(cache.stats().retainedPlans, 2);
});

test('revision changes, LRU eviction, explicit clearing and limit changes invalidate cache', () => {
  const cache = createAdaptiveTilePlanCache({ maxEntries: 2 });
  const a = source();
  const b = source(64);
  const c = source(128, 0.001);
  cache.get(a, '1');
  cache.get(b, '1');
  assert.equal(cache.get(a, '1').hit, true);
  cache.get(c, '1');
  assert.equal(cache.stats().evictions, 1);
  assert.equal(cache.get(b, '1').hit, false);
  assert.equal(cache.get(a, '2').hit, false);
  assert.equal(cache.get(a, '2', { tileInstances: 32 }).hit, false);
  assert.ok(cache.stats().retainedPlans <= 2);
  assert.ok(cache.stats().retainedTiles <= 32);
  cache.clear();
  assert.equal(cache.stats().retainedPlans, 0);
  assert.equal(cache.stats().retainedTiles, 0);
});

test('bounded cache rejects invalid caps and never retains invalid plans', () => {
  assert.throws(() => createAdaptiveTilePlanCache({ maxEntries: 0 }), RangeError);
  assert.throws(() => createAdaptiveTilePlanCache({ maxEntries: 9 }), RangeError);
  const cache = createAdaptiveTilePlanCache();
  assert.equal(cache.get(source(), 'x', { tileInstances: 257 }).plan.valid, false);
  assert.equal(cache.stats().retainedPlans, 0);
  const many = buildAdaptiveTilePlan([source()[0], source()[0]], { maxOwners: 1, maxTiles: 1 });
  assert.equal(many.ownerOverflow, 1);
  assert.equal(many.tileOverflow, 1);
  assert.equal(many.tiles.length, 1);
  const projected = observePreparedAdaptiveTiles(many, view);
  assert.equal(projected.tileOverflow, 1);
  assert.equal(projected.skippedTriangles, 0);
});

test('invalid roughness, array offsets, appearance and excessive template parts fail closed', () => {
  const valid = source()[0];
  const rough = structuredClone(valid);
  rough.parts[0].upperSurface = { appearance: { kind: 'rough' } };
  const badPoint = structuredClone(valid);
  badPoint.instanceTranslations[4] = [NaN, 0];
  const tooMany = structuredClone(valid);
  tooMany.parts = Array.from({ length: 4097 }, () => ({ ...valid.parts[0] }));
  const p = buildAdaptiveTilePlan([rough, badPoint, tooMany, valid]);
  assert.equal(p.excludedOwners, 3);
  assert.equal(p.owners, 1);
  assert.equal(p.tiles.length, 2);
  assert.equal(observePreparedAdaptiveTiles(p, { ...view, mapZ: () => NaN }).uncertainTiles, 2);
  assert.equal(
    observePreparedAdaptiveTiles(p, {
      ...view,
      visibleIntervals: () => {
        throw Error('invalid');
      },
    }).uncertainTiles,
    2,
  );
});

test('observations with invalid camera/Section options fail closed and never allocate tiers', () => {
  const plan = buildAdaptiveTilePlan(source());
  for (const patch of [
    { viewProjectionMatrix: [1, 2] },
    { viewProjectionMatrix: [...identity.slice(0, 15), NaN] },
    { viewportHeight: 0 },
    { displayZScale: -1 },
    { mapZ: null },
    { visibleIntervals: null },
    { hysteresis: 0.6 },
    { farThresholdPx: -1 },
    { previousTiers: {} },
  ]) {
    const result = observePreparedAdaptiveTiles(plan, { ...view, ...patch });
    assert.equal(result.valid, false);
    assert.equal(result.nextTiers.size, 0);
    assert.equal(result.skippedTriangles, 0);
  }
});
