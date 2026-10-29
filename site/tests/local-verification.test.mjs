import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import {
  digest,
  EVIDENCE_FILES,
  qualityPlan,
  requiredQualityDependencies,
  runQuality,
  sourceSnapshot,
  validateEvidence,
  verifyQuality,
} from '../../scripts/local-verification.mjs';

const dependencies = {
  eslint: '10.11.0',
  playwright: '1.55.1',
  prettier: '3.9.9',
  three: '0.179.1',
};
const source = { digest: 'source-digest', fileCount: 3 };

function passing(scope = 'full') {
  const plan = qualityPlan(scope);
  const transcript = plan.map(({ id }) => ({
    id,
    stdout: 'Fixture output for ' + id,
    stderr: '',
    exitCode: 0,
    signal: null,
  }));
  const report = {
    version: 1,
    provenance: 'developer-reported',
    scope,
    status: 'pass',
    source: { ...source },
    environment: {
      node: 'v24.0.0',
      dependencies: requiredQualityDependencies(scope, dependencies),
    },
    planDigest: digest(JSON.stringify(plan)),
    startedAt: '2026-10-20T12:00:00Z',
    finishedAt: '2026-10-20T12:00:01Z',
    checks: plan.map((check, i) => ({
      ...check,
      status: 'pass',
      exitCode: 0,
      signal: null,
      durationMs: 1,
      logDigest: digest(JSON.stringify(transcript[i])),
    })),
  };
  return { report, transcript };
}

function validate({ report, transcript }, scope = 'full') {
  return validateEvidence(report, transcript, source, scope, dependencies);
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'wafercad-evidence-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ devDependencies: dependencies }));
  writeFileSync(join(root, 'source.js'), 'export const value = 1;\n');
  git('init', '-q');
  git('add', '.');
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'fixture',
  );
  for (const [name, version] of Object.entries(dependencies)) {
    if (name === 'playwright') continue; // Browser-only dependency is intentionally absent.
    mkdirSync(join(root, 'node_modules', name), { recursive: true });
    writeFileSync(join(root, 'node_modules', name, 'package.json'), JSON.stringify({ version }));
  }
  return { root, git };
}

function success(check) {
  return { status: 0, signal: null, stdout: 'Fixture ' + check.id + '\n', stderr: '' };
}

test('Quality plans preserve lint, format, docs and full Node ownership', () => {
  assert.deepEqual(
    qualityPlan('full').map((check) => check.id),
    ['lint', 'format', 'docs', 'node'],
  );
  assert.deepEqual(qualityPlan('full').at(-1).args, ['test']);
  assert.ok(qualityPlan('draft').at(-1).args.includes('site/tests/local-verification.test.mjs'));
  assert.throws(() => qualityPlan('none'), /Scope/);
});

test('Quality dependency sets exclude browser-only Playwright but protect Three in full', (t) => {
  assert.deepEqual(requiredQualityDependencies('draft', dependencies), {
    eslint: '10.11.0',
    prettier: '3.9.9',
  });
  assert.deepEqual(requiredQualityDependencies('full', dependencies), {
    eslint: '10.11.0',
    prettier: '3.9.9',
    three: '0.179.1',
  });
  assert.throws(
    () => requiredQualityDependencies('full', { eslint: '10.11.0', prettier: '3.9.9' }),
    /Missing Quality tool: three/,
  );

  const { root } = fixture(t);
  assert.equal(runQuality(root, 'draft', success).checks, 4);
  assert.deepEqual(
    Object.keys(JSON.parse(readFileSync(join(root, EVIDENCE_FILES[0]))).environment.dependencies),
    ['eslint', 'prettier'],
  );
  assert.equal(runQuality(root, 'full', success).checks, 4);
  assert.equal(verifyQuality(root, 'full').scope, 'full');
  rmSync(join(root, 'node_modules/three'), { recursive: true, force: true });
  assert.equal(runQuality(root, 'draft', success).checks, 4);
  assert.throws(() => runQuality(root, 'full', success), /Install pinned Quality tools.*three/);
  assert.throws(() => verifyQuality(root, 'full'));
});

