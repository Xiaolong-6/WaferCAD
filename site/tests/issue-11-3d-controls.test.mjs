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
  assert.doesNotMatch(threeView, /alphaHash/);
  assert.match(threeView, /transparent: translucent/);
  assert.match(threeView, /depthWrite: !translucent/);
  assert.match(threeView, /depthTest: true/);
  assert.match(threeView, /function updateTransparentOrder\(\)/);
  assert.match(threeView, /transparentMeshes\.sort\(\(a, b\) => a\.depth - b\.depth\)/);
  assert.match(threeView, /function capRenderParts\(/);
  assert.match(threeView, /function geometryFromRoughCap\(/);
  assert.match(threeView, /roughMeshSubdivisionDepth\(/);
  assert.match(threeView, /roughMeshTriangleBudget\(/);
  assert.match(threeView, /function roughPointNormal\(/);
  assert.match(threeView, /visibleSolidBorders\(item, roughMap\)/);
  assert.match(threeView, /opacity: opacity \* 0\.18/);
  assert.match(threeView, /opacity: opacity \* 0\.3/);
  assert.match(threeView, /opacity: implantState\.opacity,\s*depthTest: true/s);
  assert.match(threeView, /capState = \{[\s\S]*?depthTest: true/);
  assert.match(threeView, /capMaterial\.polygonOffsetFactor = -1/);
  assert.doesNotMatch(threeView, /opacity: 0\.18/);
  assert.doesNotMatch(threeView, /opacity: 0\.3/);
  assert.match(threeView, /roughProfileOffsetAtPoint\(/);
  assert.match(threeView, /color: layer\?\.color \|\| '#999'/);
  assert.doesNotMatch(threeView, /0x24282c/);
  assert.doesNotMatch(threeView, /multiplyScalar\(0\.5\)/);
  assert.match(threeView, /async function exportGlb\(\)/);
  assert.match(threeView, /async function capturePng\(scale = 3\)/);
  assert.match(app, /createThreeView/);
});

test('3D renderer is event-driven and lazy-loads remote dependencies after app startup', () => {
  assert.doesNotMatch(threeView, /requestAnimationFrame\(animate\)/);
  assert.match(threeView, /function scheduleFrame\(\)/);
  assert.match(threeView, /function loadDependencies\(\)/);
  assert.match(threeView, /initPromise = loadDependencies\(\)\.then/);
  assert.doesNotMatch(threeView, /try \{\s*THREE = await import\('three'\)/);
  assert.match(threeView, /3D dependencies unavailable; continuing without the 3D view/);
  assert.match(threeView, /host\.classList\.add\('three-unavailable'\)/);
});
