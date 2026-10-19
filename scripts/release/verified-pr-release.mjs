import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildCiTestPlan } from '../ci-test-plan.mjs';

// Release evidence is evaluated exclusively on trusted main-push runners.
// Missing data must cause a complete release gate, never a fast publication.
// PR checks are selected by scripts/ci-test-plan.mjs. A fixed list of all
// browser owners makes targeted PRs ineligible for proven publication.
// Integrity-sensitive or unclassified changes always use the full Main gate.
const INTEGRITY_SENSITIVE_PATH =
  /^(?:site\/(?:project-|workspace-|history-|state-equality|model(?:\.|-)|process-|polygon-boolean|controllers\/(?:project-|history-|workspace-|process-)|ui-v2\/(?:workstation-(?:entry|runtime|workflow)|project-mask-panels))|scripts\/(?:release\/|build-pages-artifact|build-bundled-integrity|process-|project-io-|history-|persistence-)|\.github\/)/;
// New source files do not silently acquire permission to skip Main science.
const AUDITED_PRODUCTION_PATH =
  /^(?:docs\/|README\.md$|site\/tests\/|site\/ui-v2\/|site\/three-[a-z0-9-]+\.js$|site\/gpu-rough-surface\.js$|site\/surface-rendering\.js$|site\/examples\/thumbnails\/.+\.(?:svg|webp)$)/;
const PR_BROWSER_PATH =
  /^(?:site\/(?!tests\/)|examples\/|scripts\/(?:v2\/|array-|renderer-|pr250-|process-|project-|ui-smoke|workstation-|history-|persistence-|resilience-|interaction-|example-|product-|rough-))/;
const STAGE_C_PATH = /^(?:site\/(?!tests\/)|scripts\/v2\/)/;
const EXTENDED_OWNERS = Object.freeze([
  'workstation',
  'interaction',
  'examples',
  'product_layout',
  'renderer',
]);

export function targetedProductionGates(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.some((p) => typeof p !== 'string'))
    return null;
  if (
    paths.some(
      (path) =>
        !AUDITED_PRODUCTION_PATH.test(path) ||
        INTEGRITY_SENSITIVE_PATH.test(path) ||
        path === 'site/ui-v2/three-view.js',
    )
  )
    return null;

  const plan = buildCiTestPlan(paths);
  if (plan.full || plan.release.klayout || plan.release.recipe) return null;
  const required = ['quality'];
  if (paths.some((path) => PR_BROWSER_PATH.test(path))) {
    required.push('Plan browser suites', 'Chromium targeted regression');
    for (const owner of EXTENDED_OWNERS) {
      if (plan.suites[owner]) required.push('Native v2 Release ' + owner);
    }
    if (plan.suites.renderer) {
      required.push(
        '625-site array renderer regression',
        '625-site edge-on exact-wall restoration',
      );
    }
    if (plan.suites.process) {
      for (const domain of ['process', 'io', 'array']) {
        required.push('Process geometry regression (' + domain + ')');
      }
    }
  } else if (Object.entries(plan.suites).some(([name, active]) => active && name !== 'smoke')) {
    // Every selected owner needs a real PR check. Missing browser routing
    // is not evidence that an expensive suite can safely be skipped.
    return null;
  }
  if (paths.some((path) => STAGE_C_PATH.test(path))) {
    required.push('Stage C shared runtime and M4 real projects');
  }
  if (plan.release.main_mask) required.push('Main and Mask browser gates');
  return [...new Set(required)];
}

export const INFRA_FILES = Object.freeze([
  '.github/workflows/pages.yml',
  '.github/workflows/release-evidence-contract.yml',
  'scripts/release/verified-pr-release.mjs',
  'site/tests/release-evidence.test.mjs',
  'site/tests/ci-development-gates.test.mjs',
  'site/tests/ci-workflow-architecture.test.mjs',
  'docs/operations/RELEASE_EVIDENCE.md',
  'docs/operations/README.md',
]);

export function classifyRelease(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.some((p) => typeof p !== 'string'))
    return 'full';
  if (paths.every((p) => INFRA_FILES.includes(p))) return 'infra';
  if (paths.some((p) => p.startsWith('.github/') || p.startsWith('scripts/release/')))
    return 'full';
  return 'production';
}

