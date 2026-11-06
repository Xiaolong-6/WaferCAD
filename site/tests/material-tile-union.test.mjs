import assert from 'node:assert/strict';
import test from 'node:test';
import { unionMaterialTiles } from '../material-tile-union.js';
import {
  materialGeometryArea,
  intersection,
  unionMaterialSweeps,
} from '../material-process-boolean.js';
import { nodeMaterialProcessInputs } from '../material-process-noding.js';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

test('a real 76452-join source union preserves exact area and matches an independent arrangement', async () => {
  const { loadGeometryKernel } = await import('../../scripts/process-benchmarks.mjs');
  await loadGeometryKernel();
  const v = await import('../vector-geometry.js');
  const fixture = JSON.parse(
    gunzipSync(
      await readFile(
        new URL('../../tests/fixtures/transmon-material-many-joins.json.gz', import.meta.url),
      ),
    ),
  );
  const area2 = (path) =>
    path.reduce((n, a, i) => {
      const b = path[(i + 1) % path.length];
      return n + BigInt(a.X) * BigInt(b.Y) - BigInt(a.Y) * BigInt(b.X);
    }, 0n);
  const polygonInputs = (paths) => {
    const polygons = [];
    for (const path of paths) {
      const ring = path.map((point) => [point.X / 1e7, point.Y / 1e7]);
      ring.push(ring[0]);
      if (area2(path) > 0n) polygons.push([ring]);
      else polygons.at(-1).push(ring);
    }
    return polygons;
  };
  const geometries = fixture.input.map((input) => polygonInputs(input.paths));
  const reference = v.unionGeometries(geometries);
  const actual = unionMaterialSweeps(geometries);
  const outputArea2 = actual
    .flat()
    .reduce(
      (n, ring) =>
        n + area2(ring.map(([x, y]) => ({ X: Math.round(x * 1e7), Y: Math.round(y * 1e7) }))),
      0n,
    );
  assert.equal(
    outputArea2,
    fixture.input.flatMap((input) => input.paths).reduce((n, path) => n + area2(path), 0n),
  );
  assert.equal(materialGeometryArea(v.difference(actual, reference)), 0);
  assert.equal(materialGeometryArea(v.difference(reference, actual)), 0);
  const first = fixture.input[0].paths[0][0];
  const phase = (n) => ((n % 1000) + 1000) % 1000;
  const dx = phase(first.X),
    dy = phase(first.Y);
  const alignedPaths = fixture.input
    .flatMap((input) => input.paths)
    .map((path) => path.map((p) => ({ X: p.X - dx, Y: p.Y - dy })));
  const aligned = polygonInputs(alignedPaths);
  const fast = unionMaterialTiles([aligned]);
  assert.ok(fast, 'balanced temporary duplicates must use exact edge cancellation');
  const alignedReference = v.unionGeometries([aligned]);
  assert.equal(materialGeometryArea(v.difference(fast, alignedReference)), 0);
  assert.equal(materialGeometryArea(v.difference(alignedReference, fast)), 0);
});

test('a zero-area shared-boundary spur cancels after all directed occurrences are counted', () => {
  const left = rect(-1, 0, 0, 1);
  const right = [
    [
      [
        [0, 0],
        [0, 1],
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
        [0, 0],
      ],
    ],
  ];
  const result = unionMaterialTiles([left, right]);
  assert.ok(result);
  assert.equal(materialGeometryArea(result), 2);
  assert.equal(unionMaterialTiles([left, left]), null);
});

const rect = (x0, y0, x1, y1) => [
  [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ],
];
test('shared-node tiles cancel interior edges without changing the input', () => {
  const tiles = [rect(0, 0, 1, 1), rect(1, 0, 2, 1)];
  const before = structuredClone(tiles);
  const result = unionMaterialTiles(tiles);
  assert.equal(result.length, 1);
  assert.equal(result[0].length, 1);
  assert.equal(result[0][0].length, 5);
  assert.equal(materialGeometryArea(result), 2);
  assert.deepEqual(tiles, before);
});
test('tile union retains a hole and point-touch components', () => {
  const tiles = [];
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++) if (x !== 1 || y !== 1) tiles.push(rect(x, y, x + 1, y + 1));
  const ring = unionMaterialTiles(tiles);
  assert.equal(ring.length, 1);
  assert.equal(ring[0].length, 2);
  assert.equal(materialGeometryArea(ring), 8);
  const touching = unionMaterialTiles([rect(0, 0, 1, 1), rect(1, 1, 2, 2)]);
  assert.equal(touching.length, 2);
  assert.equal(materialGeometryArea(touching), 2);
});
test('tile union requests Boolean fallback for duplicate edges or off-grid points', () => {
  assert.equal(unionMaterialTiles([rect(0, 0, 1, 1), rect(0, 0, 1, 1)]), null);
  assert.equal(unionMaterialTiles([rect(0, 0, 1.00001, 1)]), null);
  assert.deepEqual(unionMaterialTiles([]), []);
});

test('fine-lattice clipping nodes a T junction without changing the cropped union', () => {
  const query = rect(0.1234567, 0.2345678, 1.8765432, 0.8765432);
  const pieces = [rect(0, 0, 1, 1), rect(1, 0, 2, 0.4), rect(1, 0.4, 2, 1)].map((g) =>
    intersection(g, query),
  );
  const noded = nodeMaterialProcessInputs(pieces, {
    sourceCount: pieces.length,
    gridScale: 10000000,
  });
  const merged = unionMaterialTiles(noded, { gridScale: 10000000 });
  assert.ok(merged);
  assert.equal(merged.length, 1);
  assert.ok(
    Math.abs(materialGeometryArea(merged) - (1.8765432 - 0.1234567) * (0.8765432 - 0.2345678)) <
      1e-12,
  );
});
