import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reduceCollinearClosedRing,
  mergeCollinearSidewallParts,
  simplifyDisplayRing,
  simplifyDisplayPolygons,
  simplifyDisplaySidewallParts,
} from '../renderer-line-reduction.js';

test('exact collinear point reduction keeps the polygon and winding', () => {
  const ring = [[0,0],[1,0],[2,0],[2,1],[2,2],[1,2],[0,2],[0,1],[0,0]];
  const reduced = reduceCollinearClosedRing(ring);
  assert.deepEqual(reduced, [[0,0],[2,0],[2,2],[0,2],[0,0]]);
  assert.deepEqual(ring[1], [1,0], 'source geometry is immutable');
  assert.deepEqual(
    reduceCollinearClosedRing([[0,0],[0,2],[2,2],[2,0],[0,0]]),
    [[0,0],[0,2],[2,2],[2,0],[0,0]],
  );
});

test('non-collinear geometry, holes and sharp corners remain intact', () => {
  const ring = [[0,0],[1,0.2],[2,0],[2,2],[0,2],[0,0]];
  assert.deepEqual(reduceCollinearClosedRing(ring), ring);
  const hole = [[0.4,0.4],[0.4,1.6],[1.6,1.6],[1.6,0.4],[0.4,0.4]];
  assert.deepEqual(reduceCollinearClosedRing(hole), hole);
});

test('consecutive collinear smooth owned walls merge exactly without moving endpoints', () => {
  const parts = [
    { p: [0,0], q: [1,0], z0: 0, z1: 1 },
    { p: [1,0], q: [2,0], z0: 0, z1: 1 },
    { p: [2,0], q: [2,1], z0: 0, z1: 1 },
    { p: [2,1], q: [2,2], z0: 0, z1: 1 },
  ];
  const reduced = mergeCollinearSidewallParts(parts);
  assert.deepEqual(reduced.map(({p,q}) => [p,q]), [
    [[0,0],[2,0]], [[2,0],[2,2]],
  ]);
  assert.deepEqual(parts[0].q, [1,0]);
});

test('never merge rough profiles, thickness changes or discontinuous edges', () => {
  const rough = { appearance: { kind: 'rough', featureSize: 0.1 } };
  const parts = [
    { p:[0,0],q:[1,0],z0:0,z1:1,upperSurface:rough },
    { p:[1,0],q:[2,0],z0:0,z1:1,upperSurface:rough },
    { p:[2,0],q:[3,0],z0:0,z1:2 },
    { p:[5,0],q:[6,0],z0:0,z1:2 },
  ];
  assert.equal(mergeCollinearSidewallParts(parts).length, 4);
});

test('screen-space LOD simplifies a distant wavy boundary without mutating source geometry', () => {
  const upper = Array.from({ length: 101 }, (_, index) => [
    index * 0.1,
    2 + (index % 2 ? 0.002 : -0.002),
  ]);
  const outline = [
    [0, 0],
    [10, 0],
    ...upper.slice().reverse(),
    [0, 0],
  ];
  const original = structuredClone(outline);
  const reduced = simplifyDisplayRing(outline, 0.01);
  assert.ok(reduced.length < original.length / 4);
  assert.deepEqual(outline, original);
  assert.deepEqual(reduced[0], reduced.at(-1));
});

test('screen-space LOD preserves through-void holes and avoids close range simplification', () => {
  const ring = [
    [0, 0], [2, 0.001], [4, 0], [4, 4], [2, 3.999], [0, 4], [0, 0],
  ];
  const hole = [[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]];
  const polys = [[ring, hole]];
  assert.deepEqual(simplifyDisplayPolygons(polys, 0), polys);
  const reduced = simplifyDisplayPolygons(polys, 0.01);
  assert.deepEqual(reduced[0][1], hole);
  assert.deepEqual(polys[0][0], ring);
});

test('far-field sidewall LOD removes subpixel waviness but keeps Z and depth metadata', () => {
  const parts = Array.from({ length: 60 }, (_, index) => ({
    p: [index * 0.1, index % 2 ? 0.004 : 0],
    q: [(index + 1) * 0.1, (index + 1) % 2 ? 0.004 : 0],
    z0: 1,
    z1: 2,
    lowerDepth: 0,
    upperDepth: 1,
  }));
  const simplified = simplifyDisplaySidewallParts(parts, 0.02);
  assert.ok(simplified.length < 10);
  assert.equal(simplified[0].z0, 1);
  assert.equal(simplified[0].upperDepth, 1);
  assert.deepEqual(simplified[0].p, parts[0].p);
  assert.deepEqual(simplified.at(-1).q, parts.at(-1).q);
});

test('display LOD reconnects shuffled directed wall edges without connecting other Z owners', () => {
  const parts = Array.from({ length: 50 }, (_, index) => ({
    p: [index * 0.1, index % 2 ? 0.003 : 0],
    q: [(index + 1) * 0.1, (index + 1) % 2 ? 0.003 : 0],
    z0: 1,
    z1: 2,
    buried: true,
    layerId: 'buried-interface',
  }));
  const reordered = parts.filter((_, index) => index % 2).concat(
    parts.filter((_, index) => index % 2 === 0),
  );
  const reduced = simplifyDisplaySidewallParts(reordered, 0.02);
  assert.ok(reduced.length < 10, `expected stitched chain, got ${reduced.length} edges`);
  assert.deepEqual(reduced[0].p, parts[0].p);
  assert.deepEqual(reduced.at(-1).q, parts.at(-1).q);
  const secondDepth = { ...parts[5], z0: 3, z1: 4 };
  const separated = simplifyDisplaySidewallParts([...parts, secondDepth], 0.02);
  assert.ok(separated.some((edge) => edge.z0 === 3));
});
