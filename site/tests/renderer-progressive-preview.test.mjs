import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProgressiveSurfacePreview } from '../renderer-progressive-preview.js';

const polygon = [
  [
    [
      [0, 0],
      [4, 0],
      [4, 3],
      [0, 3],
      [0, 0],
    ],
  ],
];

function twoLayerModel() {
  return {
    layers: [
      { id: 'substrate', visible: true },
      { id: 'coating', visible: true },
    ],
    regions: [
      {
        geom: polygon,
        stack: [
          { layerId: 'substrate', z0: -2, z1: 0 },
          { layerId: 'coating', z0: 0, z1: 0.12 },
        ],
      },
    ],
  };
}

test('preview is capped, bounded and preserves original model geometry', () => {
  const model = twoLayerModel();
  const original = structuredClone(model);
  const preview = buildProgressiveSurfacePreview(model);
  assert.equal(preview.kind, 'approximate-caps-preview');
  assert.deepEqual(
    preview.caps.map(({ layerId, z, normal }) => [layerId, z, normal]),
    [
      ['coating', 0.12, 1],
      ['substrate', -2, -1],
    ],
  );
  assert.equal(preview.lineCount, 8);
  assert.equal(preview.borderPositions.length, 8 * 6);
  assert.deepEqual(Array.from(preview.borderPositions.slice(0, 2)), [0, 0]);
  assert.ok(Math.abs(preview.borderPositions[2] - 0.12) < 1e-6);
  assert.deepEqual(Array.from(preview.borderPositions.slice(3, 5)), [4, 0]);
  assert.deepEqual(model, original);
  assert.strictEqual(preview.caps[0].polys, model.regions[0].geom);
});

test('hidden layers resolve preview outer faces without changing canonical stacks', () => {
  const model = twoLayerModel();
  model.layers[1].visible = false;
  const preview = buildProgressiveSurfacePreview(model);
  assert.deepEqual(
    preview.caps.map(({ z, layerId }) => [z, layerId]),
    [
      [0, 'substrate'],
      [-2, 'substrate'],
    ],
  );
  assert.equal(model.regions[0].stack.length, 2);
});

test('ROI and unsupported array models cannot display uncut or unowned sketch', () => {
  const model = twoLayerModel();
  assert.equal(buildProgressiveSurfacePreview(model, polygon), null);
  assert.equal(buildProgressiveSurfacePreview({ ...model, array: { instances: [] } }), null);
});

test('no partial preview leaks when region polygon or line budget is exceeded', () => {
  const model = twoLayerModel();
  model.regions = Array.from({ length: 5000 }, () => ({
    geom: polygon,
    stack: model.regions[0].stack,
  }));
  assert.equal(buildProgressiveSurfacePreview(model), null);
  const malformed = twoLayerModel();
  malformed.regions[0].geom = [
    [
      [
        [0, 0],
        [Infinity, 0],
        [0, 1],
        [0, 0],
      ],
    ],
  ];
  assert.equal(buildProgressiveSurfacePreview(malformed), null);
});

test('preview data is presentation-only and has no owned sidewalls or solids', () => {
  const preview = buildProgressiveSurfacePreview(twoLayerModel());
  assert.equal('sidewalls' in preview, false);
  assert.equal('solids' in preview, false);
  assert.equal('slabs' in preview, false);
  assert.ok(preview.borderPositions instanceof Float32Array);
});
