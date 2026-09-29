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