export function evaluateRelease({
  event,
  sha,
  parents,
  paths,
  pull,
  sameTree,
  baseIsAncestor,
  checks,
  fullQuality,
}) {
  const fallback = (reason) => ({ fast: false, mode: 'full', reason });
  if (
    event !== 'push' ||
    !/^[0-9a-f]{40}$/.test(sha || '') ||
    !Array.isArray(parents) ||
    parents.length !== 2
  )
    return fallback('not an ordinary main merge');
  if (
    !pull ||
    pull.merged !== true ||
    pull.state !== 'closed' ||
    pull.draft ||
    pull.merge_commit_sha !== sha ||
    pull.head?.sha !== parents[1] ||
    pull.base?.ref !== 'main' ||
    !pull.number
  )
    return fallback('missing exact PR provenance');
  if (!sameTree || !baseIsAncestor)
    return fallback('PR head did not contain final main base or matching tree');
  const mode = classifyRelease(paths);
  if (mode === 'full') return fallback('unsafe or mixed release configuration scope');
  if (
    !Array.isArray(checks) ||
    checks.length < (mode === 'infra' ? 2 : 1) ||
    checks.some(
      (c) =>
        !c ||
        c.app?.slug !== 'github-actions' ||
        c.status !== 'completed' ||
        !['success', 'skipped'].includes(c.conclusion),
    )
  ) {
    return fallback('PR checks missing, incomplete or failed');
  }
  const required =
    mode === 'infra' ? ['quality', 'Release evidence contract'] : targetedProductionGates(paths);
  if (!required) return fallback('integrity-sensitive or unclassified production scope');
  for (const name of required) {
    const found = checks.filter((c) => c.name === name);
    if (found.length !== 1 || found[0].conclusion !== 'success') {
      return fallback('required check missing, duplicated or not successful: ' + name);
    }
  }
  if (!fullQuality) return fallback('draft-only Quality cannot authorize production');
  return {
    fast: true,
    mode,
    reason: 'exact tree and complete verified PR checks',
  };
}

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  }).trim();
}

