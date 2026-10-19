import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyRelease, evaluateRelease, PRODUCTION_GATES,
} from '../../scripts/release/verified-pr-release.mjs';

const sha = 'a'.repeat(40);
const base = 'b'.repeat(40);
const head = 'c'.repeat(40);
const check = (name, conclusion = 'success') => ({
  name, status: 'completed', conclusion, app: { slug: 'github-actions' },
});
const pull = {
  number: 17,
  state: 'closed',
  merged: true,
  draft: false,
  merge_commit_sha: sha,
  head: { sha: head },
  base: { ref: 'main' },
};
const seed = () => ({
  event: 'push',
  sha,
  parents: [base, head],
  paths: [
    '.github/workflows/pages.yml',
    'scripts/release/verified-pr-release.mjs',
  ],
  pull,
  sameTree: true,
  baseIsAncestor: true,
  fullQuality: true,
  checks: [check('quality'), check('Release evidence contract')],
});

test('an infra-only change is not a change to shipped geometry or processes', () => {
  assert.equal(classifyRelease(seed().paths), 'infra');
  assert.equal(classifyRelease([...seed().paths, 'docs/operations/README.md']), 'infra');
  assert.equal(classifyRelease(['site/three-view.js']), 'production');
  assert.equal(classifyRelease(['site/model.js']), 'production');
  assert.equal(classifyRelease(['.github/workflows/browser-regression.yml']), 'full');
  assert.equal(classifyRelease([...seed().paths, 'site/model.js']), 'full');
  assert.equal(classifyRelease([]), 'full');
});

test('complete proven CI-only PR is eligible for a fast main release', () => {
  const result = evaluateRelease(seed());
  assert.equal(result.fast, true);
  assert.equal(result.mode, 'infra');
});

test('manual, nonstandard, manipulated, or unproven merge cannot fast-publish', () => {
  const changes = [
    { event: 'workflow_dispatch' },
    { sha: 'bad' },
    { parents: [base] },
    { parents: [head, base] },
    { sameTree: false },
    { baseIsAncestor: false },
    { pull: null },
    { pull: { ...pull, state: 'open' } },
    { pull: { ...pull, draft: true } },
    { pull: { ...pull, merged: false } },
    { pull: { ...pull, head: { sha: 'd'.repeat(40) } } },
    { pull: { ...pull, merge_commit_sha: 'e'.repeat(40) } },
    { fullQuality: false },
  ];
  for (const mutation of changes) {
    assert.equal(evaluateRelease({ ...seed(), ...mutation }).fast, false);
  }
});

test('unknown, missing, stale, duplicated, skipped, and failed PR checks fail closed', () => {
  const candidates = [
    [],
    [check('quality')],
    [check('quality'), check('Release evidence contract', 'skipped')],
    [check('quality'), check('Release evidence contract', 'failure')],
    [check('quality'), check('Release evidence contract'), check('Release evidence contract')],
    [check('quality'), { ...check('Release evidence contract'), status: 'in_progress' }],
    [check('quality'), { ...check('Release evidence contract'), app: { slug: 'untrusted' } }],
    [check('quality'), check('Release evidence contract'), check('additional', 'failure')],
  ];
  for (const checks of candidates) {
    assert.equal(evaluateRelease({ ...seed(), checks }).fast, false);
  }
});

test('production code requires every mandatory science, renderer and UI owner', () => {
  const snapshot = {
    ...seed(),
    paths: ['site/three-view.js', 'site/tests/three-outline-geometry.test.mjs'],
    checks: PRODUCTION_GATES.map((name) => check(name)),
  };
  assert.equal(evaluateRelease(snapshot).fast, true);
  for (const name of PRODUCTION_GATES) {
    const without = snapshot.checks.filter((c) => c.name !== name);
    assert.equal(evaluateRelease({ ...snapshot, checks: without }).fast, false, name);
  }
  assert.equal(evaluateRelease({
    ...snapshot, paths: ['site/three-view.js', '.github/workflows/pages.yml'],
  }).fast, false);
});

test('unselected optional suites may skip, but mandatory suites cannot skip', () => {
  const snapshot = { ...seed(), checks: [...seed().checks, check('Optional visual evidence', 'skipped')] };
  assert.equal(evaluateRelease(snapshot).fast, true);
  snapshot.checks = [check('quality', 'skipped'), check('Release evidence contract')];
  assert.equal(evaluateRelease(snapshot).fast, false);
});
