import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildRendererR9CurrentV4PhaseWindowPlan,
  buildRendererR9FocusedDrawPlan,
  classifyRendererHardwareStep,
} from '../../scripts/test-helpers/renderer-unified-hardware-plan.mjs';
import { rendererPhaseMilestones } from '../../scripts/test-helpers/renderer-v3-phase-window.mjs';
import { RENDERER_RASTER_STATE_FIELDS } from '../../scripts/test-helpers/renderer-v3-raster-state.mjs';
import { mockR9FocusEvidence } from '../../scripts/tests/renderer-r9-focus-fixture.mjs';

const raster = () => {
  const arrays = {
    viewport: [0, 0, 531, 275],
    scissorBox: [0, 0, 531, 275],
    blendColor: [0, 0, 0, 0],
    colorMask: [true, true, true, true],
    depthRange: [0, 1],
  };
  const flags = new Set([
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
      Object.hasOwn(arrays, field) ? arrays[field] : flags.has(field) ? false : 1,
    ]),
  );
};

const evidence = () => {
  const [step] = buildRendererR9CurrentV4PhaseWindowPlan();
  const checkpoints = [...rendererPhaseMilestones(step.phaseWindow), 1408].map((afterDraw) => ({
    afterDraw,
    hash: 'a'.repeat(64),
    width: 531,
    height: 275,
    status: 'valid',
    rasterState: raster(),
  }));
  const trial = (label) => ({
    label,
    backend: { hardwareVerified: true, adapter: 'NVIDIA GeForce RTX 3060' },
    native: {
      contextAntialias: true,
      contextPreserveDrawingBuffer: false,
      defaultFramebufferSamples: 4,
      glState: { framebuffer: 'default' },
      focusDraws: mockR9FocusEvidence(),
      calls: 1408,
      framebuffer: { status: 'valid', width: 531, height: 275 },
    },
    phaseCoverage: {
      mode: 'draw-milestones',
      captured: checkpoints.length,
      finalFrameCaptured: true,
    },
    phaseCheckpoints: checkpoints,
  });
  return {
    stage: 'completed',
    phaseWindowDiagnostic: true,
    phaseWindow: { low: 128, high: 384 },
    acceptanceEligible: false,
    passed: false,
    strictParity: false,
    trials: ['1-OFF', '2-OFF', '3-ON', '4-ON'].map(trial),
    comparisons: [
      ['1-OFF', '2-OFF', true],
      ['3-ON', '4-ON', true],
      ['1-OFF', '3-ON', false],
    ].map(([first, second, samePolicy]) => ({
      first,
      second,
      samePolicy,
      framebufferIdentical: false,
      focusedDrawInputsIdentical: true,
      pixelDifference: { pixelIdentical: false },
    })),
  };
};

test('R9 V4 production MSAA probe has one bounded plan without V3 captures', () => {
  const [step] = buildRendererR9CurrentV4PhaseWindowPlan();
  assert.equal(step.branch, 'v4');
  assert.equal(step.id, 'v4-phase-window');
  assert.deepEqual(rendererPhaseMilestones(step.phaseWindow).length, 11);
  assert.throws(() => buildRendererR9CurrentV4PhaseWindowPlan('256:384'), /128:384/);

  const script = fileURLToPath(
    new URL('../../scripts/renderer-unified-hardware.mjs', import.meta.url),
  );
  const stdout = execFileSync(
    process.execPath,
    [script, '--plan-only', '--campaign=r9-phase-window'],
    { encoding: 'utf8' },
  );
  const planned = JSON.parse(stdout);
  assert.deepEqual(
    planned.plan.map((item) => item.id),
    ['v4-phase-window'],
  );
  assert.equal(planned.plan[0].branch, 'v4');
});

test('R9 V4 diagnostic requires 4 production-MSAA GPU arms and complete checkpoints', () => {
  const [step] = buildRendererR9CurrentV4PhaseWindowPlan();
  const classify = (report) => classifyRendererHardwareStep({ ...step, exitCode: 0 }, report);
  const complete = evidence();
  assert.equal(classify(complete), 'diagnostic-complete');
  const [focused] = buildRendererR9FocusedDrawPlan();
  const focusEvidence = structuredClone(complete);
  focusEvidence.focusWindowDiagnostic = true;
  assert.equal(
    classifyRendererHardwareStep({ ...focused, exitCode: 0 }, focusEvidence),
    'diagnostic-complete',
  );
  assert.equal(classifyRendererHardwareStep({ ...focused, exitCode: 0 }, complete), 'error');

  const altered = (change) => {
    const report = structuredClone(complete);
    change(report);
    assert.equal(classify(report), 'error');
  };
  altered((report) => {
    report.passed = true;
  });
  altered((report) => {
    report.trials[0].backend.hardwareVerified = false;
  });
  altered((report) => {
    report.trials[1].native.defaultFramebufferSamples = 0;
  });
  altered((report) => {
    report.trials[2].native.contextPreserveDrawingBuffer = true;
  });
  altered((report) => {
    report.trials[3].backend.adapter = 'SwiftShader';
  });
  altered((report) => {
    report.trials[0].phaseCheckpoints[3].hash = null;
  });
  altered((report) => {
    report.comparisons.pop();
  });
  altered((report) => {
    report.phaseWindow.low = 256;
  });
});
