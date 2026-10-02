import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../app.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const threeView = await readFile(new URL('../three-view.js', import.meta.url), 'utf8');

test('3D inspection controls default to opaque layers with borders off', () => {
  assert.match(html, /id="threeOpacityRange"[^>]*value="1"/s);
  assert.match(html, /id="threeBorders" type="checkbox"/);
  assert.doesNotMatch(html, /id="threeBorders"[^>]*checked/);
  assert.match(app, /threeOpacity = 1/);
  assert.match(app, /threeShowBorders = false/);
  assert.match(threeView, /solidBorders\(item\)/);
  assert.match(threeView, /alphaHash: translucent/);
  assert.match(threeView, /transparent: false/);
  assert.match(threeView, /depthWrite: true/);
  assert.match(threeView, /depthTest: true/);
  assert.match(threeView, /edges\.renderOrder = 1000 \+ index/);
  assert.match(threeView, /color: layer\?\.color \|\| '#666'/);
  assert.match(threeView, /mesh\.renderOrder = 10/);
  assert.doesNotMatch(threeView, /0x24282c/);
  assert.doesNotMatch(threeView, /multiplyScalar\(0\.5\)/);
  assert.match(threeView, /async function exportGlb\(\)/);
  assert.match(threeView, /async function capturePng\(scale = 3\)/);
  assert.match(app, /createThreeView/);
});

test('3D renderer is event-driven and has a dependency-isolated fallback', () => {
  assert.doesNotMatch(threeView, /requestAnimationFrame\(animate\)/);
  assert.match(threeView, /function scheduleFrame\(\)/);
  assert.match(threeView, /3D dependencies unavailable; continuing without the 3D view/);
  assert.match(threeView, /host\.classList\.add\('three-unavailable'\)/);
});
