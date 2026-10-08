import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('History steps use Recipe-sized labels and summaries', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const rule = (selector) => {
    const start = css.lastIndexOf(selector + ' {');
    assert.ok(start >= 0, 'CSS selector missing: ' + selector);
    const body = css.slice(start, css.indexOf('}', start));
    const match = body.match(/font-size:\s*([\d.]+)px/);
    assert.ok(match, 'No explicit font size in ' + selector);
    return Number(match[1]);
  };

  assert.equal(
    rule('.process-history-body strong,\n.snapshot-milestone-body strong'),
    rule('.recipe-step-copy strong'),
  );
  assert.equal(
    rule('.process-history-body span,\n.snapshot-milestone-body span'),
    rule('.recipe-step-copy small'),
  );
  assert.ok(rule('.history-variant-name') >= rule('.recipe-step-copy strong'));
  assert.ok(rule('.history-bookmarks-summary') >= rule('.recipe-step-copy small'));
});
