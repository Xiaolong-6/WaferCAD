import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

export const EVIDENCE_FILES = [
  '.verification/quality/report.json',
  '.verification/quality/transcript.json.gz',
];
const MAX_LOG = 64 * 1024 * 1024;
const MAX_REPORT = 128 * 1024;
const VERSION = 1;

export function qualityPlan(scope) {
  if (scope !== 'draft' && scope !== 'full') throw new Error('Scope must be draft or full');
  return [
    { id: 'lint', command: 'npm', args: ['run', 'lint'] },
    { id: 'format', command: 'npm', args: ['run', 'format:check'] },
    { id: 'docs', command: 'npm', args: ['run', 'docs:check'] },
    scope === 'full'
      ? { id: 'node', command: 'npm', args: ['test'] }
      : {
          id: 'node',
          command: 'node',
          args: [
            '--test',
            'site/tests/ci-test-plan.test.mjs',
            'site/tests/ci-development-gates.test.mjs',
            'site/tests/ci-workflow-architecture.test.mjs',
            'site/tests/local-verification.test.mjs',
            'site/tests/documentation-suite.test.mjs',
          ],
        },
  ];
}

export function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: MAX_LOG });
}

export function sourceSnapshot(root) {
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter((path) => path && !EVIDENCE_FILES.includes(path));
  if (untracked.length) throw new Error('Stage source files first: ' + untracked.join(', '));
  const dirty = git(root, ['diff', '--no-ext-diff', '--name-only', '-z'])
    .split('\0')
    .filter((path) => path && !EVIDENCE_FILES.includes(path));
  if (dirty.length) throw new Error('Stage source changes before verifying: ' + dirty.join(', '));
  const flags = git(root, ['ls-files', '-v', '-z']).split('\0').filter(Boolean);
  requireValue(
    flags.every((entry) => entry.startsWith('H ')),
    'Sparse or assumed-unchanged files are unsupported',
  );
  const entries = git(root, ['ls-files', '--stage', '-z'])
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/);
      if (!match || match[3] !== '0') throw new Error('Unmerged or invalid Git index');
      return { mode: match[1], blob: match[2], path: match[4] };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const hash = createHash('sha256');
  let fileCount = 0;
  for (const { mode, blob, path } of entries) {
    if (EVIDENCE_FILES.includes(path)) continue;
    if (!['100644', '100755'].includes(mode) || !lstatSync(join(root, path)).isFile()) {
      throw new Error('Source must contain regular files: ' + path);
    }
    hash.update(JSON.stringify([path, mode, blob]) + '\n');
    fileCount++;
  }
  if (!fileCount) throw new Error('Source index is empty');
  return { digest: hash.digest('hex'), fileCount };
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function readBounded(path, limit) {
  const stat = lstatSync(path);
  requireValue(stat.isFile() && stat.size <= limit, 'Invalid or oversized evidence: ' + path);
  return readFileSync(path);
}

export function validateEvidence(report, transcript, source, requiredScope, dependencies) {
  qualityPlan(requiredScope);
  requireValue(report?.version === VERSION, 'Unsupported evidence version');
  requireValue(report.provenance === 'developer-reported', 'Missing evidence provenance');
  requireValue(report.scope === 'full' || report.scope === requiredScope, 'Full evidence required');
  const plan = qualityPlan(report.scope);
  requireValue(report.status === 'pass', 'Local Quality did not pass');
  requireValue(
    report.source?.digest === source.digest && report.source.fileCount === source.fileCount,
    'Evidence is stale: source changed',
  );
  requireValue(report.planDigest === digest(JSON.stringify(plan)), 'Test plan changed');
  requireValue(/^v24\./.test(report.environment?.node || ''), 'Node 24 evidence required');
  for (const [name, version] of Object.entries(dependencies)) {
    requireValue(
      report.environment.dependencies?.[name] === version,
      'Tool version mismatch: ' + name,
    );
  }
  requireValue(
    Number.isFinite(Date.parse(report.startedAt)) &&
      Number.isFinite(Date.parse(report.finishedAt)) &&
      Date.parse(report.finishedAt) >= Date.parse(report.startedAt),
    'Invalid evidence timestamps',
  );
  requireValue(
    Array.isArray(report.checks) && report.checks.length === plan.length,
    'Missing checks',
  );
  requireValue(Array.isArray(transcript) && transcript.length === plan.length, 'Missing logs');
  for (let i = 0; i < plan.length; i++) {
    const check = report.checks[i];
    const log = transcript[i];
    const expected = plan[i];
    requireValue(
      check?.id === expected.id &&
        check.command === expected.command &&
        JSON.stringify(check.args) === JSON.stringify(expected.args),
      'Wrong check command: ' + expected.id,
    );
    requireValue(
      check.status === 'pass' && check.exitCode === 0 && check.signal === null,
      'Failed or skipped check: ' + expected.id,
    );
    requireValue(
      Number.isFinite(check.durationMs) && check.durationMs >= 0,
      'Invalid check duration: ' + expected.id,
    );
    requireValue(
      log?.id === expected.id &&
        typeof log.stdout === 'string' &&
        log.stdout.length > 0 &&
        typeof log.stderr === 'string' &&
        log.exitCode === 0 &&
        log.signal === null &&
        digest(JSON.stringify(log)) === check.logDigest,
      'Missing or inconsistent log: ' + expected.id,
    );
  }
  return { scope: report.scope, sourceDigest: source.digest, checks: plan.length };
}

