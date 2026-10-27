#!/usr/bin/env node
// Local, fail-closed source-GDS acceptance. Does not invoke GitHub CI.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_SHA256 = '6e9db7d506e17f82fd22250db9a380a420b2a1088bac4a33b8c747930e9d5c02';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TESTS = [
  'site/tests/transmon-gds-chip-extract.test.mjs',
  'site/tests/transmon-gds-q2-roi.test.mjs',
  'site/tests/transmon-junction-dose-audit.test.mjs',
  'site/tests/transmon-q2-nb-replay.test.mjs',
  'site/tests/transmon-shadow-al-preview.test.mjs',
  'site/tests/transmon-q2-integrated-diagnostic.test.mjs',
  'site/tests/direct-fixed-incidence.test.mjs',
  'site/tests/direct-aperture-from-gds.test.mjs',
  'site/tests/direct-nb-recess-shadow-analytic.test.mjs',
  'site/tests/direct-resist-occluded-target.test.mjs',
  'site/tests/transmon-direct-owner-conservation.test.mjs',
  'site/tests/direct-grid-seam.test.mjs',
  'site/tests/junction-three-dose-section.test.mjs',
];

function readArguments(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return null;
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!['--gds', '--output-dir'].includes(flag) || !argv[i + 1])
      throw new Error('Expected --gds AUTHOR_SAMPLE_GDS [--output-dir DIR].');
    if (options[flag]) throw new Error('Duplicate argument: ' + flag);
    options[flag] = argv[i + 1];
  }
  if (!options['--gds']) throw new Error('Author original --gds sample.gds is required.');
  return {
    gds: resolve(options['--gds']),
    outputDir: resolve(options['--output-dir'] || join(ROOT, '.local', 'transmon-q2')),
  };
}

function runNode(args, env) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 300_000,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.error || result.status !== 0) {
    throw new Error(
      `Node execution failed (${result.status ?? 'signal'}): ${args.join(' ')}\n${output.slice(-5000)}${result.error || ''}`,
    );
  }
  return output;
}

async function main() {
  const args = readArguments(process.argv.slice(2));
  if (!args) {
    console.log(
      'Usage: node scripts/transmon-q2-acceptance.mjs --gds ORIGINAL_SAMPLE_GDS [--output-dir DIR]',
    );
    return;
  }
  if (!existsSync(args.gds)) throw new Error('Original author GDS is absent: ' + args.gds);
  const source = await readFile(args.gds);
  const actualHash = createHash('sha256').update(source).digest('hex');
  if (actualHash !== SOURCE_SHA256)
    throw new Error(`Original GDS SHA-256 mismatch. Expected ${SOURCE_SHA256}; got ${actualHash}`);

  await mkdir(args.outputDir, { recursive: true });
  const report = {
    kind: 'WaferCAD Q2 source-GDS local science gate',
    originalGdsSha256: actualHash,
    sourceGitSha: null,
    projectRoundTrips: {},
    sourceGdsTestSuite: null,
    browserSection3dAccepted: false,
    josephsonElectricalModelValidated: false,
  };
  const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
  if (git.status === 0) report.sourceGitSha = git.stdout.trim();
  try {
    for (const mode of ['static', 'native-direct']) {
      const basename = 'transmon-q2-' + mode;
      const params = [
        'scripts/transmon-q2-integrated-diagnostic.mjs',
        '--gds',
        args.gds,
        '--output',
        join(args.outputDir, basename + '.wafercad'),
        '--report',
        join(args.outputDir, basename + '.json'),
      ];
      if (mode === 'native-direct') params.push('--native-direct');
      runNode(params, { WAFERCAD_TRANSMON_GDS: args.gds });
      const result = JSON.parse(await readFile(join(args.outputDir, basename + '.json'), 'utf8'));
      if (!result.strictProjectRoundTrip || result.tunnelJunctionValidated !== false)
        throw new Error(
          `${mode} must validate a lossless project without claiming junction physics.`,
        );
      if (result.sourceSha256 !== SOURCE_SHA256 || result.operations?.length !== 3)
        throw new Error(`${mode} produced an invalid author-source or Al operation report.`);
      if (result.transport && result.transport !== mode)
        throw new Error(`${mode} result has incorrect transport identifier: ${result.transport}.`);
      if (!(result.firstTwoAlOverlapAreaUm2 > 0))
        throw new Error(`${mode} has no surviving first-two-Al overlap.`);
      report.projectRoundTrips[mode] = {
        operations: result.operations.length,
        firstTwoAlOverlapAreaUm2: result.firstTwoAlOverlapAreaUm2,
        modelRegions: result.modelRegions,
        processRevisions: result.processRevisions,
      };
      if (mode === 'native-direct') {
        // A green replay report is insufficient: verify the persisted,
        // expanded material model and Section/3D owners after serialization.
        const { verifyPersistedQ2Project } = await import('./transmon-q2-persisted-proof.mjs');
        report.projectRoundTrips[mode].persistedScience = verifyPersistedQ2Project(
          await readFile(join(args.outputDir, basename + '.wafercad'), 'utf8'),
          result,
        );
      }
    }

    const testOutput = runNode(['--test', ...TESTS], { WAFERCAD_TRANSMON_GDS: args.gds });
    const match = testOutput.match(
      /# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)[\s\S]*?# skipped (\d+)/,
    );
    if (!match)
      throw new Error('Missing TAP test totals; cannot certify Q2 source test execution.');
    const [total, passed, failed, skipped] = match.slice(1).map(Number);
    if (total === 0 || failed !== 0 || skipped !== 0 || passed !== total)
      throw new Error(
        `Q2 source tests incomplete: ${passed}/${total} passed, ${failed} failed, ${skipped} skipped.`,
      );
    report.sourceGdsTestSuite = { total, passed, failed, skipped, files: TESTS };
    report.status = 'science-gates-passed-browser-pending';
  } catch (error) {
    report.status = 'failed';
    report.error = String(error?.message || error);
    await writeFile(
      join(args.outputDir, 'q2-acceptance-report.json'),
      JSON.stringify(report, null, 2) + '\n',
    );
    throw error;
  }
  await writeFile(
    join(args.outputDir, 'q2-acceptance-report.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('Q2 acceptance failed:', error.message);
  process.exitCode = 1;
});
