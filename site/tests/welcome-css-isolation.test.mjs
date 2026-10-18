import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const site = new URL('../', import.meta.url);

test('Welcome loads its own stylesheet instead of the retired editor stylesheet', async () => {
  const [entry, css] = await Promise.all([
    readFile(new URL('index.html', site), 'utf8'),
    readFile(new URL('welcome.css', site), 'utf8'),
  ]);
  assert.match(entry, /stylesheet\.href = `\.\/welcome\.css\$\{suffix\}`/);
  assert.doesNotMatch(entry, /stylesheet\.href = `\.\/style\.css\$\{suffix\}`/);
  for (const selector of [
    '.welcome-screen',
    '.welcome-hero',
    '.welcome-example-card',
    '.welcome-example-project-preview',
    '.welcome-workflow-grid',
    '.welcome-scope-grid',
  ]) {
    assert.ok(css.includes(selector), `Missing Welcome-owned selector: ${selector}`);
  }
  assert.doesNotMatch(css, /#mainPanel|#maskPanel|#threePanel|#sectionPanel/);
});