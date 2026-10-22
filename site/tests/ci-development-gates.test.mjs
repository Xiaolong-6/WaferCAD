import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

function workflow(name) {
  return readFileSync(new URL('../../.github/workflows/' + name, import.meta.url), 'utf8');
}

test('Quality runs from matching local proof or real scoped CI fallback, never neither', () => {
  const quality = workflow('quality.yml');
  assert.match(quality, /name: Quality/);
  assert.match(quality, /branches: \[main\]/);
  assert.match(quality, /id: evidence\n        continue-on-error: true/);
  assert.match(quality, /run: node scripts\/local-verification\.mjs verify "\$QUALITY_SCOPE"/);
  assert.match(
    quality,
    /name: Require full local Quality evidence[\s\S]*?run: node scripts\/local-verification\.mjs verify full/,
  );
  assert.match(
    quality,
    /name: Install locked dependencies only for missing or stale evidence[\s\S]*?run: npm ci --ignore-scripts --no-audit --no-fund/,
  );
  assert.match(
    quality,
    /name: Execute Draft Quality fallback[\s\S]*?npm run lint[\s\S]*?npm run format:check[\s\S]*?npm run docs:check[\s\S]*?node --test site\/tests\/ci-test-plan\.test\.mjs/,
  );
  assert.match(
    quality,
    /name: Final lint, formatting, generated documentation and Node tests[\s\S]*?run: npm run check/,
  );

  const matchCondition = (step) =>
    quality.match(new RegExp('name: ' + step + '\\n        if: \\$\\{\\{ (.+) \\}\\}'))?.[1];
  const condition = (step, evidence, draft) => {
    const expr = matchCondition(step);
    assert.ok(expr, 'missing guarded step: ' + step);
    return runInNewContext(expr, {
      steps: { evidence: { outcome: evidence } },
      github: { event_name: 'pull_request', event: { pull_request: { draft } } },
      cancelled: () => false,
    });
  };
  for (const draft of [true, false]) {
    assert.equal(
      condition('Install locked dependencies only for missing or stale evidence', 'success', draft),
      false,
    );
    assert.equal(
      condition('Install locked dependencies only for missing or stale evidence', 'failure', draft),
      true,
    );
    assert.equal(condition('Require full local Quality evidence', 'success', draft), !draft);
    assert.equal(condition('Require full local Quality evidence', 'failure', draft), false);
    assert.equal(condition('Execute Draft Quality fallback', 'failure', draft), draft);
    assert.equal(
      condition('Final lint, formatting, generated documentation and Node tests', 'failure', draft),
      !draft,
    );
    assert.equal(condition('Execute Draft Quality fallback', 'success', draft), false);
    assert.equal(
      condition('Final lint, formatting, generated documentation and Node tests', 'success', draft),
      false,
    );
  }
  const release = workflow('pages.yml')
    .split('  release-quality:\n')[1]
    ?.split('  release-browser:\n')[0];
  assert.match(
    release,
    /name: Probe full local Quality for this release tree[\s\S]*?continue-on-error: true/,
  );
  assert.match(
    release,
    /name: Require full local Quality for this release tree[\s\S]*?run: node scripts\/local-verification\.mjs verify full/,
  );
  assert.match(
    release,
    /steps\.evidence\.outcome != 'success'[\s\S]*?run: npm ci --ignore-scripts --no-audit --no-fund/,
  );
  assert.match(
    release,
    /name: Final lint, formatting, generated documentation and Node tests[\s\S]*?run: npm run check/,
  );
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
    /needs: \[release-evidence, release-quality, release-browser, release-ui-v2, release-science\]/,
  );
  assert.match(release, /release-evidence:/);
  assert.match(release, /if: .*needs.release-evidence.outputs.fast != 'true'/);
  assert.ok(release.includes('run: node scripts/release/verified-pr-release.mjs'));
});

