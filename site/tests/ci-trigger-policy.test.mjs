import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import vm from 'node:vm';
import {
  auditWorkflowEvents,
  declaredEvents,
  permittedSourceTransport,
} from '../../scripts/ci-trigger-policy.mjs';

const directory = resolve(fileURLToPath(new URL('../../.github/workflows/', import.meta.url)));
function sources() {
  return Object.fromEntries(
    readdirSync(directory)
      .filter((name) => name.endsWith('.yml'))
      .map((name) => [name, readFileSync(resolve(directory, name), 'utf8')]),
  );
}

test('the 64 workflow inventory allows only three PR owners and one daily schedule', () => {
  assert.deepEqual(auditWorkflowEvents(sources()), []);
});

test('reading YAML events ignores job bodies and comments', () => {
  const example = `name: Test\non:\n  workflow_dispatch:\njobs:\n  show:\n    steps:\n      - run: echo \"pull_request: push: schedule:\"\n`;
  assert.deepEqual([...declaredEvents(example)], ['workflow_dispatch']);
});

test('adding a costly PR trigger to an ordinary owner is rejected', () => {
  const files = sources();
  files['ui-v2-three.yml'] = files['ui-v2-three.yml'].replace('on:\n', 'on:\n  pull_request:\n');
  assert.match(
    auditWorkflowEvents(files).join(' '),
    /ui-v2-three.yml: forbidden automatic pull_request/,
  );
});

test('adding a second schedule is rejected, including a weekly schedule', () => {
  const files = sources();
  files['browser-regression.yml'] = files['browser-regression.yml'].replace(
    'on:\n',
    "on:\n  schedule:\n    - cron: '17 2 * * 1'\n",
  );
  assert.match(
    auditWorkflowEvents(files).join(' '),
    /browser-regression.yml: forbidden automatic schedule/,
  );
});

test('nightly missing a required regression group fails closed', () => {
  const files = sources();
  files['daily-full.yml'] = files['daily-full.yml'].replace(
    './.github/workflows/v2-history-recovery-lease.yml',
    './.github/workflows/ui-v2-three.yml',
  );
  assert.match(
    auditWorkflowEvents(files).join(' '),
    /missing mandatory v2-history-recovery-lease.yml/,
  );
});

test('quality cannot revert to remote test fallback on Draft PRs', () => {
  const files = sources();
  files['quality.yml'] = files['quality.yml'].replace(
    'Reject missing or stale PR proof before remote tests',
    'Run all tests for missing local proof',
  );
  assert.match(
    auditWorkflowEvents(files).join(' '),
    /Draft\/Ready must reject missing source-bound evidence/,
  );
});

test('opt-in source transport is allowed only for labeled events', () => {
  const files = sources();
  assert.equal(
    permittedSourceTransport('offline-source-bundle.yml', files['offline-source-bundle.yml']),
    true,
  );
  assert.deepEqual(auditWorkflowEvents(files), []);
  files['offline-source-bundle.yml'] = files['offline-source-bundle.yml'].replace(
    'types: [labeled]',
    'types: [opened, synchronize, labeled]',
  );
  assert.match(auditWorkflowEvents(files).join(' '), /forbidden automatic pull_request/);
});

