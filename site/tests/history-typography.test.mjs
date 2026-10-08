import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('History step typography matches Recipe step readability', async () => {
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

  const rule = (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[]\\]/g, '\\$&');
    const match = css.match(new RegExp(escaped + '\\s*\\{([^}]+)\\}'));
    assert.ok(match, `Missing CSS rule: ${selector}`);
    return match[1];
  };
  const fontSize = (declaration) => {
    const match = declaration.match(/font-size:\\s*([\\d.]+)px/);
    assert.ok(match, 'Missing explicit font size');
    return Number(match[1]);
  };

  const recipeTitle = fontSize(rule('.recipe-step-copy strong'));
  const recipeSummary = fontSize(rule('.recipe-step-copy small'));
  const historyTitle = fontSize(rule('.process-history-body strong,\n.snapshot-milestone-body strong'));
  const historySummary = fontSize(rule('.process-history-body span,\n.snapshot-milestone-body span'));
  assert.equal(historyTitle, recipeTitle);
  assert.equal(historySummary, recipeSummary);
  assert.ok(fontSize(rule('.history-variant-name')) >= recipeTitle);
  assert.ok(fontSize(rule('.history-bookmarks-summary')) >= recipeSummary);
});
