import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

test('repeated Random visibly changes a palette even when random hue collides', () => {
  const window = { WaferCadV2Components: { el: () => null } };
  const deterministicMath = Object.create(Math);
  deterministicMath.random = () => 0.125;
  const script = readFileSync(
    new URL('../ui-v2/section-legend.js', import.meta.url),
    'utf8',
  );
  runInNewContext(script, { window, Math: deterministicMath });
  const randomPalette = window.WaferCadV2RandomLegendPalette;
  const first = Array.from(randomPalette(5));
  const second = Array.from(randomPalette(5, first));
  const third = Array.from(randomPalette(5, second));
  assert.equal(first.length, 5);
  assert.ok(first.every((color) => /^#[0-9A-F]{6}$/.test(color)));
  assert.notDeepEqual(second, first);
  assert.notDeepEqual(third, second);
});
