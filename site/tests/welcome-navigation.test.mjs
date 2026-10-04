import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const [welcomeHtml, appHtml, appJs, welcomeJs] = await Promise.all([
  readFile(new URL('index.html', root), 'utf8'),
  readFile(new URL('app.html', root), 'utf8'),
  readFile(new URL('app.js', root), 'utf8'),
  readFile(new URL('welcome.js', root), 'utf8'),
]);

test('welcome and workspace are separate browser pages', () => {
  assert.match(welcomeHtml, /id="welcomeScreen"/);
  assert.doesNotMatch(welcomeHtml, /class="app-shell"/);
  assert.match(welcomeHtml, /href="\.\/app\.html\?start=empty"/);
  assert.match(welcomeHtml, /id="welcomeExampleGrid"/);
  assert.match(welcomeHtml, /Example families/);

  assert.match(appHtml, /class="app-shell"/);
  assert.doesNotMatch(appHtml, /id="welcomeScreen"/);
  assert.match(appHtml, /id="welcomeHomeLink"/);
  assert.match(appHtml, /href="\.\/"/);
});

test('workspace startup consumes welcome-page intents without embedding welcome state', () => {
  assert.match(appJs, /initializeWorkspaceStart/);
  assert.match(appJs, /takeStartupFile/);
  assert.match(appJs, /openVisualizationExample/);
  assert.match(appJs, /openBundledExample/);
  assert.match(welcomeJs, /BUNDLED_EXAMPLES/);
  assert.match(welcomeJs, /start=example&example=/);
  assert.doesNotMatch(appJs, /wafercad\.welcome\.seen/);
  assert.doesNotMatch(appJs, /setWelcomeVisible/);
});

test('welcome staging enforces the same layout and project file-size limits before IndexedDB', () => {
  assert.match(welcomeJs, /MAX_LAYOUT_FILE_BYTES/);
  assert.match(welcomeJs, /MAX_PROJECT_FILE_BYTES/);
  assert.match(welcomeJs, /file\.size > maxBytes/);
});
