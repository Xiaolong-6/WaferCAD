import assert from 'node:assert/strict';
import test from 'node:test';
import { loadGeometryKernel } from '../../scripts/process-benchmarks.mjs';

await loadGeometryKernel();
const { normalizeMulti, rectMulti } = await import('../vector-geometry.js');
const { booleanWithNormalizedRetry, booleanWithQuantizedRetry } =
  await import('../polygon-boolean.js');

test('normalized Boolean parity for contact, overlap, holes and precision', () => {
  const holes = [
    [
      [
        [0, 0],
        [12, 0],
        [12, 12],
        [0, 12],
        [0, 0],
      ],
      [
        [4, 4],
        [4, 8],
        [8, 8],
        [8, 4],
        [4, 4],
      ],
    ],
  ];
  const inputs = [
    rectMulti(1, 1, 0, 0),
    rectMulti(1, 1, 1, 0),
    rectMulti(2.333333333, 2.000000007, 0.4, 0.25),
    rectMulti(0.0000004, 0.0000008, 0.0000012, 0.0000013),
    holes,
  ];
  for (const operation of ['union', 'intersection', 'difference']) {
    for (let a = 0; a < inputs.length; a++) {
      for (let b = 0; b < inputs.length; b++) {
        const original = [inputs[a], inputs[b]];
        const originalBefore = structuredClone(original);
        const owned = original.map(normalizeMulti);
        const ownedBefore = structuredClone(owned);
        const baseline = booleanWithQuantizedRetry(operation, original);
        const optimized = booleanWithNormalizedRetry(operation, owned);
        assert.deepEqual(optimized, baseline, `${operation} input ${a}/${b}`);
        assert.deepEqual(original, originalBefore, 'input remains unchanged after Boolean');
        assert.deepEqual(owned, ownedBefore, 'kernel cannot change independently owned operands');
      }
    }
  }
});

test('detached normalized fast path matches historical API across randomized wafer shapes', () => {
  let seed = 0x72f913b5;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 60; i++) {
    const x = (random() - 0.5) * 8;
    const y = (random() - 0.5) * 8;
    const a = rectMulti(0.5 + random() * 2.5, 0.5 + random() * 2.5, x, y);
    const b = rectMulti(0.5 + random() * 2.5, 0.5 + random() * 2.5, x + random(), y + random());
    const input = [a, b];
    const expected = booleanWithQuantizedRetry('union', input);
    const actual = booleanWithNormalizedRetry('union', input.map(normalizeMulti));
    assert.deepEqual(actual, expected, `random union ${i}`);
  }
});
