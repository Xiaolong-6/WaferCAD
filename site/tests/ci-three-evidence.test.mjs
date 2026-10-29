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

test('all Ready owners reuse their individual successful named jobs, not just green status', async () => {
  const { acceptedReadyEvidence, findAcceptedReady } =
    await import('../../scripts/ci-three-evidence.mjs');
  const succeeded = (name) => ({ name, status: 'completed', conclusion: 'success' });
  const selected = {
    browser: true,
    main_mask: true,
    recipe: false,
    klayout: false,
    history: false,
    renderer: false,
    process: false,
    extendedMatrix: ['interaction', 'three'],
  };
  const ownerJobs = [
    succeeded('browser / Plan browser suites'),
    succeeded('browser / Chromium targeted regression'),
    succeeded('browser / Native v2 Release interaction'),
    succeeded('browser / Native v2 Release three'),
    succeeded('main-mask / Main and Mask browser gates'),
  ];
  assert.equal(
    acceptedReadyEvidence({ run, jobs: ownerJobs, current, changedPaths: ciDelta, selected }),
    true,
  );
  for (const job of ownerJobs) {
    assert.equal(
      acceptedReadyEvidence({
        run,
        jobs: ownerJobs.filter((one) => one !== job),
        current,
        changedPaths: ciDelta,
        selected,
      }),
      false,
      `A missing selected job must invalidate proof: ${job.name}`,
    );
  }
  for (const job of ownerJobs) {
    assert.equal(
      acceptedReadyEvidence({
        run,
        jobs: ownerJobs.map((one) => (one === job ? { ...one, conclusion: 'skipped' } : one)),
        current,
        changedPaths: ciDelta,
        selected,
      }),
      false,
      `A skipped selected job is not a passing proof: ${job.name}`,
    );
  }
  // An accepted earlier full Workstation already exercises the exact 3D owner.
  assert.equal(
    acceptedReadyEvidence({
      run,
      jobs: [
        ...ownerJobs.filter((job) => !job.name.endsWith('Release three')),
        succeeded('browser / Native v2 Release workstation'),
      ],
      current,
      changedPaths: ciDelta,
      selected,
    }),
    true,
  );
  // The later successfully reused 3D job cannot itself be counted as an
  // executed 3D acceptance. Search must continue to an older real pass.
  const reusedOnly = { ...run, id: 999, head_sha: 'b'.repeat(40) };
  const visited = [];
  const proof = await findAcceptedReady({
    current,
    token: 'test-token',
    selected,
    gitOps: {
      isAncestor: () => true,
      changedPaths: () => ciDelta,
      sameOwnerCommands: () => true,
    },
    readApi: async (path) => {
      visited.push(path);
      if (path.endsWith('/runs/999/jobs?per_page=100'))
        return { jobs: ownerJobs.filter((one) => !one.name.endsWith('Release three')) };
      if (path.includes('/jobs?')) return { jobs: ownerJobs };
      return { workflow_runs: [reusedOnly, run] };
    },
  });
  assert.equal(proof.runId, run.id);
  assert.ok(visited.includes('/actions/runs/999/jobs?per_page=100'));
});

