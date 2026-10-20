import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const [icon, welcome, app, shell, welcomeCss, workstationCss] = await Promise.all([
  readFile(new URL('assets/brand/wafercad-icon.svg', root), 'utf8'),
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('app.html', root), 'utf8'),
  readFile(new URL('ui-v2/workstation-v2.js', root), 'utf8'),
  readFile(new URL('welcome.css', root), 'utf8'),
  readFile(new URL('ui-v2/workstation-v2.css', root), 'utf8'),
]);

test('Welcome and production Workstation use the same bundled SVG icon', () => {
  assert.match(welcome, /rel="icon"[^>]+assets\/brand\/wafercad-icon\.svg/);
  assert.match(app, /rel="icon"[^>]+assets\/brand\/wafercad-icon\.svg/);
  assert.doesNotMatch(app, /href="data:,"/);
  assert.match(welcome, /class="welcome-brand-icon"/);
  assert.match(shell, /class: 'p-brand-icon'/);
  assert.match(shell, /aria-label': 'WaferCAD home'/);
  assert.match(welcomeCss, /\.welcome-brand-icon/);
  assert.match(workstationCss, /\.p-brand-icon/);
});

test('the icon is transparent, vector-based, and contains no embedded metadata', () => {
  assert.match(icon, /<svg\s[^>]*viewBox="56 65 400 400"/);
  assert.match(icon, /fill="#F59E0B"/);
  assert.match(icon, /fill="#2563EB"/);
  assert.doesNotMatch(icon, /<metadata|c2pa:|<script|<foreignObject/i);
  assert.doesNotMatch(icon, /<rect\b/);
});
