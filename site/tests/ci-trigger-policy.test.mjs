import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { auditWorkflowEvents, declaredEvents, permittedSourceTransport } from '../../scripts/ci-trigger-policy.mjs';

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
  assert.equal(permittedSourceTransport('offline-source-bundle.yml', files['offline-source-bundle.yml']), true);
  assert.deepEqual(auditWorkflowEvents(files), []);
  files['offline-source-bundle.yml'] = files['offline-source-bundle.yml'].replace(
    'types: [labeled]', 'types: [opened, synchronize, labeled]',
  );
  assert.match(auditWorkflowEvents(files).join(' '), /forbidden automatic pull_request/);
});
