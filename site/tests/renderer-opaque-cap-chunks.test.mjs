import assert from 'node:assert/strict';
import test from 'node:test';
import { chunkOpaquePlanarCaps } from '../renderer-opaque-cap-chunks.js';

test('opaque cap chunks preserve exact polygon references, orientation, ownership and order', () => {
  const first = Array.from({ length: 2200 }, (_, index) => [[index, 0]]);
  const second = Array.from({ length: 1300 }, (_, index) => [[index, 1]]);
  const caps = [
    { z: 0.12, normal: 1, layerId: 'metal', polys: first },
    { z: 0, normal: -1, layerId: 'metal', polys: second },
  ];
  const chunks = [...chunkOpaquePlanarCaps(caps, 1024)];
  assert.equal(chunks.length, 4);
  assert.ok(chunks.every((batch) =>
    batch.reduce((total, cap) => total + cap.polys.length, 0) <= 1024,
  ));
  assert.deepEqual(
    chunks.flatMap((batch) => batch.flatMap((cap) => cap.polys)),
    [...first, ...second],
  );
  assert.equal(chunks[0][0].normal, 1);
  assert.equal(chunks.at(-1).at(-1).normal, -1);
  assert.equal(chunks.at(-1).at(-1).layerId, 'metal');
  assert.strictEqual(caps[0].polys, first);
  assert.strictEqual(caps[1].polys, second);
});

test('empty caps stay empty; nonfinite and zero chunk sizes are bounded', () => {
  assert.deepEqual([...chunkOpaquePlanarCaps([])], []);
  const cap = { z: 1, normal: 1, polys: ['a', 'b'] };
  assert.deepEqual(
    [...chunkOpaquePlanarCaps([cap], NaN)].flatMap((batch) => batch.flatMap((part) => part.polys)),
    cap.polys,
  );
  assert.equal([...chunkOpaquePlanarCaps([cap], 0)].length, 1);
});
