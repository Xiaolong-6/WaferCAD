import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ringKey,
  translatedPolygonInstanceGroups,
  translatedSidewallInstanceGroups,
  spatialInstanceChunks,
} from '../renderer-instancing.js';

function rect(x, y, width = 4, height = 2) {
  return [
    [
      [x, y],
      [x + width, y],
      [x + width, y + height],
      [x, y + height],
      [x, y],
    ],
  ];
}

test('translated polygon grouping collapses repeated wafer-array cells into instances', () => {
  const polys = [];
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      polys.push(rect(column * 10, row * 10));
    }
  }

  const grouped = translatedPolygonInstanceGroups(polys, { minInstances: 4 });
  assert.equal(grouped.groups.length, 1);
  assert.equal(grouped.instanceCount, 25);
  assert.equal(grouped.leftovers.length, 0);
  assert.equal(grouped.groups[0].translations.length, 25);
});

test('translated polygon grouping tolerates ring rotation and reversal', () => {
  const base = rect(0, 0)[0];
  const rotated = [base[2], base[1], base[0], base[3], base[2]].map(([x, y]) => [x + 20, y + 5]);
  const grouped = translatedPolygonInstanceGroups([[base], [rotated]], { minInstances: 2 });
  assert.equal(grouped.groups.length, 1);
  assert.equal(grouped.instanceCount, 2);
});

test('rare unique polygons remain in the regular mesh path', () => {
  const grouped = translatedPolygonInstanceGroups([rect(0, 0), rect(10, 0), rect(20, 0, 7, 3)], {
    minInstances: 3,
  });
  assert.equal(grouped.groups.length, 0);
  assert.equal(grouped.leftovers.length, 3);
});

test('translated sidewall grouping instances repeated smooth vertical walls', () => {
  const parts = Array.from({ length: 12 }, (_, index) => ({
    p: [index * 10, 5],
    q: [index * 10 + 4, 5],
    z0: 1,
    z1: 3,
    lowerSurface: null,
    upperSurface: null,
  }));
  const grouped = translatedSidewallInstanceGroups(parts, { minInstances: 4 });
  assert.equal(grouped.groups.length, 1);
  assert.equal(grouped.instanceCount, 12);
  assert.equal(grouped.leftovers.length, 0);
  assert.deepEqual(grouped.groups[0].template.p, [0, 0]);
  assert.deepEqual(grouped.groups[0].template.q, [4, 0]);
});

test('rough and annotation-gradient sidewalls stay on the regular mesh path', () => {
  const grouped = translatedSidewallInstanceGroups(
    [
      {
        p: [0, 0],
        q: [4, 0],
        z0: 1,
        z1: 3,
        lowerSurface: { appearance: { kind: 'rough' } },
      },
      {
        p: [10, 0],
        q: [14, 0],
        z0: 1,
        z1: 3,
        lowerDepth: 0,
        upperDepth: 1,
      },
    ],
    { minInstances: 2 },
  );
  assert.equal(grouped.groups.length, 0);
  assert.equal(grouped.leftovers.length, 2);
});

test('spatial instance chunks keep repeated arrays cullable without losing instances', () => {
  const translations = [];
  for (let row = 0; row < 20; row++) {
    for (let column = 0; column < 20; column++) translations.push([column * 10, row * 10]);
  }
  translations.reverse();

  const chunks = spatialInstanceChunks(translations, { maxInstances: 64 });
  assert.equal(chunks.length, 7);
  assert.equal(chunks.flat().length, 400);
  assert.ok(chunks.every((chunk) => chunk.length <= 64));
  assert.deepEqual(chunks[0][0], [0, 0]);
  assert.deepEqual(chunks.at(-1).at(-1), [190, 190]);
});

function historicalRingKey(points, quantum) {
  if (!points.length) return '';
  const snap = (value) => {
    const q = Math.max(1e-12, Number(quantum) || 1e-4);
    const rounded = Math.round(Number(value) / q) * q;
    return Object.is(rounded, -0) ? 0 : Number(rounded.toPrecision(15));
  };
  const tokens = points.map(([x, y]) => `${snap(x)},${snap(y)}`);
  const candidates = [];
  for (const source of [tokens, [...tokens].reverse()]) {
    for (let offset = 0; offset < source.length; offset++) {
      candidates.push(source.slice(offset).concat(source.slice(0, offset)).join(';'));
    }
  }
  candidates.sort();
  return candidates[0];
}

test('fast ring keys preserve historical byte-identical signatures', () => {
  let seed = 0x1a3f09bd;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return seed >>> 0;
  };
  const coordinates = [0, 1, 1.01, 1.1, 11, 110, -1, -11, 0.0001, -0.0001];
  for (const size of [1, 2, 3, 4, 7, 16, 32, 64]) {
    for (let iteration = 0; iteration < 40; iteration++) {
      const points = Array.from({ length: size }, () => [
        coordinates[next() % coordinates.length],
        coordinates[next() % coordinates.length],
      ]);
      const quantum = iteration % 2 ? 1e-3 : 1e-4;
      assert.equal(ringKey(points, quantum), historicalRingKey(points, quantum));
      // All rotated or reversed signatures must still share one instancing key.
      const index = next() % size;
      const rotated = points.slice(index).concat(points.slice(0, index));
      assert.equal(ringKey(rotated, quantum), ringKey(points, quantum));
      assert.equal(ringKey([...points].reverse(), quantum), ringKey(points, quantum));
    }
  }
  assert.equal(ringKey([], 1e-4), '');
});