test('daily runner budget is an alert, while mandatory suites remain fail-closed', () => {
  const daily = sources()['daily-full.yml'];
  assert.match(daily, /core\.warning\(`Daily CI used /);
  assert.doesNotMatch(daily, /core\.setFailed\(`Daily CI used /);
  assert.match(daily, /Fail on any missing, skipped or failed mandatory group/);
  assert.match(daily, /job\.result !== 'success'/);
});

// Exercise the actual github-script embedded in the workflow; do not mock
// a parallel algorithm that can silently drift away from the deployed gate.
function dailyDecisionScript(yaml) {
  const lines = yaml.split(/\r?\n/);
  const step = lines.indexOf('      - name: Check last scheduled SHA and exact full verdict');
  assert.ok(step > 0);
  const marker = lines.indexOf('          script: |', step);
  assert.ok(marker > step);
  const body = [];
  for (let i = marker + 1; i < lines.length; i++) {
    if (lines[i] && !lines[i].startsWith('            ')) break;
    body.push(lines[i].slice(12));
  }
  return new vm.Script('(async () => {\n' + body.join('\n') + '\n})()', {
    filename: 'daily-full.yml:plan',
  });
}

const sameSha = 'abc123';
const otherSha = 'def456';
function historicalRun(id, conclusion = 'success', sha = sameSha, status = 'completed') {
  return { id, conclusion, head_sha: sha, status };
}
const fullJobs = [
  { name: 'Full lint, format, docs and all Node tests / quality', conclusion: 'success' },
  { name: 'Daily full regression verdict', conclusion: 'success' },
];
const skippedJobs = [
  { name: 'Schedule only changed or unverified main', conclusion: 'success' },
  { name: 'Daily full regression verdict', conclusion: 'success' },
];

async function scheduledDecision({
  event = 'schedule',
  history = [],
  jobs = {},
  failList = false,
  failJobs = false,
}) {
  const output = [];
  const warnings = [];
  let summaryWritten = false;
  let listCalls = 0;
  const core = {
    info() {},
    warning(message) {
      warnings.push(message);
    },
    setOutput(key, value) {
      output.push([key, value]);
    },
    summary: {
      addHeading() {
        return this;
      },
      addRaw() {
        return this;
      },
      async write() {
        summaryWritten = true;
      },
    },
  };
  const github = {
    rest: {
      actions: {
        async listWorkflowRuns(options) {
          listCalls++;
          assert.equal(options.workflow_id, 'daily-full.yml');
          assert.equal(options.branch, 'main');
          assert.equal(options.event, 'schedule');
          if (failList) throw Error('history unavailable');
          return {
            data: {
              workflow_runs: [historicalRun(100, null, sameSha, 'in_progress'), ...history],
            },
          };
        },
        listJobsForWorkflowRun: () => {},
      },
    },
    async paginate(_api, { run_id: id }) {
      if (failJobs) throw Error('jobs unavailable');
      return jobs[id] || [];
    },
  };
  await dailyDecisionScript(sources()['daily-full.yml']).runInNewContext({
    context: {
      eventName: event,
      repo: { owner: 'Xiaolong-6', repo: 'WaferCAD' },
      sha: sameSha,
      runId: 100,
    },
    core,
    github,
  });
  assert.equal(output.length, 1, 'emit one nightly decision');
  assert.equal(output[0][0], 'full');
  return { full: output[0][1], warnings, summaryWritten, listCalls };
}

test('nightly decision gates every required job and preserves fail-closed verdict', () => {
  const daily = sources()['daily-full.yml'];
  const names = [
    'quality',
    'browser',
    'main-mask',
    'stage-c',
    'recipe',
    'history-recovery',
    'physical-science',
    'example-replay',
    'renderer-isolation',
    'worker-fault',
  ];
  for (const name of names) {
    const condition =
      '  ' +
      name +
      ':\n    needs: plan\n    if: ' +
      '$' +
      "{{ needs.plan.outputs.full == 'true' }}";
    assert.ok(daily.includes(condition), 'missing guarded mandatory group: ' + name);
  }
  assert.match(daily, /cron: '30 2 \* \* \*'/);
  assert.match(daily, /Fail on any missing, skipped or failed mandatory group/);
  assert.match(daily, /group\.plan\?\.result !== 'success'/);
  assert.match(daily, /job\.result !== 'success'/);
  assert.match(daily, /job\.result !== 'skipped'/);
});

for (const scenario of [
  { name: 'manual always runs full', event: 'workflow_dispatch', full: 'true', listCalls: 0 },
  { name: 'no history runs full', full: 'true' },
  {
    name: 'new main SHA runs full',
    history: [historicalRun(99, 'success', otherSha)],
    full: 'true',
  },
  { name: 'latest failure retries full', history: [historicalRun(99, 'failure')], full: 'true' },
  {
    name: 'latest cancellation retries full',
    history: [historicalRun(99, 'cancelled')],
    full: 'true',
  },
  {
    name: 'latest queued run cannot be ignored',
    history: [historicalRun(99, null, sameSha, 'queued')],
    full: 'true',
  },
  {
    name: 'latest running run cannot be ignored',
    history: [historicalRun(99, null, sameSha, 'in_progress')],
    full: 'true',
  },
  {
    name: 'Quality without verdict is not enough',
    history: [historicalRun(99)],
    jobs: { 99: fullJobs.slice(0, 1) },
    full: 'true',
  },
  {
    name: 'skipped verdict without Quality is not enough',
    history: [historicalRun(99)],
    jobs: { 99: skippedJobs },
    full: 'true',
  },
  {
    name: 'same-SHA full success permits skip',
    history: [historicalRun(99)],
    jobs: { 99: fullJobs },
    full: 'false',
  },
  {
    name: 'successful skipped runs inherit preceding full proof',
    history: [historicalRun(99), historicalRun(98)],
    jobs: { 99: skippedJobs, 98: fullJobs },
    full: 'false',
  },
  {
    name: 'intervening failure invalidates proof',
    history: [historicalRun(99), historicalRun(98, 'failure'), historicalRun(97)],
    jobs: { 99: skippedJobs, 97: fullJobs },
    full: 'true',
  },
  {
    name: 'intervening SHA change invalidates proof',
    history: [historicalRun(99), historicalRun(98, 'success', otherSha)],
    jobs: { 99: skippedJobs, 98: fullJobs },
    full: 'true',
  },
  { name: 'history API failure runs full', failList: true, full: 'true', warning: true },
  {
    name: 'jobs API failure runs full',
    failJobs: true,
    history: [historicalRun(99)],
    full: 'true',
    warning: true,
  },
]) {
  test('nightly scenario: ' + scenario.name, async () => {
    const result = await scheduledDecision(scenario);
    assert.equal(result.full, scenario.full);
    if (scenario.listCalls !== undefined) assert.equal(result.listCalls, scenario.listCalls);
    if (scenario.warning) assert.equal(result.warnings.length, 1);
    if (scenario.full === 'false') assert.equal(result.summaryWritten, true);
  });
}
