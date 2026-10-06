import assert from 'node:assert/strict';
import test from 'node:test';
import {
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
  const grouped = translatedPolygonInstanceGroups(
    [rect(0, 0), rect(10, 0), rect(20, 0, 7, 3)],
    { minInstances: 3 },
  );
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
