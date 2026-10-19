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

test('generated Welcome cards, tags, thumbnails and state classes have CSS ownership', async () => {
  const [css, welcome, bundled] = await Promise.all([
    readFile(new URL('welcome.css', site), 'utf8'),
    readFile(new URL('welcome.js', site), 'utf8'),
    readFile(new URL('bundled-examples.js', site), 'utf8'),
  ]);
  const classes = new Set();
  for (const code of [welcome, bundled]) {
    for (const match of code.matchAll(/\.className\s*=\s*([\s\S]*?);/g)) {
      for (const value of match[1].matchAll(/['"]([^'"]+)['"]/g)) {
        for (const name of value[1].trim().split(/\s+/)) classes.add(name);
      }
    }
    for (const match of code.matchAll(/\.classList\.(?:add|remove|toggle)\(([^)]*)\)/g)) {
      for (const value of match[1].matchAll(/['"]([^'"]+)['"]/g)) classes.add(value[1]);
    }
  }
  const runtime = [...classes].filter((name) =>
    /^(?:welcome-|has-|loading$|ready$|error$|active$)/.test(name),
  );
  assert.ok(runtime.length >= 22, 'Class extraction lost coverage of dynamic cards');
  for (const name of runtime) {
    assert.match(css, new RegExp('\\.' + name + '(?![\\w-])'), 'Missing CSS for .' + name);
  }
});
