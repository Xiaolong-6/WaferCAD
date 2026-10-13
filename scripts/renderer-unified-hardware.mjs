// Verified hardware GPU diagnostic: pin each PR to its own clean Git worktree.
// Do not treat either A/B comparison as accepted when strict parity fails.
// One command runs V3 then V4 index/caps/combined, preserving all artifacts.
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preserveRendererHardwareEvidence } from './test-helpers/renderer-hardware-evidence.mjs';
import { startRendererHardwareSite } from './test-helpers/renderer-hardware-site.mjs';
import { writeRendererHardwareZip } from './test-helpers/renderer-hardware-zip.mjs';
import {
  RENDERER_HARDWARE_BRANCHES,
  RENDERER_HARDWARE_V3_PINNED_SHA,
  buildRendererHardwareFetchArgs,
  buildRendererHardwarePlan,
  buildRendererR9HardwareCampaignPlan,
  buildRendererV3DitherDiagnosticPlan,
  buildRendererV3MsaaDiagnosticPlan,
  buildRendererV3PhaseWindowDiagnosticPlan,
  classifyRendererHardwareStep,
} from './test-helpers/renderer-unified-hardware-plan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = process.argv.slice(2);
const planOnly = options.includes('--plan-only');
const r9Campaign = options.includes('--campaign=r9');
const unknownCampaign = options.filter(
  (arg) => arg.startsWith('--campaign=') && arg !== '--campaign=r9',
);
if (unknownCampaign.length || options.filter((arg) => arg === '--campaign=r9').length > 1) {
  throw new Error('Only one --campaign=r9 is supported.');
}
const modesArg = options.find((arg) => arg.startsWith('--modes='));
const ditherDiagnostic = options.includes('--diagnose-v3-dither');
const msaaDiagnostic = options.includes('--diagnose-v3-msaa');
const phaseWindowOptions = options.filter((arg) => arg.startsWith('--diagnose-v3-phase-window'));
if (phaseWindowOptions.length > 1) throw new Error('Select only one phase window');
const phaseWindowDiagnostic = phaseWindowOptions.length === 1;
const phaseWindowValue = phaseWindowDiagnostic
  ? (phaseWindowOptions[0].split('--diagnose-v3-phase-window=')[1] ?? '')
  : null;
const diagnostic = ditherDiagnostic || msaaDiagnostic || phaseWindowDiagnostic;
if (
  (diagnostic && modesArg) ||
  (r9Campaign && (diagnostic || modesArg)) ||
  [ditherDiagnostic, msaaDiagnostic, phaseWindowDiagnostic].filter(Boolean).length > 1
) {
  throw new Error('Select only one V3 diagnostic or V4 --modes');
}
const modes = modesArg ? modesArg.slice('--modes='.length).split(',') : undefined;
const hardwareRtx3060 = options.includes('--hardware-rtx3060');
const hardwareGpu = options.includes('--hardware-gpu') || hardwareRtx3060;
const plan = r9Campaign
  ? buildRendererR9HardwareCampaignPlan()
  : ditherDiagnostic
    ? buildRendererV3DitherDiagnosticPlan()
    : msaaDiagnostic
      ? buildRendererV3MsaaDiagnosticPlan()
      : phaseWindowDiagnostic
        ? buildRendererV3PhaseWindowDiagnosticPlan(phaseWindowValue)
        : buildRendererHardwarePlan(modes);
// Retain the original Windows/RTX 3060 switch for historical, pinned runs.
if (hardwareRtx3060 && !options.includes('--hardware-gpu')) {
  for (const step of plan) {
    step.args = step.args.map((arg) => (arg === '--hardware-gpu' ? '--hardware-rtx3060' : arg));
  }
}
if (planOnly) {
  console.log(JSON.stringify({ branches: RENDERER_HARDWARE_BRANCHES, pinnedV3Sha: RENDERER_HARDWARE_V3_PINNED_SHA, plan }, null, 2));
} else {
  if (!hardwareGpu || (hardwareRtx3060 && process.platform !== 'win32')) {
    throw new Error('Use --hardware-gpu on a real GPU, or --plan-only for dry-run planning.');
  }
  await runHardware();
}

