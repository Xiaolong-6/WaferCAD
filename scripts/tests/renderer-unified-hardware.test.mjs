import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preserveRendererHardwareEvidence } from '../test-helpers/renderer-hardware-evidence.mjs';
import { rendererPhaseMilestones } from '../test-helpers/renderer-v3-phase-window.mjs';
import { RENDERER_RASTER_STATE_FIELDS } from '../test-helpers/renderer-v3-raster-state.mjs';
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
} from '../test-helpers/renderer-unified-hardware-plan.mjs';

test('one hardware plan retains exact V3 and three independent V4 candidate artifacts', () => {
  assert.match(RENDERER_HARDWARE_BRANCHES.v3, /transparent-renderer-v3/);
  const plan = buildRendererHardwarePlan();
  assert.deepEqual(
    plan.map(({ id }) => id),
    ['v3', 'v4-index', 'v4-caps', 'v4-combined'],
  );
  assert.deepEqual(plan[0].args, ['--hardware-gpu', '--report-only']);
  assert.deepEqual(plan[1].args, ['--hardware-gpu', '--isolate-index']);
  assert.deepEqual(plan[2].args, ['--hardware-gpu', '--isolate-caps']);
  assert.deepEqual(plan[3].args, ['--hardware-gpu']);
  assert.equal(new Set(plan.map(({ artifact }) => artifact)).size, plan.length);
  assert.deepEqual(
    buildRendererHardwarePlan(['caps']).map(({ id }) => id),
    ['v3', 'v4-caps'],
  );
  assert.throws(() => buildRendererHardwarePlan([]), /Select unique/);
  assert.throws(() => buildRendererHardwarePlan(['index', 'index']), /Select unique/);
  assert.throws(() => buildRendererHardwarePlan(['unknown']), /Select unique/);
});

test('R9 fetch only needs live V4 and pins the deleted V3 branch to exact PR #166 commit', () => {
  assert.equal(RENDERER_HARDWARE_V3_PINNED_SHA, '4e7128042fb5ef86908e4ee7e3df7084ae7ce52f');
  assert.deepEqual(buildRendererHardwareFetchArgs(), [
    'fetch',
    '--no-tags',
    'origin',
    'refs/heads/perf/renderer-v4-adaptive-tiles-20261010:refs/remotes/origin/perf/renderer-v4-adaptive-tiles-20261010',
  ]);
  assert.ok(
    !buildRendererHardwareFetchArgs().some((arg) => arg.includes(RENDERER_HARDWARE_BRANCHES.v3)),
  );
});

test('R9 single-GPU-session campaign captures baseline, no-MSAA control and independent V4 modes', () => {
  const plan = buildRendererR9HardwareCampaignPlan();
  assert.deepEqual(
    plan.map(({ id }) => id),
    ['v3', 'v3-msaa-off', 'v4-index', 'v4-caps', 'v4-combined'],
  );
  assert.deepEqual(plan[0], buildRendererHardwarePlan()[0]);
  assert.deepEqual(plan[1], buildRendererV3MsaaDiagnosticPlan()[0]);
  assert.equal(plan.length, new Set(plan.map(({ artifact }) => artifact)).size);
  assert.equal(
    plan.every(({ args }) => args.includes('--hardware-gpu')),
    true,
  );
  assert.ok(plan[1].args.includes('--diagnose-no-msaa'));
  assert.ok(plan.slice(2).every(({ args }) => !args.includes('--diagnose-no-msaa')));
});

test('DITHER-off diagnostic is one V3-only experiment, never product acceptance', () => {
  const [only] = buildRendererV3DitherDiagnosticPlan();
  assert.equal(buildRendererV3DitherDiagnosticPlan().length, 1);
  assert.equal(only.id, 'v3-dither-off');
  assert.equal(only.branch, 'v3');
  assert.deepEqual(only.args, ['--hardware-gpu', '--report-only', '--diagnose-no-dither']);
  assert.notEqual(only.artifact, buildRendererHardwarePlan()[0].artifact);
  const report = {
    stage: 'completed',
    passed: false,
    strictParity: true,
    diagnosticNoDither: true,
    acceptanceEligible: false,
    trials: Array.from({ length: 4 }, () => ({
      native: { forcedDitherDisabledDraws: 1408 },
    })),
  };
  assert.equal(
    classifyRendererHardwareStep({ ...only, exitCode: 0 }, report),
    'diagnostic-complete',
  );
  assert.equal(
    classifyRendererHardwareStep({ ...only, exitCode: 0 }, { ...report, acceptanceEligible: true }),
    'error',
  );
  assert.equal(
    classifyRendererHardwareStep(
      { ...only, exitCode: 0 },
      {
        ...report,
        trials: [{ native: { forcedDitherDisabledDraws: 0 } }],
      },
    ),
    'incomplete',
  );
  assert.equal(
    classifyRendererHardwareStep(
      { ...only, exitCode: 0 },
      {
        ...report,
        trials: [{ native: { forcedDitherDisabledDraws: 0 } }, ...report.trials.slice(1)],
      },
    ),
    'error',
  );
});

