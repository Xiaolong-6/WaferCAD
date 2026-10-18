import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../ui-v2/', import.meta.url);
const desktop = readFileSync(new URL('desktop-shell.css', root), 'utf8');
const viewLayout = readFileSync(new URL('view-layout.css', root), 'utf8');
const app = readFileSync(new URL('../app.html', root), 'utf8');
const dockRule =
  /body\[data-workstation\]:not\(\[data-preview-mode\]\) \.p-desktop-dock-actions\s*\{([^}]*)\}/g;

// Desktop dock action bar belongs to the shell. View-layout owns individual
// scientific view panes and dividers, not the global navigation/control bar.
test('desktop dock action bar has exactly one production style owner', () => {
  const shellMatches = [...desktop.matchAll(dockRule)];
  assert.equal(shellMatches.length, 1);
  assert.equal([...viewLayout.matchAll(dockRule)].length, 0);
  const styles = shellMatches[0][1];
  for (const rule of [
    'display: flex;',
    'align-items: center;',
    'grid-column: 2;',
    'grid-row: 1;',
    'overflow-x: auto;',
    'white-space: nowrap;',
    'scrollbar-width: thin;',
  ]) {
    assert.ok(styles.includes(rule), `missing desktop dock style: ${rule}`);
  }
  assert.match(desktop, /@media \(min-width: 821px\)/);
  assert.ok(app.indexOf('ui-v2/view-layout.css') < app.indexOf('ui-v2/desktop-shell.css'));
});

test('view layout continues owning real scientific canvas and divider rules', () => {
  assert.match(viewLayout, /\.p-canvases\[data-desktop-docking='true'\]/);
  assert.match(viewLayout, /\.v2-dock-divider/);
});
