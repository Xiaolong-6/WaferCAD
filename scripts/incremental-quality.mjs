#!/usr/bin/env node
// Incremental CI Quality: verified full main baseline + real checks on the exact PR diff.
// Unknown/high-risk ownership always rejects this shortcut in favor of full proof.
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const SAFE = [
  /^docs\/[\w./-]+\.md$/,
  /^README\.md$/,
  /^AGENTS\.md$/,
  /^\.github\/workflows\/quality\.yml$/,
  /^scripts\/incremental-quality\.mjs$/,
  /^scripts\/ci-test-plan\.mjs$/,
  /^scripts\/ci-three-evidence\.mjs$/,
  /^scripts\/v2\/check-three-view\.mjs$/,
  /^\.github\/workflows\/daily-full\.yml$/,
  /^\.github\/workflows\/pages\.yml$/,
  /^\.github\/workflows\/browser-regression\.yml$/,
  /^\.github\/workflows\/ready-impact\.yml$/,
  /^site\/ui-v2\/(?:section-legend|section-view)\.js$/,
  /^site\/tests\/(?:section-legend-random|ci-trigger-policy|ci-development-gates|ci-test-plan|incremental-quality|ci-three-evidence)\.test\.mjs$/,
];
const SOURCE_TYPES = /\.(?:js|mjs)$/;
const FORMAT_TYPES = /\.(?:js|mjs|md)$/;

// One-off fail-closed exception for the post-merge Pages startup blocker.
// This NEVER permits arbitrary Pages workflow edits through incremental Quality.
export function isPagesBrowserPermissionHotfix(before, after) {
  if (typeof before !== 'string' || typeof after !== 'string') return false;
  const start = before.indexOf('  release-browser:\n');
  const end = before.indexOf('\n  release-ui-v2:', start);
  if (start < 0 || end < 0) return false;
  const caller = before.slice(start, end);
  const oldPermissions = '    permissions:\n      contents: read\n';
  if (!caller.includes(oldPermissions) || caller.includes('      actions: read')) return false;
  const patched = caller.replace(oldPermissions, oldPermissions + '      actions: read\n');
  return after === before.slice(0, start) + patched + before.slice(end);
}

export function incrementalPlan(changes) {
  if (!Array.isArray(changes) || !changes.length) throw new Error('Empty or missing diff');
  const paths = new Set();
  for (const { status, path } of changes) {
    if (
      !/^(?:A|M)$/.test(status) ||
      !/^[\w./-]+$/.test(path) ||
      path.includes('..') ||
      !SAFE.some((rule) => rule.test(path))
    ) {
      throw new Error(`Incremental Quality does not own ${status}: ${path}`);
    }
    if (paths.has(path)) throw new Error(`Duplicate changed path: ${path}`);
    paths.add(path);
  }
  const files = [...paths].sort();
  const workflow = files.some((path) => path.startsWith('.github/workflows/'));
  const infrastructure = files.some(
    (path) =>
      path === 'scripts/incremental-quality.mjs' ||
      path === 'scripts/ci-test-plan.mjs' ||
      path === 'scripts/ci-three-evidence.mjs' ||
      path === '.github/workflows/quality.yml',
  );
  const ui = files.some((path) => path.startsWith('site/ui-v2/'));
  const threeAcceptance = files.includes('scripts/v2/check-three-view.mjs');
  const docs = files.some(
    (path) => path.startsWith('docs/') || path === 'README.md' || path === 'AGENTS.md',
  );
  const tests = new Set(files.filter((path) => path.startsWith('site/tests/')));
  if (workflow) {
    for (const test of [
      'site/tests/ci-trigger-policy.test.mjs',
      'site/tests/ci-development-gates.test.mjs',
      'site/tests/ci-workflow-architecture.test.mjs',
    ])
      tests.add(test);
  }
  if (infrastructure) {
    for (const test of [
      'site/tests/incremental-quality.test.mjs',
      'site/tests/ci-test-plan.test.mjs',
      'site/tests/ci-three-evidence.test.mjs',
      'site/tests/ci-development-gates.test.mjs',
      'site/tests/ci-workflow-architecture.test.mjs',
      'site/tests/local-verification.test.mjs',
    ])
      tests.add(test);
  }
  if (ui) {
    tests.add('site/tests/section-legend-random.test.mjs');
    tests.add('site/tests/source-sunset-view-ux-owners.test.mjs');
  }
  if (threeAcceptance) {
    tests.add('site/tests/source-sunset-view-ux-owners.test.mjs');
    tests.add('site/tests/ci-test-plan.test.mjs');
  }
  if (docs) tests.add('site/tests/documentation-suite.test.mjs');
  return {
    files,
    lint: files.filter((path) => SOURCE_TYPES.test(path)),
    format: files.filter((path) => FORMAT_TYPES.test(path)),
    workflow,
    infrastructure,
    docs,
    tests: [...tests].sort(),
  };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
}

export function parseNameStatus(raw) {
  const tokens = raw.split('\0').filter(Boolean);
  if (tokens.length % 2 !== 0) throw new Error('Malformed git name-status output');
  const changes = [];
  for (let i = 0; i < tokens.length; i += 2)
    changes.push({ status: tokens[i], path: tokens[i + 1] });
  return changes;
}

function printCommand(command, args) {
  console.log(`Incremental Quality: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.error || result.status !== 0 || result.signal) {
    throw new Error(
      `${command} failed: ${result.error?.message || result.signal || result.status}`,
    );
  }
}

export function runIncremental(plan, execute = printCommand) {
  // No test may be silently omitted for an eligible changed source.
  if (plan.lint.length) execute('node', ['node_modules/eslint/bin/eslint.js', ...plan.lint]);
  if (plan.format.length)
    execute('node', ['node_modules/prettier/bin/prettier.cjs', '--check', ...plan.format]);
  if (plan.workflow) execute('node', ['scripts/ci-trigger-policy.mjs']);
  if (plan.docs) execute('npm', ['run', 'docs:check']);
  if (plan.tests.length) execute('node', ['--test', ...plan.tests]);
}

function main() {
  const [mode, base, head] = process.argv.slice(2);
  if (
    !['plan', 'run'].includes(mode) ||
    !/^[0-9a-f]{40}$/.test(base || '') ||
    !/^[0-9a-f]{40}$/.test(head || '')
  ) {
    throw new Error('Usage: node scripts/incremental-quality.mjs plan|run <base SHA> <head SHA>');
  }
  // Inspect the exact PR merge tree, not an arbitrary branch tip or stale main.
  const parents = git(['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ');
  if (parents.length !== 3 || parents[1] !== base || parents[2] !== head) {
    throw new Error('Checkout is not the exact base/head PR merge tree');
  }
  const changes = parseNameStatus(
    execFileSync('git', ['diff', '--name-status', '-z', base, head], { encoding: 'utf8' }),
  );
  if (changes.some(({ path }) => path === '.github/workflows/pages.yml')) {
    const pagePath = '.github/workflows/pages.yml';
    const before = git(['show', `${base}:${pagePath}`]);
    const after = git(['show', `${head}:${pagePath}`]);
    if (!isPagesBrowserPermissionHotfix(before, after)) {
      throw new Error('Only the exact Pages reusable Browser permissions fix is incremental');
    }
  }
  const plan = incrementalPlan(changes);
  console.log(
    JSON.stringify({ baseline: base, candidate: head, merge: parents[0], ...plan }, null, 2),
  );
  if (mode === 'run') runIncremental(plan);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`Incremental Quality rejected: ${error.message}`);
    process.exitCode = 1;
  }
}
