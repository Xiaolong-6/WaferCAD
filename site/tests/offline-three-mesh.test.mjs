import test from 'node:test';
import assert from 'node:assert/strict';
import { collectOwnedMesh } from '../../scripts/offline-three-mesh.mjs';
const model = { layers: [{ id: 'base', name: 'Silicon', color: '#aabbcc', visible: true }] };
const plan = {
  caps: [
    {
      layerId: 'base',
      z: 5,
      polys: [
        [
          [
            [0, 0],
            [2, 0],
            [0, 2],
            [0, 0],
          ],
        ],
      ],
      buried: false,
    },
  ],
  sidewalls: [{ layerId: 'base', p: [0, 0], q: [2, 0], z0: -5, z1: 5, buried: false }],
  borderLines: [
    [
      [0, 0, -5],
      [0, 0, 5],
    ],
  ],
};
const triangulate = () => [
  [
    [0, 0],
    [2, 0],
    [0, 2],
  ],
];
test('Native cap triangles and sidewall quads retain physical coordinates and material IDs', () => {
  const saved = structuredClone(plan);
  const result = collectOwnedMesh({ model, plan, triangulate });
  assert.equal(result.evidence.triangles, 3);
  assert.equal(result.evidence.nativeCaps, 1);
  assert.equal(result.evidence.nativeSidewalls, 1);
  assert.equal(result.evidence.borders, 1);
  assert.deepEqual(result.layers[0].triangles[0], [
    [0, 0, 5],
    [2, 0, 5],
    [0, 2, 5],
  ]);
  assert.deepEqual(result.layers[0].triangles[1], [
    [0, 0, -5],
    [2, 0, -5],
    [2, 0, 5],
  ]);
  assert.deepEqual(plan, saved);
});
test('Buried interfaces are omitted explicitly rather than drawn as outer faces', () => {
  const r = collectOwnedMesh({
    model,
    plan: { ...plan, caps: [...plan.caps, { ...plan.caps[0], buried: true }] },
    triangulate,
    borders: false,
  });
  assert.equal(r.evidence.ignoredBuriedInterfaces, 1);
  assert.equal(r.evidence.borders, 0);
});
test('Invalid or missing geometry fails instead of fabricating geometry', () => {
  assert.throws(
    () => collectOwnedMesh({ model, plan, triangulate: () => [] }),
    /Cannot safely triangulate/,
  );
  assert.throws(
    () => collectOwnedMesh({ model, plan, triangulate, maxTriangles: 2 }),
    /triangle budget/,
  );
  assert.throws(
    () =>
      collectOwnedMesh({
        model,
        plan: { ...plan, sidewalls: [{ ...plan.sidewalls[0], z1: -8 }] },
        triangulate,
      }),
    /invalid physical Z span/,
  );
});
