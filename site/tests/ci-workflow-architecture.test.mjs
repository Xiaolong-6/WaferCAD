import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function workflow(name) {
  return readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
}

test('production Pages requires quality, browser and UI acceptance before publishing', () => {
  const pages = workflow('pages');
  assert.match(pages, /  release-quality:\n/);
  assert.match(pages, /  release-browser:\n/);
  assert.match(pages, /  release-ui-v2:\n/);
  assert.match(pages, /needs: \[release-quality, release-browser, release-ui-v2\]/);
  assert.match(pages, /run: npm run check/);
  assert.match(pages, /uses: \.\/\.github\/workflows\/browser-regression\.yml/);
  assert.match(pages, /uses: \.\/\.github\/workflows\/ui-v2-stage-c-m4\.yml/);
  assert.match(pages, /if: \$\{\{ github\.ref == 'refs\/heads\/main' \}\}/);
  assert.match(pages, /uses: actions\/deploy-pages@v4/);
  assert.match(pages, /node scripts\/build-pages-artifact\.mjs/);
  assert.match(pages, /node scripts\/stamp-pages-assets\.mjs .*build\/pages/);
  assert.match(pages, /path: build\/pages/);
  const commitLine = pages.split('\n').find((line) => line.includes('> build/pages/build-info.json'));
  assert.equal(
    commitLine?.trim(),
    String.raw`printf '{"commit":"%s"}\n' "$GITHUB_SHA" > build/pages/build-info.json`,
  );
});

test('browser and v2 owners are reusable without racing main-push jobs', () => {
  const browser = workflow('browser-regression');
  const ui = workflow('ui-v2-stage-c-m4');
  assert.match(browser, /^  workflow_call:/m);
  assert.match(ui, /^  workflow_call:/m);
  assert.doesNotMatch(browser, /^  push:/m);
  assert.match(ui, /branches: \[codex\/ui-v2-main-wip\]/);
  assert.doesNotMatch(ui, /branches: \[codex\/ui-v2-main-wip, main\]/);
  assert.match(browser, /!inputs\.skip_node_gate/);
});

test('preview publishes from the last successful production Pages run', () => {
  const preview = workflow('ui-v2-preview');
  assert.match(preview, /actions\/workflows\/pages\.yml\/runs\?branch=main/);
  assert.match(preview, /ref: \$\{\{ steps\.verified-main\.outputs\.sha \}\}/);
  assert.match(preview, /node scripts\/build-pages-artifact\.mjs/);
  assert.match(preview, /cp -a base\/build\/pages\/\. _site\//);
  assert.doesNotMatch(preview, /^          ref: main$/m);
});

test('Quality covers docs-only PRs and enforces pinned formatter', () => {
  const quality = workflow('quality');
  assert.match(quality, /branches: \[main\]/);
  assert.doesNotMatch(quality, /paths-ignore:/);
  assert.match(quality, /run: npm run check\n/);
});

test('manual reconstruction runs cannot mutate main', () => {
  const m3d = workflow('m3d-full-replay');
  assert.match(m3d, /  replay:\n    if: \$\{\{/);
  assert.ok(m3d.includes("github.ref_name == 'fix/m3d-conformal-microcracks-20261008'"));
  assert.ok(m3d.includes("github.ref_name == 'integrate/reviewed-branches-20261008'"));
  assert.ok(
    workflow('magic1000-candidate').includes(
      "if: ${{ github.ref_name == 'feat/magic-1000-mos2-beol-reconstruction' }}",
    ),
  );
  assert.ok(
    workflow('photodetector-reconstruction-v2').includes(
      "if: ${{ github.ref_name == 'fix/photodetector-reconstruction-v2' }}",
    ),
  );
});
