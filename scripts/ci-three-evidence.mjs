#!/usr/bin/env node
// Read-only reuse of a previously passed native 3D browser owner.
// Reuse is permitted ONLY for a cumulative CI/docs-only delta since the
// accepted Ready result. Any unprovable condition re-runs the real browser.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const ALLOWED_SINCE_ACCEPTANCE = new Set([
  '.github/workflows/browser-regression.yml',
  '.github/workflows/ready-impact.yml',
  'AGENTS.md',
  'docs/CI.md',
  'scripts/ci-test-plan.mjs',
  'scripts/incremental-quality.mjs',
  'scripts/ci-three-evidence.mjs',
  'site/tests/ci-test-plan.test.mjs',
  'site/tests/incremental-quality.test.mjs',
  'site/tests/ci-three-evidence.test.mjs',
]);
const ACCEPTED_OWNERS = new Set([
  'browser / Native v2 Release three',
  'browser / Native v2 Release workstation',
]);

export function ciOnlySinceAccepted(changedPaths) {
  return (
    Array.isArray(changedPaths) &&
    changedPaths.length > 0 &&
    changedPaths.every((path) => ALLOWED_SINCE_ACCEPTANCE.has(path))
  );
}

export function acceptedThreeEvidence({ run, jobs, current, changedPaths }) {
  if (
    !run ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    run.event !== 'pull_request' ||
    run.path !== '.github/workflows/ready-impact.yml' ||
    run.name !== 'Ready risk-targeted acceptance' ||
    run.repository?.full_name !== current.repository ||
    run.head_repository?.full_name !== current.repository ||
    run.head_branch !== current.branch ||
    !SHA.test(run.head_sha || '') ||
    run.head_sha === current.head ||
    !run.pull_requests?.some(
      (pr) =>
        pr.number === current.prNumber && pr.base?.sha === current.base && pr.base?.ref === 'main',
    )
  ) {
    return false;
  }
  if (!ciOnlySinceAccepted(changedPaths)) return false;
  return (
    Array.isArray(jobs) &&
    jobs.some(
      (job) =>
        ACCEPTED_OWNERS.has(job.name) && job.status === 'completed' && job.conclusion === 'success',
    )
  );
}

export function filteredThreeMatrix(original) {
  if (!Array.isArray(original) || !original.includes('three')) {
    throw new Error('Only an explicitly selected three owner may be reused');
  }
  const remaining = original.filter((name) => name !== 'three');
  return { extended: remaining.length > 0, matrix: remaining.length ? remaining : ['none'] };
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim();
}

function gitChangedPaths(base, head) {
  return git('diff', '--name-only', '--no-renames', base, head).split('\n').filter(Boolean);
}

async function api(repo, token, path) {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub read failed: HTTP ${response.status}`);
  return response.json();
}

export async function findAcceptedThree({ current, token, gitOps, readApi }) {
  if (
    !SHA.test(current.base) ||
    !SHA.test(current.head) ||
    !/^\d+$/.test(String(current.prNumber))
  ) {
    return null;
  }
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(current.repository)) return null;
  const runs = await readApi(
    `/actions/runs?event=pull_request&branch=${encodeURIComponent(current.branch)}&per_page=100`,
  );
  if (!Array.isArray(runs.workflow_runs)) return null;
  for (const run of runs.workflow_runs) {
    if (
      run.conclusion !== 'success' ||
      run.head_sha === current.head ||
      !SHA.test(run.head_sha || '') ||
      !run.pull_requests?.some((pr) => pr.number === current.prNumber)
    ) {
      continue;
    }
    // The accepted head must already contain the exact current main base.
    // If main advanced independently, a new real browser run is required.
    if (!gitOps.isAncestor(current.base, run.head_sha)) continue;
    if (!gitOps.isAncestor(run.head_sha, current.head)) continue;
    const changes = gitOps.changedPaths(run.head_sha, current.head);
    // Do not fetch job details when any product/test/dependency byte changed.
    if (!ciOnlySinceAccepted(changes)) continue;
    const response = await readApi(`/actions/runs/${run.id}/jobs?per_page=100`);
    if (acceptedThreeEvidence({ run, jobs: response.jobs, current, changedPaths: changes })) {
      return { runId: run.id, sourceHead: run.head_sha, changedPaths: changes };
    }
  }
  return null;
}

async function main() {
  const env = process.env;
  const current = {
    repository: env.GITHUB_REPOSITORY || '',
    branch: env.PR_HEAD_BRANCH || '',
    base: env.PR_BASE_SHA || '',
    head: env.PR_HEAD_SHA || '',
    prNumber: Number(env.PR_NUMBER || 0),
  };
  let original;
  try {
    original = JSON.parse(env.BROWSER_EXTENDED_MATRIX || '[]');
    if (!original.includes('three')) return;
    // The checkout must be the exact proposed PR merge tree.
    const parents = git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ');
    if (parents.length !== 3 || parents[1] !== current.base || parents[2] !== current.head) {
      throw new Error('Checkout is not the proposed PR merge tree');
    }
    const previous = await findAcceptedThree({
      current,
      token: env.GITHUB_TOKEN,
      gitOps: {
        isAncestor: (before, after) => {
          try {
            execFileSync('git', ['merge-base', '--is-ancestor', before, after]);
            return true;
          } catch {
            return false;
          }
        },
        changedPaths: gitChangedPaths,
      },
      readApi: (path) => api(current.repository, env.GITHUB_TOKEN, path),
    });
    if (!previous) {
      console.log('No matching, complete, trusted 3D owner evidence: run real 3D.');
      return;
    }
    const filtered = filteredThreeMatrix(original);
    const output = `extended=${filtered.extended}\nextended_matrix=${JSON.stringify(filtered.matrix)}\nreused=true\n`;
    if (!env.GITHUB_OUTPUT) throw new Error('Missing GITHUB_OUTPUT');
    appendFileSync(env.GITHUB_OUTPUT, output);
    console.log(
      `Reused exact-product 3D proof: Ready run ${previous.runId}, head ${previous.sourceHead}; ` +
        `${previous.changedPaths.length} CI/docs-only files changed since acceptance.`,
    );
  } catch (error) {
    // A failed API/git/provenance check can only cost time; never bypass a test.
    console.warn(`Cannot reuse 3D acceptance; running browser instead: ${error.message}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
