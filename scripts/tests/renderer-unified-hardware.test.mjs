import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preserveRendererHardwareEvidence } from '../test-helpers/renderer-hardware-evidence.mjs';
import {
  RENDERER_HARDWARE_BRANCHES,
  buildRendererHardwarePlan,
  classifyRendererHardwareStep,
} from '../test-helpers/renderer-unified-hardware-plan.mjs';

test('one hardware plan retains exact V3 and three independent V4 candidate artifacts', () => {
  assert.match(RENDERER_HARDWARE_BRANCHES.v3, /transparent-renderer-v3/);
  const plan = buildRendererHardwarePlan();
  assert.deepEqual(
    plan.map(({ id }) => id),
    ['v3', 'v4-index', 'v4-caps', 'v4-combined'],
  );
  assert.deepEqual(plan[0].args, ['--hardware-rtx3060', '--report-only']);
  assert.deepEqual(plan[1].args, ['--hardware-rtx3060', '--isolate-index']);
  assert.deepEqual(plan[2].args, ['--hardware-rtx3060', '--isolate-caps']);
  assert.deepEqual(plan[3].args, ['--hardware-rtx3060']);
  assert.equal(new Set(plan.map(({ artifact }) => artifact)).size, plan.length);
  assert.deepEqual(
    buildRendererHardwarePlan(['caps']).map(({ id }) => id),
    ['v3', 'v4-caps'],
  );
  assert.throws(() => buildRendererHardwarePlan([]), /Select unique/);
  assert.throws(() => buildRendererHardwarePlan(['index', 'index']), /Select unique/);
  assert.throws(() => buildRendererHardwarePlan(['unknown']), /Select unique/);
});

const step = (id, exitCode = 0) => ({ id, exitCode });
const v4Report = (mode, active = true) => ({
  stage: 'complete',
  candidateMode: mode,
  trials: [
    { policy: 'A' },
    { policy: 'B', candidateActivation: { candidateExercised: active } },
    { policy: 'B', candidateActivation: { candidateExercised: active } },
    { policy: 'A' },
  ],
  parity: { strictPixelParity: true },
  passed: true,
});

test('strict acceptance never infers V3 success from report-only exit code', () => {
  assert.equal(
    classifyRendererHardwareStep(step('v3'), { passed: false, strictParity: false }),
    'blocked',
  );
  assert.equal(
    classifyRendererHardwareStep(step('v3'), { passed: true, strictParity: true }),
    'passed',
  );
  assert.equal(classifyRendererHardwareStep(step('v3', 1), null), 'error');
  assert.equal(
    classifyRendererHardwareStep(step('v3', 1), { passed: true, strictParity: true }),
    'error',
  );
});

test('V4 no-op, incomplete and mismatched policies fail closed', () => {
  assert.equal(classifyRendererHardwareStep(step('v4-index'), v4Report('index')), 'passed');
  assert.equal(
    classifyRendererHardwareStep(step('v4-index'), v4Report('index', false)),
    'candidate-not-exercised',
  );
  const early = v4Report('index', false);
  early.trials = early.trials.slice(0, 2);
  early.parity = null;
  early.passed = false;
  assert.equal(classifyRendererHardwareStep(step('v4-index', 1), early), 'candidate-not-exercised');
  assert.equal(classifyRendererHardwareStep(step('v4-index'), v4Report('caps')), 'error');
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), null), 'error');
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), v4Report('caps')), 'error');
  const parityFail = v4Report('caps');
  parityFail.passed = false;
  parityFail.parity.strictPixelParity = false;
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), parityFail), 'blocked');
});

test('aborted GPU report keeps already saved PNG and trace artifacts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'renderer-evidence-test-'));
  const source = join(directory, 'source');
  const target = join(directory, 'target');
  try {
    await mkdir(source);
    await writeFile(join(source, '1-A.png'), Buffer.from([137, 80, 78, 71]));
    await writeFile(join(source, 'report.json'), '{incomplete');
    const result = await preserveRendererHardwareEvidence(source, target);
    assert.equal(result.artifactsCopied, true);
    assert.equal(result.report, null);
    assert.equal(result.warnings.length, 1);
    assert.deepEqual(await readFile(join(target, '1-A.png')), Buffer.from([137, 80, 78, 71]));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('complete reports are copied and parsed; absent sources fail closed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'renderer-evidence-test-'));
  const source = join(directory, 'source');
  try {
    await mkdir(source);
    await writeFile(join(source, 'report.json'), '{"passed":false,"strictParity":false}');
    const ok = await preserveRendererHardwareEvidence(source, join(directory, 'target'));
    assert.deepEqual(ok.report, { passed: false, strictParity: false });
    assert.deepEqual(ok.warnings, []);
    const missing = await preserveRendererHardwareEvidence(
      join(directory, 'absent'),
      join(directory, 'not-copied'),
    );
    assert.equal(missing.artifactsCopied, false);
    assert.equal(missing.report, null);
    assert.equal(missing.warnings.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