test('Ready evidence rechecks main, source, owner code and source-delete boundaries', async () => {
  const { acceptedReadyEvidence, findAcceptedReady } =
    await import('../../scripts/ci-three-evidence.mjs');
  const selected = {
    browser: true,
    main_mask: true,
    recipe: false,
    klayout: false,
    history: false,
    renderer: false,
    process: false,
    extendedMatrix: ['interaction', 'three'],
  };
  const ownerJobs = [
    'browser / Plan browser suites',
    'browser / Chromium targeted regression',
    'browser / Native v2 Release interaction',
    'browser / Native v2 Release three',
    'main-mask / Main and Mask browser gates',
  ].map((name) => ({ name, status: 'completed', conclusion: 'success' }));
  for (const mutation of [
    { run: { ...run, conclusion: 'failure' } },
    { run: { ...run, pull_requests: [{ number: 387, base: { ref: 'main', sha: base } }] } },
    { run: { ...run, pull_requests: [{ number: 386, base: { ref: 'main', sha: old } }] } },
    { changedPaths: ['site/ui-v2/section-view.js'] },
    { changedPaths: ['scripts/v2/check-three-view.mjs'] },
    { changedPaths: ['package-lock.json'] },
    { selected: { ...selected, extendedMatrix: ['unknown-owner'] } },
    { selected: { ...selected, renderer: true } },
    { selected: { ...selected, process: true } },
    { selected: { ...selected, klayout: true } },
    { selected: { ...selected, recipe: true } },
    { selected: { ...selected, history: true } },
  ]) {
    assert.equal(
      acceptedReadyEvidence({
        run: mutation.run ?? run,
        jobs: ownerJobs,
        current,
        changedPaths: mutation.changedPaths ?? ciDelta,
        selected: mutation.selected ?? selected,
      }),
      false,
      JSON.stringify(mutation),
    );
  }
  for (const type of ['new-main', 'mutated-commands', 'missing-token', 'wrong-source']) {
    const result = await findAcceptedReady({
      current,
      token: type === 'missing-token' ? '' : 'token',
      selected,
      gitOps: {
        isAncestor: (before) => type !== 'new-main' || before !== base,
        changedPaths: () =>
          type === 'wrong-source' ? ['scripts/v2/check-three-view.mjs'] : ciDelta,
        sameOwnerCommands: () => type !== 'mutated-commands',
      },
      readApi: async (path) =>
        path.includes('/jobs?') ? { jobs: ownerJobs } : { workflow_runs: [run] },
    });
    assert.equal(result, null, type);
  }
});

test('Ready owner commands must match even when changed CI file itself is allowed', async () => {
  const { ownerJobSection, unchangedReadyOwnerCommands } =
    await import('../../scripts/ci-three-evidence.mjs');
  const browser = readFileSync(
    new URL('../../.github/workflows/browser-regression.yml', import.meta.url),
    'utf8',
  );
  const ready = readFileSync(
    new URL('../../.github/workflows/ready-impact.yml', import.meta.url),
    'utf8',
  );
  const selected = {
    browser: true,
    main_mask: true,
    recipe: false,
    klayout: false,
    history: false,
  };
  assert.ok(ownerJobSection(browser, 'browser'));
  assert.ok(ownerJobSection(ready, 'main-mask'));
  assert.equal(
    unchangedReadyOwnerCommands({
      accepted: { browser, ready },
      current: { browser, ready },
      selected,
    }),
    true,
  );
  assert.equal(
    unchangedReadyOwnerCommands({
      accepted: { browser, ready },
      current: {
        browser: browser.replace('run: npm run test:ui:smoke', 'run: echo fake-pass'),
        ready,
      },
      selected,
    }),
    false,
  );
  assert.equal(
    unchangedReadyOwnerCommands({
      accepted: { browser, ready },
      current: {
        browser,
        ready: ready.replace('uses: ./.github/workflows/ui-v2-main-mask.yml', 'uses: ./fake.yml'),
      },
      selected,
    }),
    false,
  );
  // Adding read-only Actions scope for the evidence probe does not alter the
  // tests executed by the reusable Browser owner.
  const beforePermission = ready.replace('      actions: read\n', '');
  assert.equal(
    unchangedReadyOwnerCommands({
      accepted: { browser, ready: beforePermission },
      current: { browser, ready },
      selected,
    }),
    true,
  );
});

test('Ready workflow wires all owner reuse outputs before the verdict without bypassing failures', () => {
  const ready = readFileSync(
    new URL('../../.github/workflows/ready-impact.yml', import.meta.url),
    'utf8',
  );
  assert.match(ready, /name: Reuse already passed source-identical Ready owner gates/);
  assert.match(ready, /run: node scripts\/ci-three-evidence\.mjs --ready/);
  for (const key of ['browser', 'main_mask', 'recipe', 'klayout']) {
    assert.ok(ready.includes(`steps.reuse.outputs.${key} || steps.plan.outputs.${key}`));
  }
  assert.ok(ready.includes('steps.reuse.outputs.history || steps.plan.outputs.history_required'));
  assert.ok(ready.includes('actions: read'));
  assert.match(ready, /needs\.impact\.result/);
  assert.ok(ready.includes('test "${!result}" = success'));
});