test('Recipe safety reuses the full Quality gate instead of running it twice', () => {
  const recipe = workflow('process-recipe-safety.yml');
  assert.match(recipe, /skip_shared_node_gate:[\s\S]*?default: false/);
  assert.match(recipe, /name: Shared lint, docs and Node test gate[\s\S]*?run: npm run check:ci/);
  const pages = workflow('pages.yml');
  assert.match(
    pages,
    /release-recipe:[\s\S]*?uses: \.\/\.github\/workflows\/process-recipe-safety\.yml\n    with:\n      skip_shared_node_gate: true/,
  );
  assert.match(
    pages,
    /name: Release local Quality evidence[\s\S]*?run: node scripts\/local-verification\.mjs verify full/,
  );
});

test('Recipe reusable callers retain the shared gate unless they explicitly opt out', () => {
  const source = workflow('process-recipe-safety.yml');
  const expression = source.match(
    /name: Shared lint, docs and Node test gate\n        if: \$\{\{ (.+) \}\}/,
  )?.[1];
  assert.ok(expression, 'Shared gate condition must be present');
  const repository = 'Xiaolong-6/WaferCAD';
  for (const [event, caller, skip, expected, base = 'main'] of [
    ['pull_request', 'process-recipe-safety.yml', false, false],
    ['push', 'process-recipe-safety.yml', false, true],
    ['pull_request', 'other.yml', false, true],
    ['pull_request', 'other.yml', true, false],
    ['push', 'other.yml', false, true],
    ['push', 'pages.yml', true, false],
    ['pull_request', '', false, true],
    ['pull_request', 'process-recipe-safety.yml.bak', false, true],
    ['pull_request', 'process-recipe-safety.yml', false, true, 'feature-branch'],
    ['pull_request', 'process-recipe-safety.yml', false, true, ''],
  ]) {
    const actual = runInNewContext(expression, {
      github: {
        event_name: event,
        base_ref: base,
        repository,
        workflow_ref: caller
          ? repository + '/.github/workflows/' + caller + '@refs/heads/main'
          : '',
      },
      inputs: { skip_shared_node_gate: skip },
      startsWith: (value, prefix) => value.toLowerCase().startsWith(prefix.toLowerCase()),
      format: (template, value) => template.replace('{0}', value),
    });
    assert.equal(actual, expected, event + '/' + caller + '/base=' + base + '/skip=' + skip);
  }
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
  const retiredD1 = new URL('../../.github/workflows/ui-v2-d1.yml', import.meta.url);
  assert.equal(existsSync(retiredD1), false);
  for (const name of [
    'ui-v2-stage-c-m4.yml',
    'ui-v2-main-mask.yml',
    'example-recipe-reconstruction.yml',
    'native-fig3-full-replay.yml',
  ]) {
    const source = workflow(name).replaceAll('"', "'");
    assert.ok(source.includes("      - '!site/tests/**'"));
    assert.ok(source.includes("      - 'site/**'"));
  }
  for (const name of ['ui-v2-stage-c-m4.yml', 'ui-v2-main-mask.yml', 'ui-v2-three.yml']) {
    const source = workflow(name).replaceAll('"', "'");
    assert.ok(source.includes("      - '!scripts/v2/capture-visual-first.mjs'"));
  }
  const browser = workflow('browser-regression.yml');
  assert.ok(browser.includes('      - "!examples/**/README.md"'));
  assert.ok(browser.includes('--base=${{ github.event.pull_request.base.sha }}'));
  assert.ok(browser.includes('--head=${{ github.event.pull_request.head.sha }}'));
});

test('documentation contracts have one automatic local Quality owner', () => {
  const docs = workflow('documentation-wiki-targeted.yml');
  assert.match(docs, /workflow_dispatch:/);
  assert.doesNotMatch(docs, /pull_request:|npm ci|node --test/);
  assert.match(docs, /run: node scripts\/local-verification\.mjs verify full/);
  const local = readFileSync(
    new URL('../../scripts/local-verification.mjs', import.meta.url),
    'utf8',
  );
  assert.ok(local.includes("'site/tests/documentation-suite.test.mjs'"));
  assert.ok(local.includes("{ id: 'node', command: 'npm', args: ['test'] }"));
});
