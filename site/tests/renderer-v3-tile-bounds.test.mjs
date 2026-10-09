import assert from 'node:assert/strict';
import test from 'node:test';
import { buriedInterfaceTileBounds } from '../renderer-v3-tile-bounds.js';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const tiny = () => ({
  layerId: 'layer-6',
  buried: true,
  instanceTranslations: Array.from({ length: 128 }, (_, i) => [i * 0.000001, 0]),
  parts: [{ p: [0, 0], q: [0.002, 0], z0: 0, z1: 0.002 }],
});
const camera = {
  viewProjectionMatrix: identity,
  viewportWidth: 200,
  viewportHeight: 200,
  farTier: true,
  tileInstances: 64,
};

test('owner/tile bounds encompass full instances and whole template, with no source mutation', () => {
  const owners = [tiny()];
  const before = structuredClone(owners);
  const result = buriedInterfaceTileBounds(owners, camera);
  assert.deepEqual(owners, before);
  assert.equal(result.mode, 'observe-only');
  assert.equal(result.valid, true);
  assert.equal(result.owners, 1);
  assert.equal(result.tiles, 2);
  assert.equal(result.fullyBoundedTiles, 2);
  assert.equal(result.subpixelBounds, 2);
  assert.equal(result.uncertainTiles, 0);
  assert.equal(result.rawTwoPassTriangleUpperBound, 512);
  assert.equal(result.skippedTriangles, 0);
  assert.equal(result.reductionGate, 'alpha-coverage-unverified');
  assert.equal(result.topOwners[0].layerId, 'layer-6');
});

test('actual Section-display Z amplification removes spurious subpixel candidates', () => {
  const original = buriedInterfaceTileBounds([tiny()], camera);
  const amplified = buriedInterfaceTileBounds([tiny()], {
    ...camera,
    displayZScale: 100,
    zCollapsed: true,
  });
  assert.equal(original.subpixelBounds, 2);
  assert.equal(amplified.tiles, 2);
  assert.equal(amplified.subpixelBounds, 0);
  assert.equal(amplified.reductionGate, 'z-collapse');
  assert.equal(amplified.skippedTriangles, 0);
});

test('ROI and edge-on are explicit reduction gates, even if projected bounds are tiny', () => {
  const roi = buriedInterfaceTileBounds([tiny()], { ...camera, clipped: true });
  const edge = buriedInterfaceTileBounds([tiny()], { ...camera, nearEdgeOn: true });
  const near = buriedInterfaceTileBounds([tiny()], { ...camera, farTier: false });
  assert.equal(roi.reductionGate, 'roi');
  assert.equal(edge.reductionGate, 'edge-on');
  assert.equal(near.reductionGate, 'not-far');
  assert.equal(roi.subpixelBounds, 2);
  assert.equal(edge.skippedTriangles, 0);
});

test('near-plane-crossing bounding volumes fail closed instead of being called offscreen', () => {
  const wEqualsZ = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0];
  const result = buriedInterfaceTileBounds([tiny()], {
    ...camera,
    viewProjectionMatrix: wEqualsZ,
  });
  assert.equal(result.uncertainTiles, 2);
  assert.equal(result.fullyBoundedTiles, 0);
  assert.equal(result.offscreenBounds, 0);
  assert.equal(result.subpixelBounds, 0);
});

test('a fully projected bounding volume entirely outside the viewport is reported only', () => {
  const owner = tiny();
  owner.instanceTranslations = Array.from({ length: 128 }, () => [2, 0]);
  const result = buriedInterfaceTileBounds([owner], camera);
  assert.equal(result.tiles, 2);
  assert.equal(result.offscreenBounds, 2);
  assert.equal(result.subpixelBounds, 0);
  assert.equal(result.skippedTriangles, 0);
});

test('non-array, exterior, and rough/coating owner groups are excluded conservatively', () => {
  const plain = tiny();
  const result = buriedInterfaceTileBounds([
    { ...plain, buried: false },
    { ...plain, instanceTranslations: [[0, 0]] },
    { ...plain, parts: [{ ...plain.parts[0], upperSurface: { appearance: { kind: 'rough' } } }] },
    plain,
  ], camera);
  assert.equal(result.owners, 1);
  assert.equal(result.excludedOwners, 1);
});

test('bounded owner and tile budgets disclose overflow instead of implying full coverage', () => {
  const ownerA = tiny(), ownerB = { ...tiny(), layerId: 'layer-12' };
  const result = buriedInterfaceTileBounds([ownerA, ownerB], {
    ...camera,
    maxOwners: 1,
    maxTiles: 1,
  });
  assert.equal(result.ownerOverflow, 1);
  assert.equal(result.tileOverflow, 1);
  assert.equal(result.owners, 1);
  assert.equal(result.tiles, 1);
  assert.equal(result.skippedTriangles, 0);
});

test('invalid matrices, scales and unsupported sampling budgets fail closed', () => {
  for (const update of [
    { viewProjectionMatrix: [1, 2] },
    { viewProjectionMatrix: [...identity.slice(0, 15), Infinity] },
    { displayZScale: 0 },
    { displayZScale: NaN },
    { viewportHeight: 0 },
    { viewportWidth: Infinity },
    { tileInstances: 0 },
    { maxTiles: -1 },
    { subpixelThreshold: 2 },
    { mapZ: null },
  ]) {
    const result = buriedInterfaceTileBounds([tiny()], { ...camera, ...update });
    assert.equal(result.valid, false, JSON.stringify(update));
    assert.equal(result.skippedTriangles, 0);
  }
});
