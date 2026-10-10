import assert from 'node:assert/strict';
import test from 'node:test';
import { sharedFlatCapZ, mappedFlatCapTranslation } from '../renderer-v4-flat-geometry-sharing.js';

function geometry(values, extra = {}) {
  return {
    userData: extra.userData || {},
    getAttribute(key) {
      if (key === 'annotationDepth') return extra.annotationDepth || null;
      if (key !== 'position') return null;
      return { count: values.length, getZ: (i) => values[i] };
    },
  };
}
const options = { enabled: true, planarCap: true };

test('only opt-in smooth constant-Z planar caps can reuse chunk template bytes', () => {
  const cap = geometry([0.125, 0.125, 0.125, 0.125]);
  assert.deepEqual(sharedFlatCapZ(cap, options), { z: 0.125, vertexCount: 4 });
  assert.equal(sharedFlatCapZ(cap), null);
  assert.equal(sharedFlatCapZ(cap, { enabled: true }), null);
  assert.equal(sharedFlatCapZ(cap, { ...options, appearance: { kind: 'rough' } }), null);
  assert.equal(sharedFlatCapZ(cap, { ...options, adaptiveRough: true }), null);
  assert.equal(sharedFlatCapZ(geometry([0, 1, 0]), options), null);
  assert.equal(sharedFlatCapZ(geometry([0, NaN, 0]), options), null);
  assert.equal(sharedFlatCapZ(geometry([0, Infinity, 0]), options), null);
  assert.equal(sharedFlatCapZ(geometry([0, 0]), options), null);
  assert.equal(sharedFlatCapZ(geometry([0, 0, 0], { annotationDepth: {} }), options), null);
  assert.equal(
    sharedFlatCapZ(geometry([0, 0, 0], { userData: { roughGpuDisplacement: true } }), options),
    null,
  );
  assert.equal(sharedFlatCapZ({}, options), null);
});

test('flat read-only cap Z mapping is exact for regular and scaled Section transforms', () => {
  const record = { flatReadOnly: true, minZ: 0.25, maxZ: 0.25 };
  const physical = [0.25, 0.25, 0.25];
  for (const state of [
    { mapZ: (z) => z },
    { mapZ: (z) => z + 17 },
    { mapZ: (z) => 0.2 * z - 2 },
    { mapZ: (z) => (z > 0.1 ? z / 3 : z * 2) },
  ]) {
    const translation = mappedFlatCapTranslation(record, state);
    assert.ok(Number.isFinite(translation));
    for (const z of physical) {
      assert.ok(Math.abs(z + translation - state.mapZ(z)) <= 1e-12);
    }
  }
  assert.deepEqual(physical, [0.25, 0.25, 0.25], 'canonical Z must stay untouched');
  assert.equal(
    mappedFlatCapTranslation({ ...record, flatReadOnly: false }, { mapZ: (z) => z }),
    null,
  );
  assert.equal(mappedFlatCapTranslation({ ...record, maxZ: 0.5 }, { mapZ: (z) => z }), null);
  assert.equal(mappedFlatCapTranslation(record, { mapZ: () => NaN }), null);
  assert.equal(mappedFlatCapTranslation(record, {}), null);
});

test('the shared-cap eligibility probe never mutates source geometry', () => {
  const arr = [0.3, 0.3, 0.3];
  const geo = geometry(arr);
  const before = [...arr];
  assert.ok(sharedFlatCapZ(geo, options));
  assert.deepEqual(arr, before);
  assert.deepEqual(geo.userData, {});
});
