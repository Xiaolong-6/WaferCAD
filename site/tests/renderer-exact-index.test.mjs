import assert from 'node:assert/strict';
import test from 'node:test';
import { exactTriangleVertexIndex } from '../renderer-exact-index.js';

const quadPositions = Float32Array.from([
  0, 0, 1, 2, 0, 1, 2, 2, 1,
  0, 0, 1, 2, 2, 1, 0, 2, 1,
]);
const flatNormals = Float32Array.from([
  0, 0, 1, 0, 0, 1, 0, 0, 1,
  0, 0, 1, 0, 0, 1, 0, 0, 1,
]);

test('exact indexing preserves every original triangle vertex in order', () => {
  const result = exactTriangleVertexIndex({
    position: quadPositions,
    normal: flatNormals,
  });
  assert.ok(result);
  assert.equal(result.indices.length, 6);
  assert.equal(result.uniqueSources.length, 4);
  const positions = new Uint32Array(quadPositions.buffer),
    normals = new Uint32Array(flatNormals.buffer);
  for (let vertex = 0; vertex < 6; vertex++) {
    const src = result.uniqueSources[result.indices[vertex]];
    for (let component = 0; component < 3; component++) {
      assert.equal(positions[vertex * 3 + component], positions[src * 3 + component]);
      assert.equal(normals[vertex * 3 + component], normals[src * 3 + component]);
    }
  }
});

test('different face normals and annotation depths must never be welded', () => {
  const oppositeNormal = flatNormals.slice();
  oppositeNormal.set([-0, 0, -1], 9);
  const withNormals = exactTriangleVertexIndex({
    position: quadPositions,
    normal: oppositeNormal,
  });
  assert.ok(withNormals);
  assert.equal(withNormals.uniqueSources.length, 5);

  const withDepth = exactTriangleVertexIndex({
    position: quadPositions,
    normal: flatNormals,
    annotationDepth: Float32Array.from([0, 0, 0, 1, 0, 0]),
  });
  assert.ok(withDepth);
  assert.equal(withDepth.uniqueSources.length, 5);
});

test('bitwise-distinct zero coordinates and normals cannot silently merge', () => {
  const positions = quadPositions.slice();
  positions[9] = -0;
  const result = exactTriangleVertexIndex({ position: positions, normal: flatNormals });
  assert.ok(result);
  assert.equal(result.uniqueSources.length, 5);
});

test('fail closed for malformed attributes, unsupported huge templates or negligible reuse', () => {
  assert.equal(exactTriangleVertexIndex(), null);
  assert.equal(
    exactTriangleVertexIndex({
      position: new Float32Array(8),
      normal: new Float32Array(8),
    }),
    null,
  );
  assert.equal(
    exactTriangleVertexIndex({
      position: quadPositions,
      normal: flatNormals.slice(0, 9),
    }),
    null,
  );
  assert.equal(
    exactTriangleVertexIndex({
      position: quadPositions,
      normal: flatNormals,
      annotationDepth: new Float32Array(5),
    }),
    null,
  );
  assert.equal(
    exactTriangleVertexIndex({
      position: quadPositions,
      normal: flatNormals,
    }, { minSavingFraction: 0.5 }),
    null,
  );
  assert.equal(
    exactTriangleVertexIndex({
      position: new Float32Array(65538 * 3),
      normal: new Float32Array(65538 * 3),
    }),
    null,
  );
});
