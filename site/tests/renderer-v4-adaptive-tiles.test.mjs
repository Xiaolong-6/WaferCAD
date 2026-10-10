import assert from 'node:assert/strict';
import test from 'node:test';
import {
  observeAdaptiveArrayTiles,
  selectAdaptiveTileTier,
} from '../renderer-v4-adaptive-tiles.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const owner = (offsets = Array.from({ length: 128 }, (_, i) => [i * 0.000001, 0])) => ({
  layerId: 'buried',
  buried: true,
  parts: [{ p: [0, 0], q: [0.002, 0], z0: 0, z1: 0.002 }],
  instanceTranslations: offsets,
});
const view = {
  viewProjectionMatrix: identity,
  viewportWidth: 200,
  viewportHeight: 200,
  farTier: true,
};

test('bounded V4 observation classifies far tiles without touching physical data or render calls', () => {
  const input = [owner()];
  const copy = structuredClone(input);
  const result = observeAdaptiveArrayTiles(input, view);
  assert.deepEqual(input, copy);
  assert.equal(result.mode, 'observe-only');
  assert.equal(result.valid, true);
  assert.equal(result.owners, 1);
  assert.equal(result.tiles, 2);
  assert.equal(result.farTiles, 2);
  assert.equal(result.midTiles, 0);
  assert.equal(result.nearTiles, 0);
  assert.equal(result.candidateFarTiles, 2);
  assert.equal(result.reductionGate, 'alpha-coverage-unverified');
  assert.equal(result.skippedTriangles, 0);
  assert.equal(result.nextTiers.size, 2);
  assert.ok(result.sample.every((tile) => tile.footprintPx < 8));
});

test('tier hysteresis prevents camera-boundary chatter and never ignores invalid inputs', () => {
  assert.equal(selectAdaptiveTileTier(70), 'near');
  assert.equal(selectAdaptiveTileTier(55, 'near'), 'near');
  assert.equal(selectAdaptiveTileTier(50, 'near'), 'mid');
  assert.equal(selectAdaptiveTileTier(7), 'far');
  assert.equal(selectAdaptiveTileTier(9, 'far'), 'far');
  assert.equal(selectAdaptiveTileTier(10, 'far'), 'mid');
  assert.equal(selectAdaptiveTileTier(20), 'mid');
  assert.equal(selectAdaptiveTileTier(NaN), 'exact-uncertain');
  assert.equal(selectAdaptiveTileTier(4, 'far', { nearThresholdPx: 3 }), 'exact-uncertain');
});

test('persisted tier maps are consumed read-only; tile keys are stable for unchanged owners', () => {
  const input = [owner()];
  const first = observeAdaptiveArrayTiles(input, view);
  const previous = new Map(first.nextTiers);
  const second = observeAdaptiveArrayTiles(input, { ...view, previousTiers: previous });
  assert.deepEqual([...second.nextTiers], [...first.nextTiers]);
  assert.deepEqual([...previous], [...first.nextTiers]);
  assert.equal(second.skippedTriangles, 0);
});

test('ROI, Section Z collapse, edge-on, and non-far cameras block reduction independently', () => {
  const cases = [
    [{ clipped: true }, 'roi'],
    [{ zCollapsed: true }, 'z-collapse'],
    [{ nearEdgeOn: true }, 'edge-on'],
    [{ farTier: false }, 'not-far'],
  ];
  for (const [options, gate] of cases) {
    const result = observeAdaptiveArrayTiles([owner()], { ...view, ...options });
    assert.equal(result.reductionGate, gate);
    assert.equal(result.farTiles, 2);
    assert.equal(result.skippedTriangles, 0);
  }
});

test('rough owners, malformed translations, and invalid Section transform fail closed', () => {
  const badRough = owner();
  badRough.parts[0].upperSurface = { appearance: { kind: 'rough' } };
  const malformed = owner();
  malformed.instanceTranslations[4] = [NaN, 0];
  const badSection = observeAdaptiveArrayTiles([owner()], {
    ...view,
    mapZ: () => NaN,
  });
  const result = observeAdaptiveArrayTiles([badRough, malformed, owner()], view);
  assert.equal(result.excludedOwners, 2);
  assert.equal(result.owners, 1);
  assert.equal(result.tiles, 2);
  assert.equal(badSection.excludedOwners, 1);
  assert.equal(badSection.tiles, 0);
});

test('uncertain near-plane and offscreen tiles cannot become far visibility decisions', () => {
  const badW = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0];
  const uncertain = observeAdaptiveArrayTiles([owner()], {
    ...view,
    viewProjectionMatrix: badW,
  });
  assert.equal(uncertain.uncertainTiles, 2);
  assert.equal(uncertain.nextTiers.size, 0);
  const offscreen = observeAdaptiveArrayTiles(
    [owner(Array.from({ length: 128 }, () => [2, 0]))],
    view,
  );
  assert.equal(offscreen.offscreenTiles, 2);
  assert.equal(offscreen.farTiles, 0);
  assert.equal(offscreen.skippedTriangles, 0);
});

test('owner and tile budget overflows are exposed and never mislabeled as fully measured', () => {
  const result = observeAdaptiveArrayTiles([owner(), owner()], {
    ...view,
    maxOwners: 1,
    maxTiles: 1,
  });
  assert.equal(result.ownerOverflow, 1);
  assert.equal(result.tileOverflow, 1);
  assert.equal(result.tiles, 1);
  assert.equal(result.skippedTriangles, 0);
});

test('invalid camera, thresholds, and sample budgets reject without making decisions', () => {
  const invalid = [
    { viewProjectionMatrix: [...identity.slice(0, 15), Infinity] },
    { viewportHeight: 0 },
    { viewportWidth: NaN },
    { displayZScale: 0 },
    { tileInstances: 0 },
    { maxOwners: 129 },
    { maxTiles: 0 },
    { nearThresholdPx: 4 },
    { farThresholdPx: -1 },
    { hysteresis: 0.5 },
    { previousTiers: {} },
  ];
  for (const options of invalid) {
    const result = observeAdaptiveArrayTiles([owner()], { ...view, ...options });
    assert.equal(result.valid, false, JSON.stringify(options));
    assert.equal(result.tiles, 0);
    assert.equal(result.skippedTriangles, 0);
  }
});

test('Z exaggeration changes screen footprint classification without modifying physical Z', () => {
  const tilted = [...identity];
  tilted[9] = 1;
  const input = [owner()];
  const normal = observeAdaptiveArrayTiles(input, {
    ...view,
    viewProjectionMatrix: tilted,
  });
  const scaled = observeAdaptiveArrayTiles(input, {
    ...view,
    viewProjectionMatrix: tilted,
    displayZScale: 400,
  });
  assert.equal(normal.farTiles, 2);
  assert.equal(scaled.nearTiles, 2);
  assert.equal(input[0].parts[0].z1, 0.002);
  assert.equal(scaled.skippedTriangles, 0);
});
