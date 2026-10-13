import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Z Break editor keeps geometry and tooltip ownership in existing controllers', async () => {
  const source = await readFile('site/ui-v2/z-break-editor.js', 'utf8');
  const section = await readFile('site/ui-v2/section-view.js', 'utf8');
  assert.match(source, /dataset\.help = key/);
  assert.match(source, /dataset\.helpDetail = description/);
  assert.match(source, /collapse\.bounds\(\)/);
  assert.match(source, /collapse\.startDrag\(key, event\)/);
  assert.match(source, /input\.reportValidity\(\)/);
  assert.match(section, /createZBreakEditor\(/);
  assert.match(section, /workstation\.overlays\.mountFloating\(/);
  assert.doesNotMatch(source, /createCollapsedZDisplayTransform|modelBoundsZ|setSectionCollapse/);
});
