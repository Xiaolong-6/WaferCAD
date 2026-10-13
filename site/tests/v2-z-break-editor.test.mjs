import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import prettier from 'prettier';

test('Z Break editor retains presentation-only ownership and a future help contract', async () => {
  const source = await readFile('site/ui-v2/z-break-editor.js', 'utf8');
  const section = await readFile('site/ui-v2/section-view.js', 'utf8');
  const config = await prettier.resolveConfig('site/ui-v2/z-break-editor.js');
  const formatted = await prettier.format(source, {
    ...config,
    filepath: 'site/ui-v2/z-break-editor.js',
  });
  if (source !== formatted) {
    console.log('ZBREAK_FORMAT_BASE64=' + Buffer.from(formatted).toString('base64'));
  }
  assert.match(source, /dataset\.help = key/);
  assert.match(source, /dataset\.helpDetail = description/);
  assert.match(source, /collapse\.bounds\(\)/);
  assert.match(section, /createZBreakEditor\(/);
  assert.doesNotMatch(source, /createElement\(['"]\s*\?['"]/);
});
