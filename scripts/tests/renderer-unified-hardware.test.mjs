import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { preserveRendererHardwareEvidence } from '../test-helpers/renderer-hardware-evidence.mjs';
import { rendererPhaseMilestones } from '../test-helpers/renderer-v3-phase-window.mjs';
import { RENDERER_RASTER_STATE_FIELDS } from '../test-helpers/renderer-v3-raster-state.mjs';
import { mockR9FocusEvidence } from './renderer-r9-focus-fixture.mjs';
import {
  RENDERER_HARDWARE_BRANCHES,
  RENDERER_HARDWARE_V3_PINNED_SHA,
  buildRendererHardwareFetchArgs,
  buildRendererHardwarePlan,
  buildRendererR9HardwareCampaignPlan,
  buildRendererR9PreservedMsaaPlan,
  buildRendererR9CurrentV4PhaseWindowPlan,
  buildRendererR9FocusedDrawPlan,
  buildRendererR9V4NoMsaaDiagnosticPlan,
  buildRendererV3DitherDiagnosticPlan,
  buildRendererV3MsaaDiagnosticPlan,
  buildRendererV3PhaseWindowDiagnosticPlan,
  classifyRendererHardwareStep,
} from '../test-helpers/renderer-unified-hardware-plan.mjs';

test('R9 preserved-MSAA native evidence includes the WebGL drawing-buffer attribute', async () => {
  // The probe emitted this attribute before, but the report projection omitted
  // it and every native run stopped at 1-OFF with actual=undefined.
  const source = await readFile(
    new URL('../renderer-electrical-fresh-context-ab.mjs', import.meta.url),
    'utf8',
  );
  const projection = source.match(
    /native:\s*\{([\s\S]*?)\n\s*\},\n\s*cameraWorld: trace\.cameraWorld/,
  );
  assert.ok(projection, 'native WebGL evidence projection must exist');
  assert.match(projection[1], /contextAntialias:\s*frame\.contextAntialias/);
  assert.match(
    projection[1],
    /contextPreserveDrawingBuffer:\s*frame\.contextPreserveDrawingBuffer/,
  );
  assert.match(projection[1], /defaultFramebufferSamples:\s*frame\.defaultFramebufferSamples/);
});

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