async function api(path) {
  const response = await fetch(
    'https://api.github.com/repos/' + process.env.GITHUB_REPOSITORY + '/' + path,
    {
      headers: {
        Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: globalThis.AbortSignal.timeout(15000),
    },
  );
  if (!response.ok) throw Error('GitHub API ' + response.status + ' for ' + path);
  return response.json();
}

function runId(check) {
  const parts = String(check?.details_url || '').match(/\/actions\/runs\/(\d+)\/job\/(\d+)/);
  return parts ? Number(parts[1]) : 0;
}

// GitHub retains Draft and Ready jobs for the same PR head SHA. Only the
// newest authenticated attempt for each check name is authoritative. Never
// substitute an earlier success for a newer incomplete or failed attempt.
export function latestCheckRuns(checks) {
  if (!Array.isArray(checks)) return null;
  const latest = new Map();
  for (const check of checks) {
    // Queued check runs have a creation time but may not have started yet.
    const started = Date.parse(check?.created_at || check?.started_at || '');
    if (!check?.name || !Number.isSafeInteger(check.id) || !Number.isFinite(started)) return null;
    const previous = latest.get(check.name);
    if (
      !previous ||
      started > previous.started ||
      (started === previous.started && check.id > previous.check.id)
    ) {
      latest.set(check.name, { check, started });
    } else if (started === previous.started && check.id === previous.check.id) {
      return null;
    }
  }
  return [...latest.values()].map((entry) => entry.check);
}

async function findRelease() {
  const event = process.env.GITHUB_EVENT_NAME;
  const sha = process.env.GITHUB_SHA;
  if (event !== 'push') return { fast: false, mode: 'full', reason: 'not a main push' };
  const latestMain = await api('git/ref/heads/main');
  if (latestMain.object?.sha !== sha)
    return { fast: false, mode: 'superseded', reason: 'newer main superseded this revision' };
  const parents = git('rev-list', '--parents', '-n', '1', sha).split(/\s+/).slice(1);
  if (parents.length !== 2) return { fast: false, mode: 'full', reason: 'unverified parent count' };
  const paths = git('diff', '--name-only', parents[0], sha).split('\n').filter(Boolean);
  const mode = classifyRelease(paths);
  if (mode === 'full') return { fast: false, mode: 'full', reason: 'unsafe CI routing changes' };
  const candidates = await api('commits/' + sha + '/pulls');
  const linked = candidates.filter((item) => item.merge_commit_sha === sha);
  if (linked.length !== 1) return { fast: false, mode: 'full', reason: 'missing or ambiguous PR' };
  const pull = await api('pulls/' + linked[0].number);
  let sameTree = false;
  try {
    const candidateTree = git('merge-tree', '--write-tree', parents[0], parents[1]).split('\n')[0];
    sameTree =
      /^[0-9a-f]{40}$/.test(candidateTree) && candidateTree === git('rev-parse', sha + '^{tree}');
  } catch {
    sameTree = false;
  }
  if (!sameTree) return { fast: false, mode: 'full', reason: 'merge tree mismatch' };
  // A PR checked on an older base cannot authorize release of a newer main.
  let baseIsAncestor = false;
  try {
    git('merge-base', '--is-ancestor', parents[0], parents[1]);
    baseIsAncestor = true;
  } catch {
    baseIsAncestor = false;
  }
  if (!baseIsAncestor) {
    return {
      fast: false,
      mode: 'full',
      reason: 'PR head lacks current main base',
    };
  }
  const required =
    mode === 'infra' ? ['quality', 'Release evidence contract'] : targetedProductionGates(paths);
  if (!required)
    return { fast: false, mode: 'full', reason: 'integrity-sensitive production scope' };

  // The owner may approve a merge while its PR jobs are still running.
  // Wait for already-running proof instead of immediately repeating every
  // expensive browser/science suite on main. Polling is bounded and never
  // permits a failed, cancelled, skipped-required, or missing job to pass.
  const waitUntil = Date.now() + 55 * 60 * 1000;
  let checks = [],
    complete = false;
  while (true) {
    const latest = await api('git/ref/heads/main');
    if (latest.object?.sha !== sha)
      return { fast: false, mode: 'superseded', reason: 'newer main superseded this revision' };
    const listing = await api('commits/' + parents[1] + '/check-runs?per_page=100');
    if (listing.total_count > 100 || !Array.isArray(listing.check_runs))
      return { fast: false, mode: 'full', reason: 'PR check listing unavailable or truncated' };
    checks = latestCheckRuns(listing.check_runs);
    if (!checks)
      return { fast: false, mode: 'full', reason: 'malformed or ambiguous PR check attempts' };
    const pending = checks.some((c) => c.status !== 'completed');
    const missing = required.some((name) => checks.filter((c) => c.name === name).length !== 1);
    complete = !pending && !missing;
    if (complete || Date.now() >= waitUntil) break;
    // Absent jobs may still be queued at the start of a PR's workflows.
    // If no jobs are running and the mandatory list is incomplete, the
    // routing is not proven; avoid sleeping for the full timeout.
    if (!pending && Date.now() < waitUntil - 53 * 60 * 1000) {
      await new Promise((resolve) => setTimeout(resolve, 30000));
      continue;
    }
    if (!pending) break;
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
  if (!complete)
    return { fast: false, mode: 'full', reason: 'required PR evidence did not complete in time' };
  const quality = checks.filter((c) => c.name === 'quality' && c.conclusion === 'success');
  let fullQuality = false;
  if (quality.length === 1) {
    const jobId = String(quality[0].details_url || '')
      .split('/job/')[1]
      ?.split('/')[0];
    if (jobId) {
      const job = await api('actions/jobs/' + jobId);
      fullQuality =
        job.head_sha === parents[1] &&
        job.conclusion === 'success' &&
        job.steps?.some(
          (s) =>
            s.name === 'Final lint, formatting, generated documentation and Node tests' &&
            s.conclusion === 'success',
        );
    }
  }
  const verdict = evaluateRelease({
    event,
    sha,
    parents,
    paths,
    pull,
    sameTree,
    baseIsAncestor,
    checks,
    fullQuality,
  });
  if (!verdict.fast) return verdict;
  const seen = new Set();
  for (const name of required) {
    const id = runId(checks.find((c) => c.name === name));
    if (!id)
      return {
        fast: false,
        mode: 'full',
        reason: 'missing workflow run ID: ' + name,
      };
    if (seen.has(id)) continue;
    const run = await api('actions/runs/' + id);
    // GitHub clears workflow_run.pull_requests after merge; persistent run
    // fields still attest the event, branch, repository and reviewed head.
    if (
      run.head_sha !== parents[1] ||
      run.event !== 'pull_request' ||
      run.conclusion !== 'success' ||
      run.head_branch !== pull.head.ref ||
      run.head_repository?.full_name !== process.env.GITHUB_REPOSITORY
    ) {
      return {
        fast: false,
        mode: 'full',
        reason: 'workflow provenance mismatch: ' + name,
      };
    }
    seen.add(id);
  }
  return verdict;
}

async function main() {
  let result;
  try {
    if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPOSITORY || !process.env.GITHUB_SHA) {
      throw Error('missing authenticated release context');
    }
    result = await findRelease();
  } catch (error) {
    result = {
      fast: false,
      mode: 'full',
      reason: 'fail closed: ' + error.message,
    };
  }
  process.stdout.write(JSON.stringify(result) + '\n');
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      'fast=' + result.fast + '\nmode=' + result.mode + '\n',
    );
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
