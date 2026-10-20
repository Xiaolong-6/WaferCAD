import assert from 'node:assert/strict';
import test from 'node:test';
import { lineIntervalKey } from '../line-intervals.js';

// Formatting the canonical line signature must not change any matching or
// partition behavior, including signed zeros and very large coordinates.
test('canonical line signatures retain the exact original key representation', () => {
  let seed = 0x4315beef;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cases = [
    { ux: 0, uy: -0, offset: -0 },
    { ux: 1, uy: 0, offset: 1e-18 },
    { ux: -0.7071067811865476, uy: 0.7071067811865476, offset: 1e9 },
    { ux: Number.MIN_VALUE, uy: Number.MAX_VALUE, offset: -1e9 },
  ];
  for (let i = 0; i < 2000; i++) {
    cases.push({
      ux: next() * 2 - 1,
      uy: next() * 2 - 1,
      offset: (next() - 0.5) * (i % 2 ? 1e9 : 1e-9),
    });
  }
  for (const line of cases) {
    for (const precision of [1, 13, 17]) {
      const expected = [line.ux, line.uy, line.offset]
        .map((value) => Number(value).toPrecision(precision))
        .join('|');
      assert.equal(lineIntervalKey(line, precision), expected);
    }
  }
});
