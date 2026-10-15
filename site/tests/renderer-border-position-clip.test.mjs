import assert from 'node:assert/strict';
import test from 'node:test';
import { clipBorderPositions } from '../renderer-border-position-clip.js';

// Historical implementation from three-view.js. Keep it independent so
// scientific Z Break border coordinates must agree element for element.
function referenceClip(positions, state) {
  if (!state || !positions?.length) return positions || [];
  const out = [];
  const lerpPoint = (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
  const zIsVisible = (z) => {
    const value = Number(z);
    if (!state || state.enabled === false || !Number.isFinite(value)) return true;
    return value >= state.top || value <= state.bottom;
  };

  for (let index = 0; index + 5 < positions.length; index += 6) {
    const a = [positions[index], positions[index + 1], positions[index + 2]];
    const b = [positions[index + 3], positions[index + 4], positions[index + 5]];
    const dz = b[2] - a[2];
    const cuts = [0, 1];
    if (Math.abs(dz) > 1e-12) {
      for (const boundary of [state.bottom, state.top]) {
        const t = (boundary - a[2]) / dz;
        if (t > 0 && t < 1) cuts.push(t);
      }
    }
    cuts.sort((left, right) => left - right);
    for (let part = 0; part < cuts.length - 1; part++) {
      const t0 = cuts[part];
      const t1 = cuts[part + 1];
      const middleZ = a[2] + dz * ((t0 + t1) / 2);
      if (!zIsVisible(middleZ)) continue;
      out.push(...lerpPoint(a, b, t0), ...lerpPoint(a, b, t1));
    }
  }
  return out;
}

test('Z Break border clipping exactly matches historical renderer on randomized lines', () => {
  let seed = 0x58e96db9;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const lines = [];
  for (let index = 0; index < 6000; index++) {
    const xyz = Array.from({ length: 6 }, () => (random() - 0.5) * 1000);
    lines.push(...xyz);
  }
  for (const state of [
    { bottom: -2, top: 3 },
    { bottom: 0, top: 0.0000001 },
    { bottom: -100, top: 100, enabled: false },
    { bottom: 10, top: 10 },
    { bottom: -Infinity, top: Infinity },
    { bottom: NaN, top: 1 },
  ]) {
    const expected = referenceClip(lines, state);
    const result = clipBorderPositions(lines, state);
    assert.deepEqual(result, expected);
    assert.deepEqual(new Float32Array(result), new Float32Array(expected));
  }
});

test('Z Break border clipping retains degeneracy, EPS, NaN and signed zero', () => {
  const lines = [
    -0, 1, -5, 0, 1, 5,
    1e-10, 0, -1e-14, 1e-10, 0, 1e-14,
    0, 0, NaN, 1, 1, 4,
    0, 0, 2, 1, 1, 2,
    0, 0, 1, 0, 0, 1,
  ];
  for (const state of [
    { bottom: -1, top: 1 },
    { bottom: -1, top: 1, enabled: false },
    { bottom: null, top: undefined },
  ]) {
    assert.deepEqual(clipBorderPositions(lines, state), referenceClip(lines, state));
  }
  assert.strictEqual(clipBorderPositions(lines, null), lines);
  assert.deepEqual(clipBorderPositions([], { bottom: -1, top: 1 }), []);
});

test('Z Break clipping never mutates its source array', () => {
  const input = Object.freeze([4, 5, -10, 7, 8, 10, 1, 2, 3, 4, 5, 6]);
  const result = clipBorderPositions(input, { bottom: -1, top: 1 });
  assert.deepEqual(result, referenceClip(input, { bottom: -1, top: 1 }));
  assert.deepEqual(input, [4, 5, -10, 7, 8, 10, 1, 2, 3, 4, 5, 6]);
});
