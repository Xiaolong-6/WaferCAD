import assert from 'node:assert/strict';
import test from 'node:test';
import {
  incrementalPlan,
  isPagesBrowserPermissionHotfix,
  parseNameStatus,
  runIncremental,
} from '../../scripts/incremental-quality.mjs';

const changed = (path, status = 'M') => ({ path, status });

test('only explicitly owned presentation, workflow, documentation and tests are incremental', () => {
  const plan = incrementalPlan([
    changed('.github/workflows/daily-full.yml'),
    changed('site/ui-v2/section-view.js'),
    changed('site/ui-v2/section-legend.js'),
    changed('site/tests/section-legend-random.test.mjs', 'A'),
    changed('site/tests/ci-trigger-policy.test.mjs'),
  ]);
  assert.equal(plan.workflow, true);
  assert.ok(plan.tests.includes('site/tests/ci-development-gates.test.mjs'));
  assert.ok(plan.tests.includes('site/tests/section-legend-random.test.mjs'));
  assert.equal(plan.tests.length, new Set(plan.tests).size);
  assert.deepEqual(
    plan.lint,
    plan.files.filter((path) => /\.(?:js|mjs)$/.test(path)),
  );
});

test('scientific, recovery, dependency, unowned, removed and renamed changes reject incremental Quality', () => {
  for (const path of [
    'site/model.js',
    'site/process-worker.js',
    'site/rough-surface.js',
    'site/ui-v2/workstation-runtime.js',
    'scripts/local-verification.mjs',
    'package-lock.json',
    'site/tests/unknown.test.mjs',
    'docs/../../site/model.js',
  ])
    assert.throws(() => incrementalPlan([changed(path)]), /does not own/, path);
  for (const status of ['D', 'R100', 'C100', 'T']) {
    assert.throws(
      () => incrementalPlan([changed('site/ui-v2/section-view.js', status)]),
      /does not own/,
    );
  }
  assert.throws(() => incrementalPlan([]), /Empty/);
  assert.throws(() => incrementalPlan([changed('README.md'), changed('README.md')]), /Duplicate/);
});

test('changed docs demand owned documentation suite and generator', () => {
  const plan = incrementalPlan([changed('docs/CI.md')]);
  assert.equal(plan.docs, true);
  assert.ok(plan.tests.includes('site/tests/documentation-suite.test.mjs'));
  const calls = [];
  runIncremental(plan, (cmd, args) => calls.push([cmd, args]));
  assert.ok(calls.some(([cmd, args]) => cmd === 'npm' && args.includes('docs:check')));
});

test('commands execute tests, lint and format and fail on actual execution errors', () => {
  const plan = incrementalPlan([changed('site/ui-v2/section-legend.js')]);
  const calls = [];
  runIncremental(plan, (cmd, args) => calls.push([cmd, args]));
  assert.ok(calls.some(([, args]) => args.includes('node_modules/eslint/bin/eslint.js')));
  assert.ok(calls.some(([, args]) => args.includes('--check')));
  assert.ok(calls.some(([, args]) => args.includes('site/tests/section-legend-random.test.mjs')));
  assert.throws(
    () =>
      runIncremental(plan, () => {
        throw new Error('lint failed');
      }),
    /lint failed/,
  );
});

test('name-status requires NUL-delimited complete records', () => {
  assert.deepEqual(
    parseNameStatus(
      'M\0site/ui-v2/section-view.js\0A\0site/tests/section-legend-random.test.mjs\0',
    ),
    [
      changed('site/ui-v2/section-view.js'),
      changed('site/tests/section-legend-random.test.mjs', 'A'),
    ],
  );
  assert.throws(() => parseNameStatus('M\0'), /Malformed/);
});

test('Quality infrastructure changes require all security and verification contract owners', () => {
  const plan = incrementalPlan([
    changed('.github/workflows/quality.yml'),
    changed('scripts/incremental-quality.mjs', 'A'),
    changed('site/tests/incremental-quality.test.mjs', 'A'),
  ]);
  for (const path of [
    'site/tests/incremental-quality.test.mjs',
    'site/tests/ci-development-gates.test.mjs',
    'site/tests/local-verification.test.mjs',
    'site/tests/ci-workflow-architecture.test.mjs',
    'site/tests/ci-test-plan.test.mjs',
  ])
    assert.ok(plan.tests.includes(path), path);
});

test('CI routing changes demand their own source-mapping unit contracts', () => {
  const plan = incrementalPlan([changed('scripts/ci-test-plan.mjs')]);
  assert.equal(plan.infrastructure, true);
  assert.ok(plan.tests.includes('site/tests/ci-test-plan.test.mjs'));
});

test('accepted 3D interaction harness has explicit lint and source-retirement ownership', () => {
  const plan = incrementalPlan([changed('scripts/v2/check-three-view.mjs')]);
  assert.deepEqual(plan.lint, ['scripts/v2/check-three-view.mjs']);
  assert.ok(plan.tests.includes('site/tests/source-sunset-view-ux-owners.test.mjs'));
  assert.ok(plan.tests.includes('site/tests/ci-test-plan.test.mjs'));
  assert.equal(plan.infrastructure, false);
});

test('Pages release workflow is incremental only for the exact reusable Browser permission fix', () => {
  const before = `name: Pages
jobs:
  release-browser:
    uses: ./.github/workflows/browser-regression.yml
    permissions:
      contents: read

  release-ui-v2:
    run: echo okay
`;
  const after = before.replace(
    '    permissions:\n      contents: read\n',
    '    permissions:\n      contents: read\n      actions: read\n',
  );
  assert.equal(isPagesBrowserPermissionHotfix(before, after), true);
  for (const mutation of [
    after.replace('echo okay', 'echo bypass'),
    before,
    after.replace('      actions: read', '      actions: write'),
    after.replace('contents: read', 'contents: write'),
  ]) {
    assert.equal(isPagesBrowserPermissionHotfix(before, mutation), false);
  }
  assert.equal(
    incrementalPlan([{ status: 'M', path: '.github/workflows/pages.yml' }]).workflow,
    true,
  );
});
