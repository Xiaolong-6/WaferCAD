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

// Cross-commit Ready reuse covers every previously accepted selected owner,
// not just the standalone 3D matrix. The source/test/dependency allowlist is
// deliberately the same strict inventory as the original 3D proof.
const READY_JOB_NAMES = Object.freeze({
  main_mask: 'main-mask / Main and Mask browser gates',
  klayout: 'klayout / ',
  recipe: 'recipe / ',
  history: 'history-recovery / ',
});

function passedJob(jobs, name) {
  return jobs.some(
    (job) => job.name === name && job.status === 'completed' && job.conclusion === 'success',
  );
}

export function acceptedReadyEvidence({ run, jobs, current, changedPaths, selected }) {
  // A prior run must be successful, complete, and owned by exactly this PR,
  // branch, repository and main parent. Never use a sibling PR or daily pass.
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
    ) ||
    !ciOnlySinceAccepted(changedPaths) ||
    !Array.isArray(jobs) ||
    !selected ||
    !['browser', 'main_mask', 'recipe', 'klayout', 'history'].every(
      (key) => typeof selected[key] === 'boolean',
    ) ||
    !Array.isArray(selected.extendedMatrix)
  )
    return false;

  if (selected.browser) {
    // Every selected real Browser owner must have passed, not merely the
    // top-level Ready verdict. A previous 3D proof can come from Workstation.
    if (!passedJob(jobs, 'browser / Plan browser suites')) return false;
    if (!passedJob(jobs, 'browser / Chromium targeted regression')) return false;
    for (const owner of selected.extendedMatrix) {
      if (
        typeof owner !== 'string' ||
        !/^(three|workstation|interaction|examples|product_layout|renderer)$/.test(owner)
      )
        return false;
      if (
        !passedJob(jobs, `browser / Native v2 Release ${owner}`) &&
        !(owner === 'three' && passedJob(jobs, 'browser / Native v2 Release workstation'))
      )
        return false;
    }
    if (selected.renderer && !passedJob(jobs, 'browser / 625-site array renderer regression')) {
      return false;
    }
    if (selected.process) {
      const processJobs = jobs.filter((job) =>
        job.name.startsWith('browser / Process geometry regression'),
      );
      if (
        processJobs.length === 0 ||
        processJobs.some((job) => job.status !== 'completed' || job.conclusion !== 'success')
      )
        return false;
    }
  }
  // Do not credit a selected release owner merely because the previous Ready
  // run was green. Each required nested job must have a real successful result.
  for (const [gate, prefix] of Object.entries(READY_JOB_NAMES)) {
    if (!selected[gate]) continue;
    const corresponding = jobs.filter((job) =>
      gate === 'main_mask' ? job.name === prefix : job.name.startsWith(prefix),
    );
    if (
      corresponding.length === 0 ||
      corresponding.some((job) => job.status !== 'completed' || job.conclusion !== 'success')
    )
      return false;
  }
  return true;
}

// Workflow files may change planner plumbing without changing the actual
// scientific owner. Compare job bodies at the accepted/current commits: any
// change in the owner execution contract invalidates cross-commit reuse.
const READY_OWNER_WORKFLOW = '.github/workflows/ready-impact.yml';
const BROWSER_OWNER_WORKFLOW = '.github/workflows/browser-regression.yml';
const READY_OWNER_SECTIONS = Object.freeze({
  browser: 'browser',
  main_mask: 'main-mask',
  recipe: 'recipe',
  klayout: 'klayout',
  history: 'history-recovery',
});

export function ownerJobSection(workflow, jobName) {
  if (typeof workflow !== 'string' || !/^[a-z][a-z-]*$/.test(jobName)) return null;
  const beginning = `\n  ${jobName}:\n`;
  const at = workflow.indexOf(beginning);
  if (at < 0) return null;
  const remainder = workflow.slice(at + beginning.length);
  const next = remainder.search(/\n  [a-z][\w-]*:\n/);
  return remainder.slice(0, next < 0 ? undefined : next);
}

export function unchangedReadyOwnerCommands({ accepted, current, selected }) {
  const beforeBrowser = ownerJobSection(accepted.browser, 'browser');
  const afterBrowser = ownerJobSection(current.browser, 'browser');
  if (selected.browser) {
    if (beforeBrowser === null || beforeBrowser !== afterBrowser) return false;
    for (const name of [
      'release-ui-owners',
      'renderer-array',
      'process-geometry',
      'renderer-array-edge-on',
    ]) {
      // The optional 625-site owner may be named differently across releases;
      // an exact selected test is always checked through its source identity.
      const before = ownerJobSection(accepted.browser, name);
      const after = ownerJobSection(current.browser, name);
      if (before !== after) return false;
    }
  }
  for (const [key, name] of Object.entries(READY_OWNER_SECTIONS)) {
    if (!selected[key]) continue;
    const before = ownerJobSection(accepted.ready, name);
    const after = ownerJobSection(current.ready, name);
    if (before === null || after === null) return false;
    // Only an added read-only Actions permission (for the evidence probe) is
    // ignored. An altered owner command, environment or runtime still fails.
    const harmlessPermission = (value) =>
      name === 'browser' ? value.replace(/^\s+actions: read\n/gm, '') : value;
    if (harmlessPermission(before) !== harmlessPermission(after)) return false;
  }
  return true;
}