test('full Quality report rejects a mismatched Three version but does not demand Playwright', () => {
  const proof = passing();
  assert.equal(validate(proof).checks, 4);
  proof.report.environment.dependencies.three = '0.0.0';
  assert.throws(() => validate(proof), /Tool version mismatch: three/);
});

test('full evidence satisfies both levels and Draft evidence cannot satisfy Ready', () => {
  assert.equal(validate(passing()).checks, 4);
  assert.equal(validate(passing(), 'draft').scope, 'full');
  assert.equal(validate(passing('draft'), 'draft').scope, 'draft');
  assert.throws(() => validate(passing('draft')), /Full evidence/);
});

test('changed source or source inventory invalidates evidence', () => {
  for (const change of [{ digest: 'changed' }, { fileCount: 99 }]) {
    const evidence = passing();
    Object.assign(evidence.report.source, change);
    assert.throws(() => validate(evidence), /source changed/);
  }
});

test('missing, failed, signalled and skipped results never become passing evidence', () => {
  for (const change of [
    { status: 'skip' },
    { status: 'fail' },
    { exitCode: 1 },
    { exitCode: null },
    { signal: 'SIGTERM' },
    { durationMs: -1 },
  ]) {
    const evidence = passing();
    Object.assign(evidence.report.checks[0], change);
    assert.throws(() => validate(evidence));
  }
  const evidence = passing();
  evidence.report.status = 'fail';
  assert.throws(() => validate(evidence), /did not pass/);
});

test('missing, duplicate, reordered or substituted check commands are rejected', () => {
  for (const mutate of [
    (checks) => checks.pop(),
    (checks) => (checks[1] = checks[0]),
    (checks) => checks.reverse(),
    (checks) => (checks[0].args = ['run', 'unrelated']),
  ]) {
    const evidence = passing();
    mutate(evidence.report.checks);
    assert.throws(() => validate(evidence));
  }
});

test('schema, plan, runtime, toolchain and timestamps are checked', () => {
  for (const mutate of [
    (report) => (report.version = 99),
    (report) => (report.provenance = 'trusted-ci'),
    (report) => (report.planDigest = 'old'),
    (report) => (report.environment.node = 'v20.0.0'),
    (report) => (report.environment.dependencies.eslint = '0.0.0'),
    (report) => (report.finishedAt = 'invalid'),
    (report) => (report.finishedAt = '2026-01-01T00:00:00Z'),
  ]) {
    const evidence = passing();
    mutate(evidence.report);
    assert.throws(() => validate(evidence));
  }
});

test('Node 22 and Node 24 LTS reports are accepted without relaxing tool versions', () => {
  for (const version of ['v22.16.0', 'v24.21.0']) {
    const proof = passing();
    proof.report.environment.node = version;
    assert.equal(validate(proof).checks, 4);
  }
  for (const version of ['v20.19.0', 'v23.11.0', 'v25.0.0', 'unknown']) {
    const proof = passing();
    proof.report.environment.node = version;
    assert.throws(() => validate(proof), /Unsupported Node LTS/);
  }
});

test('legacy v1 Git-index receipts are still verifiable', (t) => {
  const { root } = fixture(t);
  const old = sourceSnapshot(root, 'git-index-v1');
  const proof = passing('draft');
  proof.report.version = 1;
  proof.report.source = old;
  assert.equal(
    validateEvidence(proof.report, proof.transcript, old, 'draft', dependencies).checks,
    4,
  );
  assert.notEqual(sourceSnapshot(root).digest, old.digest);
});

