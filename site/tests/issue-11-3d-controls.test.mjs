import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

test('3D inspection controls default to opaque layers with borders off', () => {
  assert.match(html, /id="threeOpacityRange"[^>]*value="1"/s);
  assert.match(html, /id="threeBorders" type="checkbox"/);
  assert.doesNotMatch(html, /id="threeBorders"[^>]*checked/);
  assert.match(app, /threeOpacity = 1/);
  assert.match(app, /threeShowBorders = false/);
  assert.match(app, /new THREE\.EdgesGeometry\(geometry, 20\)/);
  assert.match(app, /depthWrite: threeOpacity >= 0\.999/);
});

test('3D renderer is event-driven and has a dependency-isolated fallback', () => {
  assert.doesNotMatch(app, /requestAnimationFrame\(animate\)/);
  assert.match(app, /function scheduleThreeFrame\(\)/);
  assert.match(app, /3D dependencies unavailable; continuing without the 3D view/);
  assert.match(app, /host\.classList\.add\('three-unavailable'\)/);
});