test('V4 zero-MSAA diagnostic plans only Index, Caps and Combined without V3 repeat', () => {
  const plans = buildRendererR9V4NoMsaaDiagnosticPlan();
  assert.deepEqual(
    plans.map(({ id }) => id),
    ['v4-index-msaa-off', 'v4-caps-msaa-off', 'v4-combined-msaa-off'],
  );
  assert.ok(plans.every((p) => p.branch === 'v4' && p.args.includes('--diagnose-no-msaa')));
  assert.equal(new Set(plans.map((p) => p.artifact)).size, 3);
  const indexOnly = buildRendererR9V4NoMsaaDiagnosticPlan(['index']);
  assert.equal(indexOnly.length, 1);
  assert.equal(indexOnly[0].id, 'v4-index-msaa-off');
  assert.ok(indexOnly[0].args.includes('--isolate-index'));
  assert.deepEqual(
    buildRendererR9V4NoMsaaDiagnosticPlan(['caps', 'combined']).map((p) => p.id),
    ['v4-caps-msaa-off', 'v4-combined-msaa-off'],
  );
  assert.throws(() => buildRendererR9V4NoMsaaDiagnosticPlan(['index', 'index']), /Select unique/);
  assert.throws(() => buildRendererR9V4NoMsaaDiagnosticPlan([]), /Select unique/);
  assert.throws(() => buildRendererR9V4NoMsaaDiagnosticPlan(['invalid']), /Select unique/);
  const mode = plans[0];
  const report = {
    diagnosticNoMsaa: true,
    acceptanceEligible: false,
    passed: false,
    diagnosticComplete: true,
    stage: 'complete',
    candidateMode: 'index',
    parity: { strictPixelParity: false },
    comparisons: Array.from({ length: 6 }, () => ({})),
    trials: Array.from({ length: 4 }, () => ({
      rasterIsolation: {
        contextAntialias: false,
        defaultFramebuffer: true,
        defaultFramebufferSamples: 0,
      },
      backend: { hardwareVerified: true },
      candidateActivation: { candidateExercised: true },
    })),
  };
  assert.equal(
    classifyRendererHardwareStep({ ...mode, exitCode: 0 }, report),
    'diagnostic-complete',
  );
  assert.equal(
    classifyRendererHardwareStep({ ...mode, exitCode: 0 }, { ...report, passed: true }),
    'error',
  );
  const withSamples = structuredClone(report);
  withSamples.trials[0].rasterIsolation.defaultFramebufferSamples = 4;
  assert.equal(classifyRendererHardwareStep({ ...mode, exitCode: 0 }, withSamples), 'error');
  const inactive = structuredClone(report);
  inactive.trials[1].candidateActivation.candidateExercised = false;
  assert.equal(
    classifyRendererHardwareStep({ ...mode, exitCode: 0 }, inactive),
    'candidate-not-exercised',
  );
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

test('R9 native 4x-MSAA phase-window plan is strictly V4-only and bounded', () => {
  const [step] = buildRendererR9CurrentV4PhaseWindowPlan();
  assert.equal(step.id, 'v4-phase-window');
  assert.equal(step.branch, 'v4');
  assert.equal(step.phaseWindow.low, 128);
  assert.equal(step.phaseWindow.high, 384);
  assert.deepEqual(step.args, [
    '--hardware-gpu',
    '--report-only',
    '--diagnose-phase-window=128:384',
  ]);
  assert.equal(rendererPhaseMilestones(step.phaseWindow).length, 11);
  assert.equal(buildRendererR9CurrentV4PhaseWindowPlan('128:384').length, 1);
  assert.throws(() => buildRendererR9CurrentV4PhaseWindowPlan('0:384'), /Phase window/);
  assert.throws(() => buildRendererR9CurrentV4PhaseWindowPlan('256:384'), /128:384/);
  assert.throws(() => buildRendererR9CurrentV4PhaseWindowPlan('128:1280'), /128:384/);
});

test('R9 V4 phase-window classification requires real production 4x-MSAA evidence', () => {
  const [step] = buildRendererR9CurrentV4PhaseWindowPlan();
  const checkpoint = completePhaseTrial(rendererPhaseMilestones(step.phaseWindow));
  const labels = ['1-OFF', '2-OFF', '3-ON', '4-ON'];
  const valid = {
    phaseWindowDiagnostic: true,
    phaseWindow: { low: 128, high: 384 },
    acceptanceEligible: false,
    passed: false,
    stage: 'completed',
    strictParity: false,
    comparisons: [
      { first: '1-OFF', second: '2-OFF', samePolicy: true },
      { first: '3-ON', second: '4-ON', samePolicy: true },
      { first: '1-OFF', second: '3-ON', samePolicy: false },
    ].map((comparison) => ({
      ...comparison,
      pixelDifference: { pixelIdentical: false },
      framebufferIdentical: false,
      focusedDrawInputsIdentical: true,
    })),
    trials: labels.map((label) => ({
      ...structuredClone(checkpoint),
      label,
      backend: { hardwareVerified: true, adapter: 'NVIDIA GeForce RTX 3060' },
      native: {
        ...structuredClone(checkpoint.native),
        contextAntialias: true,
        contextPreserveDrawingBuffer: false,
        defaultFramebufferSamples: 4,
        glState: { framebuffer: 'default' },
        focusDraws: mockR9FocusEvidence(),
      },
    })),
  };
  const status = (evidence) => classifyRendererHardwareStep({ ...step, exitCode: 0 }, evidence);
  assert.equal(status(valid), 'diagnostic-complete');

  const [focus] = buildRendererR9FocusedDrawPlan();
  assert.equal(focus.id, 'v4-focused-draws');
  assert.equal(focus.branch, 'v4');
  assert.deepEqual(focus.args.at(-1), '--diagnose-focus-window=129:154');
  assert.equal(focus.artifact.endsWith('focused-129-154'), true);
  const focusEvidence = structuredClone(valid);
  focusEvidence.focusWindowDiagnostic = true;
  const focusedStatus = (report) => classifyRendererHardwareStep({ ...focus, exitCode: 0 }, report);
  assert.equal(focusedStatus(focusEvidence), 'diagnostic-complete');
  assert.equal(focusedStatus(valid), 'error');
  const missingFocusedDraw = structuredClone(focusEvidence);
  missingFocusedDraw.trials[0].native.focusDraws.pop();
  assert.equal(focusedStatus(missingFocusedDraw), 'error');

  const accidentallyApproved = structuredClone(valid);
  accidentallyApproved.passed = true;
  assert.equal(status(accidentallyApproved), 'error');

  const unverified = structuredClone(valid);
  unverified.trials[1].backend.hardwareVerified = false;
  assert.equal(status(unverified), 'error');

  const wrongSample = structuredClone(valid);
  wrongSample.trials[0].native.defaultFramebufferSamples = 0;
  assert.equal(status(wrongSample), 'error');

  const preserved = structuredClone(valid);
  preserved.trials[2].native.contextPreserveDrawingBuffer = true;
  assert.equal(status(preserved), 'error');

  const missingReadback = structuredClone(valid);
  missingReadback.trials[0].phaseCheckpoints[3].hash = null;
  assert.equal(status(missingReadback), 'error');

  const wrongWindow = structuredClone(valid);
  wrongWindow.phaseWindow = { low: 256, high: 384 };
  assert.equal(status(wrongWindow), 'error');

  const wrongAdapter = structuredClone(valid);
  wrongAdapter.trials[3].backend.adapter = 'SwiftShader';
  assert.equal(status(wrongAdapter), 'error');

  const noComparisons = structuredClone(valid);
  noComparisons.comparisons.pop();
  assert.equal(status(noComparisons), 'error');
});

test('preserved 4x-MSAA experiment is V4-only and cannot pass product acceptance', () => {
  const [step] = buildRendererR9PreservedMsaaPlan();
  assert.equal(step.branch, 'v4');
  assert.equal(step.id, 'v4-preserved-msaa');
  assert.deepEqual(step.args, ['--hardware-gpu', '--report-only', '--diagnose-preserved-msaa']);
  const valid = {
    diagnosticPreservedMsaa: true,
    diagnosticNoMsaa: false,
    acceptanceEligible: false,
    passed: false,
    stage: 'completed',
    strictParity: true,
    comparisons: [
      { first: '1-OFF', second: '2-OFF', samePolicy: true },
      { first: '3-ON', second: '4-ON', samePolicy: true },
      { first: '1-OFF', second: '3-ON', samePolicy: false },
    ].map((pair) => ({
      ...pair,
      pixelDifference: { pixelIdentical: true },
      framebufferIdentical: true,
    })),
    trials: Array.from({ length: 4 }, (_, index) => ({
      ...completePhaseTrial(),
      label: ['1-OFF', '2-OFF', '3-ON', '4-ON'][index],
      backend: { hardwareVerified: true, adapter: 'RTX 3060' },
      native: {
        ...completePhaseTrial().native,
        contextAntialias: true,
        contextPreserveDrawingBuffer: true,
        defaultFramebufferSamples: 4,
        glState: { framebuffer: 'default' },
      },
    })),
  };
  assert.equal(
    classifyRendererHardwareStep({ ...step, exitCode: 0 }, valid),
    'diagnostic-complete',
  );
  assert.equal(
    classifyRendererHardwareStep({ ...step, exitCode: 0 }, { ...valid, passed: true }),
    'error',
  );
  const missingPreservation = structuredClone(valid);
  delete missingPreservation.trials[0].native.contextPreserveDrawingBuffer;
  assert.equal(
    classifyRendererHardwareStep({ ...step, exitCode: 0 }, missingPreservation),
    'error',
  );
  const invalid = structuredClone(valid);
  invalid.trials[2].native.defaultFramebufferSamples = 0;
  assert.equal(classifyRendererHardwareStep({ ...step, exitCode: 0 }, invalid), 'error');
  const mismatched = structuredClone(valid);
  mismatched.trials[1].backend.adapter = 'different adapter';
  assert.equal(classifyRendererHardwareStep({ ...step, exitCode: 0 }, mismatched), 'error');
  const missingComparison = structuredClone(valid);
  delete missingComparison.comparisons[1].pixelDifference;
  assert.equal(classifyRendererHardwareStep({ ...step, exitCode: 0 }, missingComparison), 'error');
  const reordered = structuredClone(valid);
  reordered.trials.reverse();
  assert.equal(classifyRendererHardwareStep({ ...step, exitCode: 0 }, reordered), 'error');
  const actualDrift = structuredClone(valid);
  actualDrift.strictParity = false;
  actualDrift.comparisons[0].pixelDifference.pixelIdentical = false;
  actualDrift.comparisons[0].framebufferIdentical = false;
  assert.equal(
    classifyRendererHardwareStep({ ...step, exitCode: 0 }, actualDrift),
    'diagnostic-complete',
  );
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