test('source-only manifests and Git checkouts have identical content fingerprints', (t) => {
  const { root, git } = fixture(t);
  const before = sourceSnapshot(root);
  const filenames = git('ls-files', '-z').split('\0').filter(Boolean);
  const files = Object.fromEntries(
    filenames.map((path) => [path, digest(readFileSync(join(root, path)))]),
  );
  writeFileSync(
    join(root, 'wafercad-source-manifest.json'),
    JSON.stringify({
      schema: 'wafercad-source-only-v1',
      files,
      revision: git('rev-parse', 'HEAD').trim(),
    }),
  );
  rmSync(join(root, '.git'), { recursive: true, force: true });
  assert.deepEqual(sourceSnapshot(root), before);
  assert.equal(runQuality(root, 'draft', success).checks, 4);
  assert.equal(verifyQuality(root, 'draft').sourceDigest, before.digest);

  writeFileSync(join(root, 'source.js'), 'changed without Git');
  assert.throws(() => verifyQuality(root, 'draft'), /source changed/);
  writeFileSync(join(root, 'extra.js'), 'unlisted source');
  assert.throws(() => sourceSnapshot(root), /unlisted files/);
  rmSync(join(root, 'extra.js'));
  rmSync(join(root, 'source.js'));
  assert.throws(() => sourceSnapshot(root), /Missing or invalid source/);
});

test('pinned archive omission is portable only when the checked-in archive matches lock integrity', (t) => {
  const { root, git } = fixture(t);
  const archiveName = 'vendor/npm/three-0.179.1.tgz';
  const archive = Buffer.from('a test-only pinned Three.js archive');
  mkdirSync(dirname(join(root, archiveName)), { recursive: true });
  writeFileSync(join(root, archiveName), archive);
  writeFileSync(
    join(root, 'package-lock.json'),
    JSON.stringify({
      packages: {
        'node_modules/three': {
          integrity: 'sha512-' + createHash('sha512').update(archive).digest('base64'),
        },
      },
    }),
  );
  git('add', '.');
  const expected = sourceSnapshot(root);
  const files = Object.fromEntries(
    git('ls-files', '-z')
      .split('\0')
      .filter((path) => path && path !== archiveName)
      .map((path) => [path, digest(readFileSync(join(root, path)))]),
  );
  writeFileSync(
    join(root, 'wafercad-source-manifest.json'),
    JSON.stringify({
      schema: 'wafercad-source-only-v1',
      files,
      excludedDependencyArchives: [archiveName],
    }),
  );
  rmSync(join(root, '.git'), { recursive: true, force: true });
  rmSync(join(root, archiveName));
  assert.deepEqual(sourceSnapshot(root), expected);
  writeFileSync(join(root, archiveName), Buffer.from('tampered archive'));
  assert.throws(() => sourceSnapshot(root), /archive integrity mismatch/);
});

test('missing, edited and empty logs are rejected', () => {
  for (const mutate of [
    (logs) => logs.pop(),
    (logs) => (logs[0].stdout = 'changed'),
    (logs) => (logs[0].stdout = ''),
    (logs) => (logs[0].exitCode = 1),
  ]) {
    const evidence = passing();
    mutate(evidence.transcript);
    assert.throws(() => validate(evidence));
  }
});

test('source identity survives an evidence-only commit', (t) => {
  const { root, git } = fixture(t);
  const before = sourceSnapshot(root);
  runQuality(root, 'draft', success);
  git('add', ...EVIDENCE_FILES);
  git(
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-qm',
    'evidence',
  );
  assert.deepEqual(sourceSnapshot(root), before);
  assert.equal(verifyQuality(root, 'draft').checks, 4);
});

test('untracked sources are rejected and unstaged tracked bytes invalidate evidence', (t) => {
  const { root, git } = fixture(t);
  writeFileSync(join(root, 'extra.js'), 'new source');
  assert.throws(() => sourceSnapshot(root), /Untracked source/);
  git('add', 'extra.js');
  const before = sourceSnapshot(root);
  writeFileSync(join(root, 'source.js'), 'changed source');
  assert.notEqual(sourceSnapshot(root).digest, before.digest);
});

test('assume-unchanged source cannot hide a modified working tree', (t) => {
  const { root, git } = fixture(t);
  git('update-index', '--assume-unchanged', 'source.js');
  assert.throws(() => sourceSnapshot(root), /assumed-unchanged/);
});