test('no-MSAA mode requires verified zero sample framebuffer and never approves product', () => {
  const [step] = buildRendererV3MsaaDiagnosticPlan();
  assert.deepEqual(step.args, ['--hardware-gpu', '--report-only', '--diagnose-no-msaa']);
  assert.notEqual(step.artifact, buildRendererV3DitherDiagnosticPlan()[0].artifact);
  const standard = {
    stage: 'completed',
    passed: false,
    strictParity: true,
    diagnosticNoMsaa: true,
    diagnosticNoDither: false,
    acceptanceEligible: false,
    trials: Array.from({ length: 4 }, () => ({
      native: {
        contextAntialias: false,
        defaultFramebufferSamples: 0,
        glState: { framebuffer: 'default' },
      },
    })),
  };
  assert.equal(
    classifyRendererHardwareStep({ ...step, exitCode: 0 }, standard),
    'diagnostic-complete',
  );
  assert.equal(
    classifyRendererHardwareStep(
      { ...step, exitCode: 0 },
      { ...standard, acceptanceEligible: true },
    ),
    'error',
  );
  assert.equal(
    classifyRendererHardwareStep(
      { ...step, exitCode: 0 },
      { ...standard, diagnosticNoDither: true },
    ),
    'error',
  );
  assert.equal(
    classifyRendererHardwareStep(
      { ...step, exitCode: 0 },
      { ...standard, trials: standard.trials.slice(0, 1) },
    ),
    'incomplete',
  );
  for (const changed of [
    { contextAntialias: true },
    { defaultFramebufferSamples: 4 },
    { glState: { framebuffer: 'offscreen' } },
  ]) {
    assert.equal(
      classifyRendererHardwareStep(
        { ...step, exitCode: 0 },
        {
          ...standard,
          trials: [
            { native: { ...standard.trials[0].native, ...changed } },
            ...standard.trials.slice(1),
          ],
        },
      ),
      'error',
    );
  }
});

const step = (id, exitCode = 0) => ({ id, exitCode });
const rasterState = () => {
  const arrays = {
    viewport: [0, 0, 531, 275],
    scissorBox: [0, 0, 531, 275],
    blendColor: [0, 0, 0, 0],
    colorMask: [true, true, true, true],
    depthRange: [0, 1],
  };
  const booleans = new Set([
    'scissorTest',
    'blend',
    'depthTest',
    'depthMask',
    'stencilTest',
    'cullFace',
    'dither',
    'polygonOffsetFill',
    'sampleAlphaToCoverage',
    'sampleCoverage',
    'sampleCoverageInvert',
  ]);
  return Object.fromEntries(
    RENDERER_RASTER_STATE_FIELDS.map((field) => [
      field,
      Object.hasOwn(arrays, field) ? [...arrays[field]] : booleans.has(field) ? false : 1,
    ]),
  );
};
const completePhaseTrial = (milestones = rendererPhaseMilestones(null), calls = 1408) => {
  const checkpoints = [...milestones, calls].map((afterDraw) => ({
    afterDraw,
    status: 'valid',
    hash: 'a'.repeat(64),
    width: 531,
    height: 275,
    rasterState: rasterState(),
  }));
  return {
    native: { calls, framebuffer: { status: 'valid', width: 531, height: 275 } },
    phaseCoverage: {
      mode: 'draw-milestones',
      captured: checkpoints.length,
      finalFrameCaptured: true,
    },
    phaseCheckpoints: checkpoints,
  };
};
const v4Report = (mode, active = true) => ({
  stage: 'complete',
  candidateMode: mode,
  trials: [
    { policy: 'A', candidateActivation: { candidateExercised: true } },
    { policy: 'B', candidateActivation: { candidateExercised: active } },
    { policy: 'B', candidateActivation: { candidateExercised: active } },
    { policy: 'A', candidateActivation: { candidateExercised: true } },
  ],
  parity: { strictPixelParity: true },
  passed: true,
});

