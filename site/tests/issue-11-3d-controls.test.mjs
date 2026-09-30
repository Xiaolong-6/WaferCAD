import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const threeView = await readFile(new URL('../three-view.js', import.meta.url), 'utf8');

test('3D inspection controls default to opaque layers with borders off', () => {
  assert.match(html, /id="threeOpacityRange"[^>]*value="1"/s);
  assert.match(html, /id="threeBorders" type="checkbox"/);
  assert.doesNotMatch(html, /id="threeBorders"[^>]*checked/);
  assert.match(app, /threeOpacity = 1/);
  assert.match(app, /threeShowBorders = false/);
  assert.match(threeView, /new THREE\.EdgesGeometry\(geometry, 20\)/);
  assert.match(threeView, /depthWrite: opacity >= 0\.999/);
  assert.match(app, /createThreeView/);
});

test('3D renderer is event-driven and has a dependency-isolated fallback', () => {
  assert.doesNotMatch(threeView, /requestAnimationFrame\(animate\)/);
  assert.match(threeView, /function scheduleFrame\(\)/);
  assert.match(threeView, /3D dependencies unavailable; continuing without the 3D view/);
  assert.match(threeView, /host\.classList\.add\('three-unavailable'\)/);
});
