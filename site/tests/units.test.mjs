import assert from 'node:assert/strict';
import test from 'node:test';

import {
  convertXY,
  formatLengthInput,
  formatXY,
  fromMicron,
  roundMicronToTenthNanometre,
  toMicron,
  XY_UNITS,
} from '../units.js';

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

test('manual length inputs round and display to 0.1 nm precision', () => {
  assert.equal(roundMicronToTenthNanometre(1.23456), 1.2346);
  assert.equal(roundMicronToTenthNanometre(-0.000049), 0);
  assert.equal(roundMicronToTenthNanometre(-0.00006), -0.0001);
  assert.equal(formatLengthInput(1.23456, 'um'), '1.2346');
  assert.equal(formatLengthInput(1.23456, 'nm'), '1234.6');
  assert.equal(formatLengthInput(1234.56789, 'mm'), '1.2345679');
  assert.equal(formatLengthInput(0.0003, 'nm'), '0.3');
  assert.equal(formatLengthInput(0.0007, 'um'), '0.0007');
  assert.equal(formatLengthInput(0.0014, 'nm'), '1.4');
});