test('verifier rejects missing reports and edited compressed transcripts', (t) => {
  const { root } = fixture(t);
  assert.throws(() => verifyQuality(root, 'draft'));
  runQuality(root, 'draft', success);
  writeFileSync(join(root, EVIDENCE_FILES[1]), 'not the certified transcript');
  assert.throws(() => verifyQuality(root, 'draft'), /hash mismatch/);
});

test('a failed rerun replaces old success and does not execute later checks', (t) => {
  const { root } = fixture(t);
  runQuality(root, 'draft', success);
  let calls = 0;
  assert.throws(
    () =>
      runQuality(root, 'draft', () => {
        calls++;
        return { status: 1, signal: null, stdout: 'fixture failure', stderr: '' };
      }),
    /Local Quality failed/,
  );
  assert.equal(calls, 1);
  assert.equal(JSON.parse(readFileSync(join(root, EVIDENCE_FILES[0]))).status, 'fail');
  assert.throws(() => verifyQuality(root, 'draft'), /did not pass/);
});

test('a source change during execution prevents a successful receipt', (t) => {
  const { root, git } = fixture(t);
  assert.throws(
    () =>
      runQuality(root, 'draft', (check) => {
        if (check.id === 'node') {
          writeFileSync(join(root, 'source.js'), 'changed during tests');
          git('add', 'source.js');
        }
        return success(check);
      }),
    /source changed/,
  );
  assert.throws(() => verifyQuality(root, 'draft'), /did not pass/);
});

test('incorrect installed tooling invalidates a rerun instead of retaining old success', (t) => {
  const { root } = fixture(t);
  runQuality(root, 'draft', success);
  writeFileSync(join(root, 'node_modules/eslint/package.json'), '{"version":"0.0.0"}');
  assert.throws(() => runQuality(root, 'draft', success), /Install pinned tools/);
  assert.throws(() => verifyQuality(root, 'draft'));
});

test('evidence symlinks cannot redirect writes outside the repository', (t) => {
  const { root } = fixture(t);
  const target = join(root, 'outside');
  mkdirSync(target);
  writeFileSync(join(target, 'sentinel'), 'preserve');
  symlinkSync(target, join(root, '.verification'), 'junction');
  assert.throws(() => runQuality(root, 'draft', success), /symlinks/);
  assert.equal(readFileSync(join(target, 'sentinel'), 'utf8'), 'preserve');
});

test('the runner executes real npm and Node child processes before issuing a receipt', (t) => {
  const { root, git } = fixture(t);
  const scripts = {
    lint: 'node -e "console.log(1)"',
    'format:check': 'node -e "console.log(2)"',
    'docs:check': 'node -e "console.log(3)"',
  };
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ devDependencies: dependencies, scripts }),
  );
  for (const relative of qualityPlan('draft').at(-1).args.slice(1)) {
    const path = join(root, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "import test from 'node:test';\ntest('fixture', () => {});\n");
  }
  git('add', '.');
  assert.equal(runQuality(root, 'draft').checks, 4);
  assert.equal(verifyQuality(root, 'draft').scope, 'draft');
  assert.throws(() => verifyQuality(root, 'full'), /Full evidence/);
  scripts.lint = 'node -e "process.exit(2)"';
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ devDependencies: dependencies, scripts }),
  );
  git('add', 'package.json');
  assert.throws(() => runQuality(root, 'draft'), /Local Quality failed/);
  const report = JSON.parse(readFileSync(join(root, EVIDENCE_FILES[0])));
  assert.equal(report.checks.length, 1);
  assert.equal(report.checks[0].exitCode, 2);
});

test('a zero-exit process with no output cannot issue a passing report', (t) => {
  const { root } = fixture(t);
  assert.throws(
    () =>
      runQuality(root, 'draft', () => ({
        status: 0,
        signal: null,
        stdout: '',
        stderr: '',
      })),
    /Local Quality failed/,
  );
  assert.equal(JSON.parse(readFileSync(join(root, EVIDENCE_FILES[0]))).status, 'fail');
});