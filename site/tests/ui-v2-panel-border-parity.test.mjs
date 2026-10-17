import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const css = (name) => readFileSync(new URL(`../ui-v2/${name}`, import.meta.url), 'utf8');

test('desktop Main/Mask/3D/Section use the same panel frame as mobile', () => {
  const base = css('workstation-v2.css');
  const desktop = css('desktop-shell.css');
  assert.match(
    base,
    /\.p-view\s*\{[^}]*border: 1px solid var\(--wc-border-strong\);[^}]*border-radius: var\(--wc-radius-sm\);/s,
  );
  assert.match(base, /\.p-panel-head\s*\{[^}]*border-bottom: 1px solid var\(--wc-border\);/s);
  assert.doesNotMatch(
    desktop,
    /body\[data-workstation\]:not\(\[data-preview-mode\]\) \.p-view\s*\{[^}]*\bborder(?:-radius)?\s*:/s,
  );
  assert.doesNotMatch(
    desktop,
    /body\[data-workstation\]:not\(\[data-preview-mode\]\) \.p-view \.p-panel-head\s*\{[^}]*\bborder\s*:/s,
  );
});