function git(args, cwd = root) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
  }).trim();
}

async function runLogged(command, args, cwd, logPath, env = process.env) {
  const log = createWriteStream(logPath, { flags: 'a' });
  const outcome = await new Promise((resolveRun) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell: process.platform === 'win32' && (command === 'npm' || command === 'npx'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    let spawnError = null;
    child.on('error', (error) => {
      spawnError = String(error);
      log.write(spawnError + '\n');
    });
    child.on('close', (code, signal) => {
      resolveRun({
        exitCode: spawnError ? 127 : (code ?? 127),
        signal: signal || null,
        ...(spawnError ? { error: spawnError } : {}),
      });
    });
  });
  await new Promise((done) => log.end(done));
  return outcome;
}

async function runHardware() {
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const evidence = join(root, 'test-results', 'renderer-unified-hardware', id);
  const temp = await mkdtemp(join(tmpdir(), 'wafercad-renderer-hardware-'));
  const worktrees = { v3: join(temp, 'v3'), v4: join(temp, 'v4') };
  const refs = {};
  const completed = [];
  await mkdir(evidence, { recursive: true });
  let fatalError = null;
  try {
    const actualRoot = resolve(git(['rev-parse', '--show-toplevel']));
    if (actualRoot.toLowerCase() !== root.toLowerCase()) {
      throw new Error('Run this script from the WaferCAD Git repository.');
    }
    // PR #166 is closed and the V3 remote branch was deleted. Fetch only
    // the live V4 branch, then select the immutable final V3 PR commit.
    // Never change the user's current branch, checkout or working files.
    console.log('Fetching V4 and selecting pinned V3 baseline...');
    git(buildRendererHardwareFetchArgs());
    refs.v4 = git(['rev-parse', 'refs/remotes/origin/' + RENDERER_HARDWARE_BRANCHES.v4]);
    refs.v3 = RENDERER_HARDWARE_V3_PINNED_SHA;
    try {
      git(['cat-file', '-e', refs.v3 + '^{commit}']);
    } catch {
      throw new Error(
        'Pinned V3 baseline ' + refs.v3 +
          ' is missing locally. Ensure the V4 clone has full history (not shallow).',
      );
    }
    try {
      git(['merge-base', '--is-ancestor', refs.v3, refs.v4]);
    } catch {
      throw new Error('Fetched V4 does not contain pinned V3 baseline; refusing mixed-revision evidence.');
    }
    for (const key of ['v3', 'v4']) {
      console.log('Preparing ' + key.toUpperCase() + ' ' + refs[key].slice(0, 10));
      git(['worktree', 'add', '--detach', worktrees[key], refs[key]]);
      const install = await runLogged(
        'npm',
        ['ci', '--ignore-scripts', '--no-audit', '--no-fund'],
        worktrees[key],
        join(evidence, 'install-' + key + '.log'),
      );
      if (install.exitCode !== 0) {
        throw new Error(key + ' npm ci failed; see install-' + key + '.log');
      }
    }
    const playwrightInstall = await runLogged(
      'npx',
      ['playwright', 'install', 'chromium'],
      worktrees.v4,
      join(evidence, 'install-chromium.log'),
    );
    if (playwrightInstall.exitCode !== 0) {
      throw new Error('Chromium installation failed; see install-chromium.log');
    }
    // Verify the exact Windows Chromium network path before scheduling ANY
    // GPU captures. The prior run failed every arm at page.goto(app.html).
    const preflight = await runLogged(
      process.execPath,
      [join(worktrees.v4, 'scripts/renderer-hardware-http-smoke.mjs')],
      worktrees.v4,
      join(evidence, 'preflight-chromium.log'),
    );
    if (preflight.exitCode !== 0) {
      throw new Error('Local Windows Chromium HTTP preflight failed; see preflight-chromium.log');
    }
    for (const step of plan) {
      console.log('Running ' + step.id + ' on ' + refs[step.branch].slice(0, 10));
      const worktree = worktrees[step.branch];
      let execution = { exitCode: 127 };
      let stepError = null;
      let site = null;
      try {
        site = await startRendererHardwareSite(worktree, (entry) => {
          console.log(step.id + ' HTTP ' + JSON.stringify(entry));
        });
        await site.verify();
        execution = await runLogged(
          process.execPath,
          [join(worktree, step.script), ...step.args],
          worktree,
          join(evidence, step.id + '.log'),
          {
            ...process.env,
            WAFERCAD_URL: site.url,
            WAFERCAD_THREE_DIR: join(worktree, 'node_modules', 'three'),
          },
        );
      } catch (error) {
        stepError = String(error);
        await writeFile(join(evidence, step.id + '.error.txt'), stepError + '\n');
        console.error(step.id + ': ' + stepError);
      } finally {
        if (site)
          await site.close().catch((error) => {
            console.error(step.id + ' server cleanup: ' + String(error));
          });
      }
      const source = join(worktree, step.artifact);
      const target = join(evidence, step.id);
      const { artifactsCopied, report, warnings } = await preserveRendererHardwareEvidence(
        source,
        target,
      );
      for (const warning of warnings) console.log(step.id + ': ' + warning);
      const status = stepError
        ? 'error'
        : classifyRendererHardwareStep({ ...step, exitCode: execution.exitCode }, report);
      completed.push({
        id: step.id,
        branch: step.branch,
        sha: refs[step.branch],
        exitCode: execution.exitCode,
        status,
        reportFile: report && artifactsCopied ? step.id + '/report.json' : null,
        evidenceFolder: artifactsCopied ? step.id : null,
        logFile: step.id + '.log',
        strictPixelParity:
          step.branch === 'v3' ? report?.strictParity : report?.parity?.strictPixelParity,
        candidateActivation: report?.trials
          ?.filter((trial) => trial.policy === 'B')
          .map((trial) => trial.candidateActivation),
        adapters: [
          ...new Set((report?.trials || []).map((trial) => trial.backend?.adapter).filter(Boolean)),
        ],
        failureReasons: report?.failureReasons || [],
        error: stepError || report?.failure || report?.error || execution.error || null,
      });
      console.log(step.id + ': ' + status);
    }
  } catch (error) {
    fatalError = String(error);
    console.error(fatalError);
  } finally {
    const summary = {
      source: 'Verified hardware WebGL GPU, exact remote Git revisions, fresh-context diagnostics',
      capturedAt: new Date().toISOString(),
      refs,
      revisionSources: {
        v3: 'immutable final commit of closed PR #166',
        v4: 'fetched origin/' + RENDERER_HARDWARE_BRANCHES.v4,
      },
      campaign: r9Campaign ? 'r9' : null,
      plannedSteps: plan.map(({ id, branch }) => ({ id, branch })),
      completed,
      fatalError,
      passed:
        !diagnostic &&
        !fatalError &&
        completed.length === plan.length &&
        completed.every((step) =>
          r9Campaign && step.id === 'v3-msaa-off'
            ? step.status === 'diagnostic-complete'
            : step.status === 'passed',
        ),
      campaignComplete:
        r9Campaign &&
        !fatalError &&
        completed.length === plan.length &&
        completed.every((step) =>
          step.id === 'v3-msaa-off'
            ? step.status === 'diagnostic-complete'
            : ['passed', 'blocked'].includes(step.status),
        ),
      diagnosticComplete:
        diagnostic &&
        !fatalError &&
        completed.length === plan.length &&
        completed.every((step) => step.status === 'diagnostic-complete'),
    };
    await writeFile(join(evidence, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    for (const key of ['v3', 'v4']) {
      try {
        git(['worktree', 'remove', '--force', worktrees[key]]);
      } catch {
        // Evidence was copied to the stable output folder before cleanup.
      }
    }
    await rm(temp, { recursive: true, force: true }).catch(() => {});
    const zip = evidence + '.zip';
    try {
      const result = await writeRendererHardwareZip(evidence, zip);
      console.log('Shareable evidence ZIP: ' + result.output + ' (' + result.files + ' files)');
    } catch (error) {
      console.error('ZIP archive failed: ' + String(error));
      console.log('Renderer evidence directory is preserved: ' + evidence);
      process.exitCode = 1;
    }
    if (!summary.passed && !summary.diagnosticComplete) process.exitCode = 1;
  }
}
