import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARRAY_MODEL_KERNEL,
  arrayParts,
  translatedAppearance,
} from '../model-array.js';

const boundary = [
  [
    [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
      [-1, -1],
    ],
  ],
];

function fixture(side) {
  const model = {
    kernel: ARRAY_MODEL_KERNEL,
    revision: 1,
    processRevision: 1,
    boundary,
    layers: [{ id: 'base', name: 'Si' }, { id: 'film', name: 'Film' }],
    implants: [],
    electricalRegions: [],
    array: {
      templates: [
        {
          id: 'cell',
          model: {
            boundary,
            regions: [
              {
                id: 'r0',
                geom: boundary,
                stack: [
                  { layerId: 'base', z0: 0, z1: 1 },
                  {
                    layerId: 'film',
                    z0: 1,
                    z1: 1.01,
                    frontSurface: {
                      kind: 'rough',
                      sampleOrigin: [0.25, -0.25],
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
      instances: Array.from({ length: side * side }, (_, index) => ({
        id: `site-${index}`,
        templateId: 'cell',
        role: 'device',
        x: (index % side) * 5,
        y: Math.floor(index / side) * 5,
      })),
    },
  };
  return model;
}

for (const side of [25, 80]) {
  test(`${side * side}-site array retains physical stack and site identity through JSON roundtrip`, () => {
    const original = fixture(side);
    const restored = JSON.parse(JSON.stringify(original));
    const parts = arrayParts(restored);
    assert.equal(parts.length, side * side);
    assert.equal(new Set(parts.map((part) => part.id)).size, side * side);
    assert.equal(
      new Set(parts.map((part) => `${part.x},${part.y}`)).size,
      side * side,
    );
    for (let index = 0; index < parts.length; index++) {
      const part = parts[index];
      assert.equal(part.id, `site-${index}`);
      assert.equal(part.x, (index % side) * 5);
      assert.equal(part.y, Math.floor(index / side) * 5);
      assert.deepEqual(part.model.regions[0].stack, original.array.templates[0].model.regions[0].stack);
      assert.equal(part.model.regions[0].stack[1].z0, 1);
      assert.equal(part.model.regions[0].stack[1].z1, 1.01);
    }
    assert.deepEqual(restored, original);
  });
}

test('array ROI selects only intersecting sites and preserves local roughness coordinates', () => {
  const model = fixture(25);
  const selected = arrayParts(model, {
    minX: 4,
    maxX: 6,
    minY: 9,
    maxY: 11,
  });
  assert.equal(selected.length, 1);
  assert.equal(selected[0].x, 5);
  assert.equal(selected[0].y, 10);
  const appearance = model.array.templates[0].model.regions[0].stack[1].frontSurface;
  assert.deepEqual(translatedAppearance(appearance, 5, 10).sampleOrigin, [5.25, 9.75]);
  assert.deepEqual(appearance.sampleOrigin, [0.25, -0.25]);
  assert.equal(arrayParts(model).length, 625);
});
