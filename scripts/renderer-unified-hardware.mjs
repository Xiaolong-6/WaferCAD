// Windows RTX 3060 diagnostic only: pin each PR to its own clean Git worktree.
// Do not treat either A/B comparison as accepted when strict parity fails.
// One command runs V3 then V4 index/caps/combined, preserving all artifacts.
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RENDERER_HARDWARE_BRANCHES,
  buildRendererHardwarePlan,
  classifyRendererHardwareStep,
} from './test-helpers/renderer-unified-hardware-plan.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = process.argv.slice(2);
const planOnly = options.includes('--plan-only');
const modesArg = options.find((arg) => arg.startsWith('--modes='));
const modes = modesArg ? modesArg.slice('--modes='.length).split(',') : undefined;
const plan = buildRendererHardwarePlan(modes);
if (planOnly) {
  console.log(JSON.stringify({ branches: RENDERER_HARDWARE_BRANCHES, plan }, null, 2));
} else {
  if (!options.includes('--hardware-rtx3060') || process.platform !== 'win32') {
    throw new Error('Use --hardware-rtx3060 on Windows, or --plan-only on any platform.');
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

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wafercad': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wasm': 'application/wasm',
};

async function startSite(worktree) {
  const site = resolve(worktree, 'site');
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
      const target = resolve(site, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!target.startsWith(site + sep)) {
        response.writeHead(403).end();
        return;
      }
      const body = await readFile(target);
      response.writeHead(200, {
        'Content-Type': mimeTypes[extname(target).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    close: () => new Promise((done) => server.close(done)),
  };
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
    // Read remote heads once. Never change the user's current branch or files.
    const fetchArgs = ['fetch', '--no-tags', 'origin'];
    for (const [key, name] of Object.entries(RENDERER_HARDWARE_BRANCHES)) {
      fetchArgs.push('refs/heads/' + name + ':refs/remotes/origin/' + name);
      refs[key] = name;
    }
    console.log('Fetching exact V3/V4 Git revisions...');
    git(fetchArgs);
    for (const [key, name] of Object.entries(refs)) {
      refs[key] = git(['rev-parse', 'refs/remotes/origin/' + name]);
    }
    try {
      git(['merge-base', '--is-ancestor', refs.v3, refs.v4]);
    } catch {
      throw new Error('V4 does not include the fetched V3 HEAD; refusing mixed-revision evidence.');
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
    for (const step of plan) {
      console.log('Running ' + step.id + ' on ' + refs[step.branch].slice(0, 10));
      const worktree = worktrees[step.branch];
      const site = await startSite(worktree);
      let execution;
      try {
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
      } finally {
        await site.close();
      }
      const source = join(worktree, step.artifact);
      const target = join(evidence, step.id);
      let report = null;
      try {
        report = JSON.parse(await readFile(join(source, 'report.json'), 'utf8'));
        await cp(source, target, { recursive: true });
      } catch (error) {
        console.log(step.id + ': no complete artifact folder: ' + String(error));
      }
      const status = classifyRendererHardwareStep(
        { ...step, exitCode: execution.exitCode },
        report,
      );
      completed.push({
        id: step.id,
        branch: step.branch,
        sha: refs[step.branch],
        exitCode: execution.exitCode,
        status,
        reportFile: report ? step.id + '/report.json' : null,
        logFile: step.id + '.log',
        strictPixelParity:
          step.id === 'v3' ? report?.strictParity : report?.parity?.strictPixelParity,
        candidateActivation: report?.trials
          ?.filter((trial) => trial.policy === 'B')
          .map((trial) => trial.candidateActivation),
        failureReasons: report?.failureReasons || [],
        error: report?.failure || report?.error || execution.error || null,
      });
      console.log(step.id + ': ' + status);
    }
  } catch (error) {
    fatalError = String(error);
    console.error(fatalError);
  } finally {
    const summary = {
      source: 'Windows RTX 3060, exact remote Git revisions, fresh-context diagnostics',
      capturedAt: new Date().toISOString(),
      refs,
      plannedSteps: plan.map(({ id, branch }) => ({ id, branch })),
      completed,
      fatalError,
      passed:
        !fatalError &&
        completed.length === plan.length &&
        completed.every((step) => step.status === 'passed'),
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
    const psQuote = (value) => "'" + value.replaceAll("'", "''") + "'";
    const archive = await runLogged(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Compress-Archive -LiteralPath ' +
          psQuote(evidence) +
          ' -DestinationPath ' +
          psQuote(zip) +
          ' -Force',
      ],
      root,
      join(dirname(evidence), 'archive-' + id + '.log'),
    );
    console.log('Renderer evidence: ' + evidence);
    if (archive.exitCode === 0) console.log('Shareable evidence ZIP: ' + zip);
    else console.warn('Automatic ZIP failed; evidence folder remains available.');
    if (!summary.passed) process.exitCode = 1;
  }
}
