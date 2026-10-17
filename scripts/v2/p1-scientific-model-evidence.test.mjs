import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasVerifiedScientificModel,
  sameVerifiedScientificModel,
} from './p1-scientific-model-evidence.mjs';

const hash = 'a'.repeat(64);
const otherHash = 'b'.repeat(64);
const model = { modelHash: hash, modelLayerCount: 27 };

test('same validated nonempty model is accepted across reload and camera gestures', () => {
  assert.equal(hasVerifiedScientificModel(model), true);
  assert.equal(sameVerifiedScientificModel(model, { ...model }), true);
});

test('missing, empty or invalid hashes fail closed even when both pages agree', () => {
  for (const invalid of [null, undefined, '', '0', 'Z'.repeat(64)]) {
    const missing = { ...model, modelHash: invalid };
    assert.equal(hasVerifiedScientificModel(missing), false);
    assert.equal(sameVerifiedScientificModel(missing, missing), false);
  }
  assert.equal(sameVerifiedScientificModel(null, null), false);
  assert.equal(sameVerifiedScientificModel(model, null), false);
});

test('model mutations, missing layers and layer-count drift fail closed', () => {
  assert.equal(sameVerifiedScientificModel(model, { ...model, modelHash: otherHash }), false);
  for (const count of [0, -1, 1.5, NaN, undefined]) {
    assert.equal(hasVerifiedScientificModel({ ...model, modelLayerCount: count }), false);
    assert.equal(sameVerifiedScientificModel({ ...model, modelLayerCount: count }, model), false);
  }
  assert.equal(sameVerifiedScientificModel(model, { ...model, modelLayerCount: 28 }), false);
});
