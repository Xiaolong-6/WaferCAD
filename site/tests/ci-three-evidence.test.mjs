import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  acceptedThreeEvidence,
  ciOnlySinceAccepted,
  filteredThreeMatrix,
  findAcceptedThree,
} from '../../scripts/ci-three-evidence.mjs';

const base = 'c526605045dba540468ff5faa2561063e8403662';
const old = '49d4e989c7c8e57dad3006b8667f8f7f3dcb6c63';
const head = 'c8c108db4dd653942dded21eb217873f6ca32a61';
const current = {
  repository: 'Xiaolong-6/WaferCAD',
  branch: 'fix/main-ci-budget-and-random-palette-20261029',
  base,
  head,
  prNumber: 386,
};
const run = {
  id: 40877891242,
  name: 'Ready risk-targeted acceptance',
  path: '.github/workflows/ready-impact.yml',
  status: 'completed',
  conclusion: 'success',
  event: 'pull_request',
  head_sha: old,
  head_branch: current.branch,
  repository: { full_name: current.repository },
  head_repository: { full_name: current.repository },
  pull_requests: [{ number: 386, base: { ref: 'main', sha: base } }],
};
const jobs = [
  { name: 'browser / Native v2 Release workstation', status: 'completed', conclusion: 'success' },
];
const ciDelta = ['.github/workflows/browser-regression.yml', 'scripts/ci-test-plan.mjs'];

test('accepted exact-source Workstation proof can replace redundant native 3D', () => {
  assert.equal(acceptedThreeEvidence({ run, jobs, current, changedPaths: ciDelta }), true);
  assert.deepEqual(filteredThreeMatrix(['interaction', 'three']), {
    extended: true,
    matrix: ['interaction'],
  });
  assert.deepEqual(filteredThreeMatrix(['three']), { extended: false, matrix: ['none'] });
  assert.throws(() => filteredThreeMatrix(['interaction']), /explicitly selected/);
});

test('any changed product, fixture, test harness, dependencies or unknown path fails closed', () => {
  for (const path of [
    'site/app.js',
    'site/ui-v2/section-view.js',
    'site/ui-v2/section-legend.js',
    'scripts/v2/check-three-view.mjs',
    'scripts/v2/project-fixtures.mjs',
    'scripts/test-helpers/ui.mjs',
    'package-lock.json',
    'package.json',
    'site/tests/model.test.mjs',
    'docs/new-feature.md',
  ]) {
    assert.equal(ciOnlySinceAccepted([...ciDelta, path]), false, path);
    assert.equal(
      acceptedThreeEvidence({ run, jobs, current, changedPaths: [...ciDelta, path] }),
      false,
      path,
    );
  }
  assert.equal(ciOnlySinceAccepted([]), false);
});

test('failed, skipped, misleading or cross-PR evidence can never suppress 3D', () => {
  for (const mutation of [
    { run: { ...run, conclusion: 'failure' } },
    { run: { ...run, status: 'in_progress' } },
    { run: { ...run, event: 'push' } },
    { run: { ...run, path: '.github/workflows/quality.yml' } },
    { run: { ...run, head_sha: head } },
    { run: { ...run, head_branch: 'other' } },
    { run: { ...run, pull_requests: [{ number: 387, base: { ref: 'main', sha: base } }] } },
    { run: { ...run, pull_requests: [{ number: 386, base: { ref: 'main', sha: old } }] } },
    { jobs: [{ ...jobs[0], conclusion: 'skipped' }] },
    {
      jobs: [{ name: 'browser / Plan browser suites', conclusion: 'success', status: 'completed' }],
    },
    { jobs: [] },
  ]) {
    assert.equal(
      acceptedThreeEvidence({
        run: mutation.run ?? run,
        jobs: mutation.jobs ?? jobs,
        current,
        changedPaths: ciDelta,
      }),
      false,
      JSON.stringify(mutation),
    );
  }
});

test('candidate selection requires ancestry, source allowlist, passed named owner, same PR/main', async () => {
  const other = { ...run, id: 999, head_sha: 'a'.repeat(40) };
  const requests = [];
  const proof = await findAcceptedThree({
    current,
    token: 'test-token',
    gitOps: {
      isAncestor: (a, b) => (a === base && b === old) || (a === old && b === head),
      changedPaths: () => ciDelta,
    },
    readApi: async (path) => {
      requests.push(path);
      return path.includes('/jobs?') ? { jobs } : { workflow_runs: [other, run] };
    },
  });
  assert.deepEqual(proof, { runId: run.id, sourceHead: old, changedPaths: ciDelta });
  assert.ok(requests.some((p) => p.includes('event=pull_request')));
  assert.ok(requests.some((p) => p.includes(`/runs/${run.id}/jobs`)));
});

test('no prior proof, token, matched metadata or source changes means real browser fallback', async () => {
  for (const mode of ['no-token', 'no-runs', 'source-change', 'bad-jobs']) {
    const proof = await findAcceptedThree({
      current,
      token: mode === 'no-token' ? '' : 'test-token',
      gitOps: {
        isAncestor: () => true,
        changedPaths: () => (mode === 'source-change' ? ['site/model.js'] : ciDelta),
      },
      readApi: async (path) =>
        path.includes('/jobs?')
          ? { jobs: mode === 'bad-jobs' ? [] : jobs }
          : { workflow_runs: mode === 'no-runs' ? [] : [run] },
    });
    assert.equal(proof, null, mode);
  }
});

test('changed main base without ancestry refuses stale browser evidence', async () => {
  const checked = [];
  const proof = await findAcceptedThree({
    current,
    token: 'test-token',
    gitOps: {
      isAncestor: (a, b) => {
        checked.push([a, b]);
        return a !== base;
      },
      changedPaths: () => ciDelta,
    },
    readApi: async () => ({ workflow_runs: [run] }),
  });
  assert.equal(proof, null);
  assert.deepEqual(checked, [[base, old]]);
});

test('Ready browser matrix only removes three with a successful authenticated proof', () => {
  const browser = readFileSync(
    new URL('../../.github/workflows/browser-regression.yml', import.meta.url),
    'utf8',
  );
  const ready = readFileSync(
    new URL('../../.github/workflows/ready-impact.yml', import.meta.url),
    'utf8',
  );
  assert.match(
    browser,
    /steps\.three_reuse\.outputs\.extended \|\| steps\.plan\.outputs\.extended/,
  );
  assert.match(
    browser,
    /steps\.three_reuse\.outputs\.extended_matrix \|\| steps\.plan\.outputs\.extended_matrix/,
  );
  assert.match(browser, /name: Reuse source-identical accepted 3D browser evidence/);
  assert.match(browser, /node scripts\/ci-three-evidence\.mjs/);
  assert.match(
    browser,
    /github\.event_name == 'pull_request' && !github\.event\.pull_request\.draft && !inputs\.force_full/,
  );
  assert.match(browser, /actions: read/);
  assert.match(ready, /browser:[\s\S]*?permissions:[\s\S]*?actions: read/);
  assert.match(browser, /three\) node scripts\/v2\/check-three-view\.mjs ;;/);
  assert.match(browser, /workstation\) npm run test:ui:workstation ;;/);
});
