import assert from 'node:assert/strict';
import test from 'node:test';
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
  assert.equal(classifyRendererHardwareStep(step('v4-index', 1), early), 'candidate-not-exercised');
  assert.equal(classifyRendererHardwareStep(step('v4-index'), v4Report('caps')), 'error');
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), null), 'error');
  const parityFail = v4Report('caps');
  parityFail.passed = false;
  parityFail.parity.strictPixelParity = false;
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), parityFail), 'blocked');
});
