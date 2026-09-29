import assert from 'node:assert/strict';
import test from 'node:test';

import { convertXY, formatXY, fromMicron, toMicron, XY_UNITS } from '../units.js';

test('XY unit table keeps canonical micron scale', () => {
  assert.equal(XY_UNITS.nm.toMicron, 0.001);
  assert.equal(XY_UNITS.um.toMicron, 1);
  assert.equal(XY_UNITS.mm.toMicron, 1000);
});

test('nm, µm and mm conversions are reversible', () => {
  const cases = [
    [123456.789, 'nm'],
    [123.456789, 'um'],
    [0.123456789, 'mm'],
  ];

  for (const [value, unit] of cases) {
    const micron = toMicron(value, unit);
    assert.ok(Math.abs(fromMicron(micron, unit) - value) < 1e-9);
  }

  assert.equal(convertXY(1, 'mm', 'um'), 1000);
  assert.equal(convertXY(1000, 'nm', 'um'), 1);
  assert.equal(convertXY(2500, 'um', 'mm'), 2.5);
});

test('formatXY preserves the display contract', () => {
  assert.equal(formatXY(100000, 'mm'), '100');
  assert.equal(formatXY(100000, 'um'), '100000');
  assert.equal(formatXY(0.0005, 'nm'), '0.5');
  assert.equal(formatXY(0, 'nm'), '0');
});

test('unknown units fall back to microns', () => {
  assert.equal(toMicron(12, 'unknown'), 12);
  assert.equal(fromMicron(12, 'unknown'), 12);
});
