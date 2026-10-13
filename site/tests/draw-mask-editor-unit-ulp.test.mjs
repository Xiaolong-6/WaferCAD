import assert from 'node:assert/strict';
import test from 'node:test';

import { displayLengthDraftChanged } from '../controllers/draw-mask-controller.js';
import { fromMicron, toMicron } from '../units.js';

const format = (physical, unit) => {
  const digits = unit === 'nm' ? 1 : unit === 'mm' ? 7 : 4;
  return String(Number(fromMicron(physical, unit).toFixed(digits)));
};

test('unit conversion roundtrip with a negative Circle center does not count binary ULPs as edits', () => {
  const physical = -47581.09925285218;
  const original = format(physical, 'um');
  assert.equal(original, '-47581.0993');
  let previousUnit = 'um';
  let value = original;
  for (const unit of ['nm', 'mm', 'um']) {
    value = String(fromMicron(toMicron(value, previousUnit), unit));
    assert.equal(
      displayLengthDraftChanged(value, format(physical, unit)),
      false,
      `unchanged physical Circle center after ${previousUnit} to ${unit}`,
    );
    previousUnit = unit;
  }
  assert.notEqual(value, original, 'demonstrate the original strict equality bug');
  assert.ok(Math.abs(Number(value) - Number(original)) > 0);
});

test('real 0.1 nm edits are never lost in any display unit', () => {
  const canonical = -47581.09925285218;
  for (const [unit, oneTenthNanometre] of [
    ['um', 0.0001],
    ['nm', 0.1],
    ['mm', 0.0000001],
  ]) {
    const formatted = format(canonical, unit);
    assert.equal(
      displayLengthDraftChanged(String(Number(formatted) + oneTenthNanometre), formatted),
      true,
      unit,
    );
    assert.equal(
      displayLengthDraftChanged(String(Number(formatted) - oneTenthNanometre), formatted),
      true,
      unit,
    );
  }
});

test('draft change detection rejects invalid, missing and nonfinite values', () => {
  for (const value of [undefined, null, '', ' ', 'bad', '1e309', '-Infinity']) {
    assert.equal(displayLengthDraftChanged(value, '1.25'), true);
  }
  assert.equal(displayLengthDraftChanged('1.25', '1.25'), false);
  assert.equal(displayLengthDraftChanged('1.2501', '1.25'), true);
});