function evidenceDirectory(root, create = false) {
  for (const relative of ['.verification', '.verification/quality']) {
    const path = join(root, relative);
    if (create && !existsSync(path)) mkdirSync(path);
    requireValue(lstatSync(path).isDirectory(), 'Evidence directories must not be symlinks');
  }
}

export function verifyQuality(root, requiredScope) {
  evidenceDirectory(root);
  const source = sourceSnapshot(root);
  const report = JSON.parse(readBounded(join(root, EVIDENCE_FILES[0]), MAX_REPORT));
  const archive = readBounded(join(root, EVIDENCE_FILES[1]), MAX_LOG);
  requireValue(digest(archive) === report.transcriptDigest, 'Transcript hash mismatch');
  const transcript = JSON.parse(gunzipSync(archive, { maxOutputLength: MAX_LOG }));
  const dependencies = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies;
  const result = validateEvidence(report, transcript, source, requiredScope, dependencies);
  requireValue(sourceSnapshot(root).digest === source.digest, 'Source changed while verifying');
  return result;
}

function executeCheck(check, root) {
  const executable = check.command === 'node' ? process.execPath : 'npm';
  return spawnSync(executable, check.args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: MAX_LOG,
    shell: check.command === 'npm' && process.platform === 'win32',
  });
}

export function runQuality(root, scope, execute = executeCheck) {
  const plan = qualityPlan(scope);
  evidenceDirectory(root, true);
  for (const path of EVIDENCE_FILES) rmSync(join(root, path), { force: true });
  const source = sourceSnapshot(root);
  const expected = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies;
  const installed = {};
  for (const [name, version] of Object.entries(expected)) {
    installed[name] = JSON.parse(
      readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'),
    ).version;
    requireValue(installed[name] === version, 'Install pinned tools before verifying: ' + name);
  }
  requireValue(/^v24\./.test(process.version), 'Use Node 24 for local Quality');
  const report = {
    version: VERSION,
    provenance: 'developer-reported',
    scope,
    status: 'fail',
    source,
    sourceRevision: git(root, ['rev-parse', 'HEAD']).trim(),
    planDigest: digest(JSON.stringify(plan)),
    environment: { node: process.version, platform: process.platform, dependencies: installed },
    startedAt: new Date().toISOString(),
    checks: [],
  };
  const transcript = [];
  for (const check of plan) {
    console.log('Local Quality: ' + check.command + ' ' + check.args.join(' '));
    const started = Date.now();
    const result = execute(check, root);
    const log = {
      id: check.id,
      stdout: result.stdout || '',
      stderr: (result.stderr || '') + (result.error ? '\n' + result.error.message : ''),
      exitCode: result.status ?? null,
      signal: result.signal ?? null,
    };
    process.stdout.write(log.stdout);
    process.stderr.write(log.stderr);
    transcript.push(log);
    report.checks.push({
      ...check,
      status: log.exitCode === 0 && log.signal === null && !result.error ? 'pass' : 'fail',
      exitCode: log.exitCode,
      signal: log.signal,
      durationMs: Date.now() - started,
      logDigest: digest(JSON.stringify(log)),
    });
    if (report.checks.at(-1).status !== 'pass') break;
  }
  report.finishedAt = new Date().toISOString();
  const after = sourceSnapshot(root);
  report.status =
    report.checks.length === plan.length &&
    report.checks.every((check) => check.status === 'pass') &&
    after.digest === source.digest
      ? 'pass'
      : 'fail';
  const archive = gzipSync(JSON.stringify(transcript));
  report.transcriptDigest = digest(archive);
  writeFileSync(join(root, EVIDENCE_FILES[1]), archive);
  writeFileSync(join(root, EVIDENCE_FILES[0]), JSON.stringify(report, null, 2) + '\n');
  requireValue(
    report.status === 'pass',
    'Local Quality failed or source changed; fix and rerun locally',
  );
  return verifyQuality(root, scope);
}

function main() {
  const [mode, scope = 'full', ...extra] = process.argv.slice(2);
  requireValue(
    (mode === 'run' || mode === 'verify') && !extra.length,
    'Use run|verify [draft|full]',
  );
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const result = mode === 'run' ? runQuality(root, scope) : verifyQuality(root, scope);
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error('Quality evidence rejected: ' + error.message);
    console.error('Run locally: node scripts/local-verification.mjs run draft (or full).');
    console.error('Commit both files in .verification/quality/.');
    process.exitCode = 1;
  }
}
