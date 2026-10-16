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

function historicalSidewallSnap(value, quantum) {
  const q = Math.max(1e-12, Number(quantum) || 1e-4);
  const rounded = Math.round(Number(value) / q) * q;
  return Object.is(rounded, -0) ? 0 : Number(rounded.toPrecision(15));
}

function historicalSidewallGroups(
  parts,
  { minInstances = 8, quantum = 1e-4 } = {},
) {
  const threshold = Math.max(2, Math.floor(Number(minInstances) || 8)),
    buckets = new Map(),
    leftovers = [];

  for (const part of parts || []) {
    const p = part?.p,
      q = part?.q,
      z0 = Number(part?.z0),
      z1 = Number(part?.z1),
      hasAppearance = Boolean(part?.lowerSurface || part?.upperSurface),
      hasAnnotationDepth =
        Number.isFinite(Number(part?.lowerDepth)) || Number.isFinite(Number(part?.upperDepth));
    if (
      hasAppearance ||
      hasAnnotationDepth ||
      !Array.isArray(p) ||
      !Array.isArray(q) ||
      ![p[0], p[1], q[0], q[1], z0, z1].every((value) => Number.isFinite(Number(value)))
    ) {
      leftovers.push(part);
      continue;
    }

    const tx = historicalSidewallSnap(p[0], quantum),
      ty = historicalSidewallSnap(p[1], quantum),
      dx = historicalSidewallSnap(Number(q[0]) - Number(p[0]), quantum),
      dy = historicalSidewallSnap(Number(q[1]) - Number(p[1]), quantum),
      localZ0 = historicalSidewallSnap(z0, quantum),
      localZ1 = historicalSidewallSnap(z1, quantum);
    if (Math.hypot(dx, dy) <= 1e-12 || Math.abs(localZ1 - localZ0) <= 1e-12) {
      leftovers.push(part);
      continue;
    }

    const signature = `${dx},${dy}|${localZ0},${localZ1}`;
    if (!buckets.has(signature)) {
      buckets.set(signature, {
        template: {
          ...part,
          p: [0, 0],
          q: [dx, dy],
          z0: localZ0,
          z1: localZ1,
        },
        translations: [],
        originals: [],
      });
    }
    const bucket = buckets.get(signature);
    bucket.translations.push([tx, ty]);
    bucket.originals.push(part);
  }

  const groups = [];
  for (const bucket of buckets.values()) {
    if (bucket.translations.length >= threshold) {
      groups.push({
        template: bucket.template,
        translations: bucket.translations,
      });
    } else {
      leftovers.push(...bucket.originals);
    }
  }

  groups.sort((a, b) => b.translations.length - a.translations.length);
  return {
    groups,
    leftovers,
    instanceCount: groups.reduce((sum, group) => sum + group.translations.length, 0),
  };
}

test('adaptive sidewall snap preserves exact historical geometry across cache saturation', () => {
  for (const quantum of [1e-4, 1e-6]) {
    const dense = Array.from({ length: 5120 }, (_, index) => {
      const x = (index % 80) * 0.0123;
      const y = Math.floor(index / 80) * 0.0117;
      const delta = index % 2 ? 0.0246 : 0.0123;
      return {
        p: [x, y],
        q: [x + delta, y],
        z0: index % 3 ? 0.0123 : -0.0000042,
        z1: index % 3 ? 0.134 : 0.000081,
      };
    });
    const unique = Array.from({ length: 5120 }, (_, index) => {
      const x = index * 0.000123;
      const y = index * 0.00035281;
      return {
        p: [x, y],
        q: [x + 0.003, y - 0.4],
        z0: index * 1e-7,
        z1: 0.8 + index * 1e-7,
      };
    });
    const fallback = [
      { p: [0, 0], q: [1, 1], z0: 0, z1: 1, lowerDepth: 0 },
      { p: [0, 0], q: [1, 1], z0: 0, z1: 1, upperSurface: { kind: 'rough' } },
      { p: [0, 0], q: [0, 0], z0: 0, z1: 0 },
      { p: [0, 0], q: [1, 1], z0: 0, z1: Number.POSITIVE_INFINITY },
    ];
    for (const parts of [dense, unique, [...dense, ...unique, ...fallback]]) {
      const input = structuredClone(parts);
      const options = { minInstances: 3, quantum };
      assert.deepEqual(
        translatedSidewallInstanceGroups(parts, options),
        historicalSidewallGroups(parts, options),
      );
      assert.deepEqual(parts, input, 'Grouping cannot mutate original physical segments');
    }
  }
});
