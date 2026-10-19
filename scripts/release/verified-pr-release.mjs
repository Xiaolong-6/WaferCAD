import { execFileSync } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Release evidence is evaluated exclusively on trusted main-push runners.
// Missing data must cause a complete release gate, never a fast publication.
export const PRODUCTION_GATES = Object.freeze([
  'quality',
  'Plan browser suites',
  'Chromium targeted regression',
  'Native v2 Release workstation',
  'Native v2 Release renderer',
  'Native v2 Release interaction',
  '625-site array renderer regression',
  '625-site edge-on exact-wall restoration',
  'Process geometry regression (process)',
  'Process geometry regression (io)',
  'Process geometry regression (array)',
  'Stage C shared runtime and M4 real projects',
  'Main and Mask browser gates',
]);
export const INFRA_FILES = Object.freeze([
  '.github/workflows/pages.yml',
  '.github/workflows/release-evidence-contract.yml',
  'scripts/release/verified-pr-release.mjs',
  'site/tests/release-evidence.test.mjs',
  'docs/operations/RELEASE_EVIDENCE.md',
]);

export function classifyRelease(paths) {
  if (!Array.isArray(paths) || !paths.length || paths.some((p) => typeof p !== 'string')) return 'full';
  if (paths.every((p) => INFRA_FILES.includes(p))) return 'infra';
  if (paths.some((p) => p.startsWith('.github/') || p.startsWith('scripts/release/'))) return 'full';
  return 'production';
}

export function evaluateRelease({ event, sha, parents, paths, pull, sameTree, baseIsAncestor, checks, fullQuality }) {
  const fallback = (reason) => ({ fast: false, mode: 'full', reason });
  if (event !== 'push' || !/^[0-9a-f]{40}$/.test(sha || '') ||
      !Array.isArray(parents) || parents.length !== 2) return fallback('not an ordinary main merge');
  if (!pull || pull.merged !== true || pull.state !== 'closed' || pull.draft ||
      pull.merge_commit_sha !== sha || pull.head?.sha !== parents[1] ||
      pull.base?.ref !== 'main' || !pull.number) return fallback('missing exact PR provenance');
  if (!sameTree || !baseIsAncestor) return fallback('PR head did not contain final main base or matching tree');
  const mode = classifyRelease(paths);
  if (mode === 'full') return fallback('unsafe or mixed release configuration scope');
  if (!Array.isArray(checks) || checks.length < 2 ||
      checks.some((c) => !c || c.app?.slug !== 'github-actions' ||
        c.status !== 'completed' || !['success', 'skipped'].includes(c.conclusion))) {
    return fallback('PR checks missing, incomplete or failed');
  }
  const required = mode === 'infra' ? ['quality', 'Release evidence contract'] : PRODUCTION_GATES;
  for (const name of required) {
    const found = checks.filter((c) => c.name === name);
    if (found.length !== 1 || found[0].conclusion !== 'success') {
      return fallback('required check missing, duplicated or not successful: ' + name);
    }
  }
  if (!fullQuality) return fallback('draft-only Quality cannot authorize production');
  return { fast: true, mode, reason: 'exact tree and complete verified PR checks' };
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim();
}

async function api(path) {
  const response = await fetch('https://api.github.com/repos/' + process.env.GITHUB_REPOSITORY + '/' + path, {
    headers: {
      Authorization: 'Bearer ' + process.env.GITHUB_TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error('GitHub API ' + response.status + ' for ' + path);
  return response.json();
}

function runId(check) {
  const parts = String(check?.details_url || '').match(/\/actions\/runs\/(\d+)\/job\/\d+/);
  return parts ? Number(parts[1]) : 0;
}

async function findRelease() {
  const event = process.env.GITHUB_EVENT_NAME;
  const sha = process.env.GITHUB_SHA;
  if (event !== 'push') return { fast: false, mode: 'full', reason: 'not a main push' };
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
    sameTree = /^[0-9a-f]{40}$/.test(candidateTree) &&
      candidateTree === git('rev-parse', sha + '^{tree}');
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
    return { fast: false, mode: 'full', reason: 'PR head lacks current main base' };
  }
  const listing = await api('commits/' + parents[1] + '/check-runs?per_page=100');
  if (listing.total_count > 100 || !Array.isArray(listing.check_runs)) {
    return { fast: false, mode: 'full', reason: 'PR check listing unavailable or truncated' };
  }
  const checks = listing.check_runs;
  const quality = checks.filter((c) => c.name === 'quality' && c.conclusion === 'success');
  let fullQuality = false;
  if (quality.length === 1) {
    const jobId = String(quality[0].details_url || '').match(/\/job\/(\d+)/)?.[1];
    if (jobId) {
      const job = await api('actions/jobs/' + jobId);
      fullQuality = job.head_sha === parents[1] && job.conclusion === 'success' &&
        job.steps?.some((s) => s.name ===
          'Final lint, formatting, generated documentation and Node tests' &&
          s.conclusion === 'success');
    }
  }
  const verdict = evaluateRelease({
    event, sha, parents, paths, pull, sameTree, baseIsAncestor, checks, fullQuality,
  });
  if (!verdict.fast) return verdict;
  const required = verdict.mode === 'infra' ? ['quality', 'Release evidence contract'] : PRODUCTION_GATES;
  const seen = new Set();
  for (const name of required) {
    const id = runId(checks.find((c) => c.name === name));
    if (!id) return { fast: false, mode: 'full', reason: 'missing workflow run ID: ' + name };
    if (seen.has(id)) continue;
    const run = await api('actions/runs/' + id);
    // GitHub clears workflow_run.pull_requests after merge; persistent run
    // fields still attest the event, branch, repository and reviewed head.
    if (run.head_sha !== parents[1] || run.event !== 'pull_request' ||
        run.conclusion !== 'success' || run.head_branch !== pull.head.ref ||
        run.head_repository?.full_name !== process.env.GITHUB_REPOSITORY) {
      return { fast: false, mode: 'full', reason: 'workflow provenance mismatch: ' + name };
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
    result = { fast: false, mode: 'full', reason: 'fail closed: ' + error.message };
  }
  process.stdout.write(JSON.stringify(result) + '\n');
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT,
      'fast=' + result.fast + '\nmode=' + result.mode + '\n');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