function gitWorkflowAt(commit, path) {
  return git('show', `${commit}:${path}`);
}

function gitReadyOwnerCommandsSame(before, after, selected) {
  return unchangedReadyOwnerCommands({
    accepted: {
      ready: gitWorkflowAt(before, READY_OWNER_WORKFLOW),
      browser: gitWorkflowAt(before, BROWSER_OWNER_WORKFLOW),
    },
    current: {
      ready: gitWorkflowAt(after, READY_OWNER_WORKFLOW),
      browser: gitWorkflowAt(after, BROWSER_OWNER_WORKFLOW),
    },
    selected,
  });
}

export async function findAcceptedReady({ current, token, gitOps, readApi, selected }) {
  if (
    !SHA.test(current.base) ||
    !SHA.test(current.head) ||
    !/^\d+$/.test(String(current.prNumber)) ||
    !token ||
    !/^[\w.-]+\/[\w.-]+$/.test(current.repository)
  )
    return null;
  const runs = await readApi(
    `/actions/runs?event=pull_request&branch=${encodeURIComponent(current.branch)}&per_page=100`,
  );
  if (!Array.isArray(runs.workflow_runs)) return null;
  for (const run of runs.workflow_runs) {
    if (
      run.status !== 'completed' ||
      run.conclusion !== 'success' ||
      run.head_sha === current.head ||
      !SHA.test(run.head_sha || '') ||
      !run.pull_requests?.some((pr) => pr.number === current.prNumber)
    )
      continue;
    if (!gitOps.isAncestor(current.base, run.head_sha)) continue;
    if (!gitOps.isAncestor(run.head_sha, current.head)) continue;
    const changedPaths = gitOps.changedPaths(run.head_sha, current.head);
    if (!ciOnlySinceAccepted(changedPaths)) continue;
    if (
      typeof gitOps.sameOwnerCommands !== 'function' ||
      !gitOps.sameOwnerCommands(run.head_sha, current.head, selected)
    )
      continue;
    const result = await readApi(`/actions/runs/${run.id}/jobs?per_page=100`);
    if (acceptedReadyEvidence({ run, jobs: result.jobs, current, changedPaths, selected })) {
      return { runId: run.id, sourceHead: run.head_sha, changedPaths };
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
  const readyMode = process.argv.includes('--ready');
  let original;
  try {
    if (readyMode) {
      const selected = {
        ...Object.fromEntries(
          ['browser', 'main_mask', 'recipe', 'klayout', 'history'].map((key) => [
            key,
            env[`READY_${key.toUpperCase()}_SELECTED`] === 'true',
          ]),
        ),
        extendedMatrix: JSON.parse(env.READY_EXTENDED_MATRIX || '[]'),
        renderer: env.READY_RENDERER_SELECTED === 'true',
        process: env.READY_PROCESS_SELECTED === 'true',
      };
      const parents = git('rev-list', '--parents', '-n', '1', 'HEAD').split(' ');
      if (parents.length !== 3 || parents[1] !== current.base || parents[2] !== current.head) {
        throw new Error('Checkout is not the proposed PR merge tree');
      }
      const previous = await findAcceptedReady({
        current,
        token: env.GITHUB_TOKEN,
        selected,
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
          sameOwnerCommands: gitReadyOwnerCommandsSame,
        },
        readApi: (path) => api(current.repository, env.GITHUB_TOKEN, path),
      });
      if (!previous) {
        console.log('No complete source-identical Ready owner evidence: execute selected gates.');
        return;
      }
      if (!env.GITHUB_OUTPUT) throw new Error('Missing GITHUB_OUTPUT');
      const outputs = Object.entries(selected)
        .filter(
          ([key, value]) =>
            ['browser', 'main_mask', 'recipe', 'klayout', 'history'].includes(key) && value,
        )
        .map(([key]) => `${key}=false`);
      outputs.push('reused=true');
      appendFileSync(env.GITHUB_OUTPUT, `${outputs.join('\n')}\n`);
      console.log(
        `Reused all selected Ready owner proofs from successful run ${previous.runId}, ` +
          `head ${previous.sourceHead}; ${previous.changedPaths.length} CI/docs-only files changed.`,
      );
      return;
    }
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
