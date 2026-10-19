import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyRelease,
  evaluateRelease,
  latestCheckRuns,
  targetedProductionGates,
} from '../../scripts/release/verified-pr-release.mjs';

const sha = 'a'.repeat(40);
const base = 'b'.repeat(40);
const head = 'c'.repeat(40);
const check = (name, conclusion = 'success') => ({
  name,
  status: 'completed',
  conclusion,
  app: { slug: 'github-actions' },
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
  paths: ['.github/workflows/pages.yml', 'scripts/release/verified-pr-release.mjs'],
  pull,
  sameTree: true,
  baseIsAncestor: true,
  fullQuality: true,
  checks: [check('quality'), check('Release evidence contract')],
});

test('an infra-only change is not a change to shipped geometry or processes', () => {
  assert.equal(classifyRelease(seed().paths), 'infra');
  assert.equal(classifyRelease([...seed().paths, 'docs/operations/README.md']), 'infra');
  assert.equal(
    classifyRelease([...seed().paths, 'site/tests/ci-workflow-architecture.test.mjs']),
    'infra',
  );
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

test('Draft and Ready PR checks use only the newest attempt without masking red or pending', () => {
  const draft = {
    ...check('quality'),
    id: 100,
    started_at: '2026-10-19T14:00:00Z',
  };
  const ready = {
    ...check('quality'),
    id: 101,
    started_at: '2026-10-19T14:02:00Z',
  };
  const proof = { ...check('Release evidence contract'), id: 102, started_at: ready.started_at };
  const latest = latestCheckRuns([ready, draft, proof]);
  assert.equal(latest.length, 2);
  assert.equal(latest.find((item) => item.name === 'quality').id, ready.id);
  assert.equal(evaluateRelease({ ...seed(), checks: latest }).fast, true);

  for (const conclusion of ['failure', 'cancelled', 'skipped']) {
    const selected = latestCheckRuns([draft, { ...ready, conclusion }, proof]);
    assert.equal(evaluateRelease({ ...seed(), checks: selected }).fast, false, conclusion);
  }
  const pending = latestCheckRuns([
    draft,
    { ...ready, status: 'in_progress', conclusion: null },
    proof,
  ]);
  assert.equal(evaluateRelease({ ...seed(), checks: pending }).fast, false);
  const queued = latestCheckRuns([
    { ...draft, created_at: draft.started_at },
    { ...ready, started_at: null, created_at: ready.started_at, status: 'queued', conclusion: null },
    proof,
  ]);
  assert.equal(queued.find((item) => item.name === 'quality').status, 'queued');
  assert.equal(evaluateRelease({ ...seed(), checks: queued }).fast, false);
  assert.equal(latestCheckRuns([draft, { ...draft }]), null);
  assert.equal(latestCheckRuns([{ ...ready, id: null }]), null);
  assert.equal(latestCheckRuns([{ ...draft, started_at: 'unparseable' }]), null);
  assert.equal(latestCheckRuns([ready, { ...draft, conclusion: 'failure' }])[0].id, ready.id);
});

test('Photodetector Renderer changes require focused science and real browser owners', () => {
  const paths = [
    'site/gpu-rough-surface.js',
    'site/surface-rendering.js',
    'site/three-view.js',
    'site/tests/gpu-rough-surface.test.mjs',
  ];
  const required = targetedProductionGates(paths);
  for (const name of [
    'quality',
    'Plan browser suites',
    'Chromium targeted regression',
    'Native v2 Release renderer',
    '625-site array renderer regression',
    '625-site edge-on exact-wall restoration',
    'Stage C shared runtime and M4 real projects',
  ])
    assert.ok(required.includes(name), name);
  const snapshot = { ...seed(), paths, checks: required.map((name) => check(name)) };
  assert.equal(evaluateRelease(snapshot).fast, true);
  for (const name of required) {
    const without = snapshot.checks.filter((c) => c.name !== name);
    assert.equal(evaluateRelease({ ...snapshot, checks: without }).fast, false, name);
    assert.equal(
      evaluateRelease({
        ...snapshot,
        checks: snapshot.checks.map((c) => (c.name === name ? check(name, 'skipped') : c)),
      }).fast,
      false,
      name,
    );
  }
});

test('Mask onboarding PR requires its shared UI and Main/Mask browser gates', () => {
  const paths = ['site/ui-v2/mask-view.js', 'site/ui-v2/view-kit/empty-state.js'];
  const required = targetedProductionGates(paths);
  assert.ok(required.includes('Native v2 Release workstation'));
  assert.ok(required.includes('Main and Mask browser gates'));
  assert.ok(required.includes('Stage C shared runtime and M4 real projects'));
  assert.ok(!required.includes('625-site array renderer regression'));
  const snapshot = { ...seed(), paths, checks: required.map((name) => check(name)) };
  assert.equal(evaluateRelease(snapshot).fast, true);
  assert.equal(
    evaluateRelease({
      ...snapshot,
      checks: snapshot.checks.filter((c) => c.name !== 'Main and Mask browser gates'),
    }).fast,
    false,
  );
});

test('bundled Project IO, recovery, scientific and unknown scopes remain full release', () => {
  for (const path of [
    'site/project-io.js',
    'site/project-worker.js',
    'site/ui-v2/workstation-workflow.js',
    'site/workspace-storage-worker.js',
    'site/model.js',
    'site/process-recipe.js',
    'site/history-transaction.js',
    'site/gds.js',
    'scripts/build-pages-artifact.mjs',
    'package-lock.json',
  ]) {
    assert.equal(targetedProductionGates([path]), null, path);
    assert.equal(
      evaluateRelease({
        ...seed(),
        paths: [path],
        checks: ['quality', ...targetedProductionGates(['site/three-view.js'])].map((name) =>
          check(name),
        ),
      }).fast,
      false,
      path,
    );
  }
  assert.equal(
    targetedProductionGates(['docs/science/ROUGHNESS_MORPHOLOGY.md']).join(','),
    'quality',
  );
  assert.equal(
    evaluateRelease({ ...seed(), paths: ['site/three-view.js', '.github/workflows/pages.yml'] })
      .fast,
    false,
  );
});

test('unselected optional suites may skip, but mandatory suites cannot skip', () => {
  const snapshot = {
    ...seed(),
    checks: [...seed().checks, check('Optional visual evidence', 'skipped')],
  };
  assert.equal(evaluateRelease(snapshot).fast, true);
  snapshot.checks = [check('quality', 'skipped'), check('Release evidence contract')];
  assert.equal(evaluateRelease(snapshot).fast, false);
});
