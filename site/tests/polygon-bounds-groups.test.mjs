import assert from 'node:assert/strict';
import test from 'node:test';
import { connectedBoundingBoxGroups } from '../polygon-bounds-groups.js';

function referenceGroups(boxes, tolerance) {
  const parent = boxes.map((_, index) => index);
  const find = (index) => {
    while (parent[index] !== index) {
      parent[index] = parent[parent[index]];
      index = parent[index];
    }
    return index;
  };
  const join = (left, right) => {
    parent[find(left)] = find(right);
  };
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (
        a.maxX >= b.minX - tolerance &&
        b.maxX >= a.minX - tolerance &&
        a.maxY >= b.minY - tolerance &&
        b.maxY >= a.minY - tolerance
      ) join(i, j);
    }
  }
  const groups = new Map();
  for (let index = 0; index < boxes.length; index++) {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index);
  }
  return [...groups.values()];
}

test('empty, isolated, touching and transitive multi-component bounds', () => {
  assert.deepEqual(connectedBoundingBoxGroups([]), []);
  const bounds = [
    { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    { minX: 1, maxX: 2, minY: 0, maxY: 1 },
    { minX: 2, maxX: 3, minY: 0, maxY: 1 },
    { minX: 8, maxX: 9, minY: 8, maxY: 9 },
    { minX: 9.01, maxX: 10, minY: 8, maxY: 9 },
  ];
  const unchangedBounds = structuredClone(bounds);
  assert.deepEqual(connectedBoundingBoxGroups(bounds), [[0, 1, 2], [3], [4]]);
  assert.deepEqual(connectedBoundingBoxGroups(bounds, 0.02), [[0, 1, 2], [3, 4]]);
  assert.deepEqual(bounds, unchangedBounds, 'indexing cannot mutate canonical input bounds');
});

test('dense X-overlap but independent Y-rows exactly matches quadratic reference', () => {
  // This data exposes the formerly quadratic active-array scan.
  const boxes = Array.from({ length: 1800 }, (_, index) => ({
    minX: -1,
    maxX: 1,
    minY: index * 0.000003,
    maxY: index * 0.000003 + 0.0000001,
  }));
  assert.deepEqual(connectedBoundingBoxGroups(boxes, 1e-9), referenceGroups(boxes, 1e-9));
});

test('random, reversed and nested intervals match the exhaustive baseline', () => {
  let seed = 0x2cabcafe;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let round = 0; round < 40; round++) {
    const boxes = Array.from({ length: 75 }, (_, index) => {
      const x = (next() - 0.5) * 150;
      const y = (next() - 0.5) * 150;
      const halfX = index % 7 === 0 ? 80 : next() * 3;
      const halfY = index % 13 === 0 ? 80 : next() * 3;
      return { minX: x - halfX, maxX: x + halfX, minY: y - halfY, maxY: y + halfY };
    });
    const shuffled = boxes.sort(() => next() - 0.5);
    for (const tolerance of [0, 1e-9, 0.015]) {
      assert.deepEqual(
        connectedBoundingBoxGroups(shuffled, tolerance),
        referenceGroups(shuffled, tolerance),
        `round ${round}, tolerance ${tolerance}`,
      );
    }
  }
});

test('subnanometer seams preserve inclusive tolerance without changing boxes', () => {
  const bounds = [
    { minX: 0, maxX: 1, minY: 0, maxY: 1 },
    { minX: 1.0000000003, maxX: 2, minY: 0, maxY: 1 },
    { minX: 3, maxX: 4, minY: 1.0000000003, maxY: 2 },
    { minX: 3, maxX: 4, minY: 3, maxY: 4 },
  ];
  for (const tolerance of [0, 1e-9]) {
    assert.deepEqual(
      connectedBoundingBoxGroups(bounds, tolerance),
      referenceGroups(bounds, tolerance),
    );
  }
});
