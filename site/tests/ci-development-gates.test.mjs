import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function workflow(name) {
  return readFileSync(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');
}

test('stable Quality job performs full checks on ready PRs and manual runs', () => {
  const source = workflow('quality.yml');
  assert.match(source, /name: Quality/);
  assert.match(source, /run: npm run check\n/);
  assert.match(
    source,
    /github\.event_name != 'pull_request' \|\| !github\.event\.pull_request\.draft/,
  );
  assert.ok(source.includes('set -euo pipefail'));
  assert.ok(source.includes('          npm run lint'));
  assert.ok(source.includes('          npm run format:check'));
  assert.ok(source.includes('          npm run docs:check'));
  assert.ok(!source.includes('npm run lint && npm run format:check'));
});

test('draft deferral never disables reusable production release acceptance', () => {
  for (const name of ['ui-v2-main-mask.yml', 'ui-v2-stage-c-m4.yml']) {
    const source = workflow(name);
    assert.match(source, /  workflow_call:/);
    assert.match(
      source,
      /github\.event_name != 'pull_request' \|\| !github\.event\.pull_request\.draft/,
    );
  }
  assert.match(
    workflow('ui-v2-three.yml'),
    /github\.event_name != 'pull_request' \|\| !github\.event\.pull_request\.draft/,
  );
  const release = workflow('pages.yml');
  for (const gate of ['release-quality', 'release-browser', 'release-ui-v2', 'release-science']) {
    assert.ok(release.includes(gate), 'Production gate must remain: ' + gate);
  }
  assert.match(
    release,
    /needs: \[release-quality, release-browser, release-ui-v2, release-science\]/,
  );
});

test('Draft browser baseline retains UI smoke and scientific process gate', () => {
  const source = workflow('browser-regression.yml');
  assert.match(
    source,
    /Run UI smoke\n        if: \$\{\{ needs\.plan\.outputs\.smoke == 'true' \}\}/,
  );
  assert.match(source, /name: Process geometry regression/);
  assert.match(source, /if: \$\{\{ needs\.plan\.outputs\.process == 'true' \}\}/);
});

test('visual evidence is explicitly unreviewed, never a merge gate', () => {
  const capture = readFileSync(
    new URL('../../scripts/v2/capture-visual-first.mjs', import.meta.url),
    'utf8',
  );
  assert.match(capture, /reviewStatus: 'unreviewed'/);
  const source = workflow('visual-first.yml');
  assert.match(source, /github\.event\.pull_request\.draft/);
  assert.match(source, /workflow_dispatch:/);
});

test('heavy PR scopes ignore documentation tests and isolated screenshot collection', () => {
  for (const name of [
    'ui-v2-stage-c-m4.yml',
    'ui-v2-main-mask.yml',
    'ui-v2-d1.yml',
    'example-recipe-reconstruction.yml',
    'native-fig3-full-replay.yml',
  ]) {
    const source = workflow(name).replaceAll('"', "'");
    assert.ok(source.includes("      - '!site/tests/**'"));
    assert.ok(source.includes("      - 'site/**'"));
  }
  for (const name of [
    'ui-v2-stage-c-m4.yml',
    'ui-v2-main-mask.yml',
    'ui-v2-d1.yml',
    'ui-v2-three.yml',
  ]) {
    const source = workflow(name).replaceAll('"', "'");
    assert.ok(source.includes("      - '!scripts/v2/capture-visual-first.mjs'"));
  }
  const browser = workflow('browser-regression.yml');
  assert.ok(browser.includes('      - "!examples/**/README.md"'));
  assert.ok(browser.includes('--base=${{ github.event.pull_request.base.sha }}'));
  assert.ok(browser.includes('--head=${{ github.event.pull_request.head.sha }}'));
});
