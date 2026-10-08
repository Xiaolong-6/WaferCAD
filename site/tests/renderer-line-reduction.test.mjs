import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reduceCollinearClosedRing,
  mergeCollinearSidewallParts,
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