test('targeted phase-window evidence cannot approve V3 production raster parity', () => {
  const [step] = buildRendererV3PhaseWindowDiagnosticPlan('256:384');
  assert.equal(step.id, 'v3-phase-window');
  assert.deepEqual(step.phaseWindow, { low: 256, high: 384 });
  assert.deepEqual(step.args, [
    '--hardware-gpu',
    '--report-only',
    '--diagnose-phase-window=256:384',
  ]);
  assert.match(step.artifact, /phase-window-256-384$/);
  assert.throws(() => buildRendererV3PhaseWindowDiagnosticPlan('0:384'), /Phase window/);
  const trial = completePhaseTrial(rendererPhaseMilestones(step.phaseWindow));
  const report = {
    stage: 'completed',
    passed: false,
    strictParity: true,
    phaseWindowDiagnostic: true,
    phaseWindow: { low: 256, high: 384 },
    acceptanceEligible: false,
    trials: Array.from({ length: 4 }, () => structuredClone(trial)),
  };
  assert.equal(
    classifyRendererHardwareStep({ ...step, exitCode: 0 }, report),
    'diagnostic-complete',
  );
  assert.equal(
    classifyRendererHardwareStep({ ...step, exitCode: 0 }, { ...report, passed: true }),
    'error',
  );
  assert.equal(
    classifyRendererHardwareStep({ ...step, exitCode: 0 }, { ...report, acceptanceEligible: true }),
    'error',
  );
  const missing = structuredClone(report);
  missing.trials[0].phaseCheckpoints[3].hash = null;
  assert.equal(classifyRendererHardwareStep({ ...step, exitCode: 0 }, missing), 'error');
  const wrong = structuredClone(report);
  wrong.trials[2].phaseCheckpoints[1].afterDraw = 400;
  assert.equal(classifyRendererHardwareStep({ ...step, exitCode: 0 }, wrong), 'error');
  const missingState = structuredClone(report);
  delete missingState.trials[2].phaseCheckpoints[1].rasterState;
  assert.equal(classifyRendererHardwareStep({ ...step, exitCode: 0 }, missingState), 'error');
});

test('strict acceptance never infers V3 success from report-only exit code', () => {
  const complete = {
    stage: 'completed',
    trials: Array.from({ length: 4 }, () => completePhaseTrial()),
    passed: false,
    strictParity: false,
    acceptanceEligible: true,
  };
  assert.equal(classifyRendererHardwareStep(step('v3'), complete), 'blocked');
  const incompletePhase = structuredClone(complete);
  incompletePhase.trials[0].phaseCheckpoints.splice(4, 1);
  assert.equal(classifyRendererHardwareStep(step('v3'), incompletePhase), 'error');
  const changedDimensions = structuredClone(complete);
  changedDimensions.trials[1].phaseCheckpoints[5].height++;
  assert.equal(classifyRendererHardwareStep(step('v3'), changedDimensions), 'error');
  const noRaster = structuredClone(complete);
  delete noRaster.trials[0].phaseCheckpoints[7].rasterState;
  assert.equal(classifyRendererHardwareStep(step('v3'), noRaster), 'error');
  assert.equal(
    classifyRendererHardwareStep(step('v3'), { ...complete, passed: true, strictParity: true }),
    'passed',
  );
  assert.equal(
    classifyRendererHardwareStep(step('v3'), {
      ...complete,
      stage: '1-OFF',
      trials: [{}],
      error: 'page.goto: ERR_HTTP_RESPONSE_CODE_FAILURE',
    }),
    'error',
  );
  assert.equal(classifyRendererHardwareStep(step('v3', 1), null), 'error');
  assert.equal(
    classifyRendererHardwareStep(step('v3', 1), { ...complete, passed: true, strictParity: true }),
    'error',
  );
});

test('V4 no-op, incomplete and mismatched policies fail closed', () => {
  assert.equal(classifyRendererHardwareStep(step('v4-index'), v4Report('index')), 'passed');
  const unexpectedBaseline = v4Report('index');
  unexpectedBaseline.trials[0].candidateActivation.candidateExercised = false;
  assert.equal(
    classifyRendererHardwareStep(step('v4-index'), unexpectedBaseline),
    'candidate-not-exercised',
  );
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
  const interrupted = v4Report('caps', false);
  interrupted.trials = [{ policy: 'A' }];
  interrupted.parity = null;
  interrupted.failure = 'page.goto: ERR_HTTP_RESPONSE_CODE_FAILURE';
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), interrupted), 'error');
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), v4Report('caps')), 'error');
  const parityFail = v4Report('caps');
  parityFail.passed = false;
  parityFail.parity.strictPixelParity = false;
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), parityFail), 'blocked');

  // Reproduces the actual October 12 Windows capture shape. R7 records all
  // six pairs, then intentionally throws a strict-parity assertion: blocked
  // is a scientific acceptance result, not an infrastructure crash.
  const captured = v4Report('caps');
  captured.passed = false;
  captured.parity.strictPixelParity = false;
  captured.comparisons = Array.from({ length: 6 }, (_, i) => ({ pair: i }));
  captured.failure =
    'AssertionError [ERR_ASSERTION]: R7 strict parity blocked: baseline A1/A2 fresh-context pixel parity failed';
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), captured), 'blocked');

  const bootCrash = { ...captured, stage: 'capture-1-A' };
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), bootCrash), 'error');
  const incomplete = { ...captured, comparisons: [] };
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), incomplete), 'error');
  const unrelated = { ...captured, failure: 'AssertionError: wrong geometry' };
  assert.equal(classifyRendererHardwareStep(step('v4-caps', 1), unrelated), 'error');
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
