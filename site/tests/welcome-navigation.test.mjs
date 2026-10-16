import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const [welcomeHtml, appHtml, welcomeJs, startup, pages] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('app.html', root), 'utf8'),
  readFile(new URL('welcome.js', root), 'utf8'),
  readFile(new URL('controllers/startup-controller.js', root), 'utf8'),
  readFile(new URL('../scripts/build-pages-artifact.mjs', root), 'utf8'),
]);

test('Welcome and production workstation are separate v2 entry points', () => {
  assert.match(welcomeHtml, /id="welcomeScreen"/);
  assert.doesNotMatch(welcomeHtml, /class="app-shell"/);
  assert.match(welcomeHtml, /href="\.\/app\.html\?start=empty"/);
  assert.match(welcomeHtml, /id="welcomeExampleGrid"/);
  assert.match(appHtml, /ui-v2\/workstation-entry\.js/);
});

test('v2 Startup accepts project, empty and bundled-example intents', () => {
  assert.match(startup, /initializeWorkspaceStart/);
  assert.match(startup, /takeStartupFile/);
  assert.match(startup, /openBundledExample/);
  assert.match(welcomeJs, /BUNDLED_EXAMPLES/);
  assert.match(welcomeJs, /start=example&example=/);
  assert.doesNotMatch(appHtml, /app-legacy\.html/);
});

test('Welcome staging still protects maximum file size', () => {
  assert.match(welcomeJs, /MAX_LAYOUT_FILE_BYTES/);
  assert.match(welcomeJs, /MAX_PROJECT_FILE_BYTES/);
  assert.match(welcomeJs, /file\.size > maxBytes/);
});

test('v2 interactive previews and published old-bookmark redirect stay functional', () => {
  assert.match(welcomeJs, /return \`\.\/app\.html\?\$\{params\.toString\(\)\}\`/);
  assert.match(welcomeJs, /preview: '1'/);
  assert.doesNotMatch(welcomeJs, /app-legacy\.html/);
  assert.match(appHtml, /ui-v2\/workstation-preview\.css/);
  assert.match(pages, /location\.replace\('\.\/app\.html' \+ location\.search \+ location\.hash\)/);
});