import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RENDERER_RASTER_STATE_FIELDS,
  compareRendererRasterStateEvidence,
  validRendererRasterState,
} from '../../scripts/test-helpers/renderer-v3-raster-state.mjs';
import {
  DEFAULT_RENDERER_PHASE_DRAWS,
  checkRendererPhaseCapture,
  MAX_RENDERER_PHASE_DRAW,
  isRendererPhaseAcceptanceEligible,
  parseRendererPhaseWindow,
  rendererPhaseMilestones,
  summarizeRendererPhaseWindow,
} from '../../scripts/test-helpers/renderer-v3-phase-window.mjs';

test('fixed production comparison draws remain unchanged without a phase diagnostic', () => {
  assert.deepEqual(rendererPhaseMilestones(null), DEFAULT_RENDERER_PHASE_DRAWS);
  assert.equal(rendererPhaseMilestones(null).length, 11);
  assert.equal(parseRendererPhaseWindow(undefined), null);
});

test('narrow fresh-context mismatch interval captures bounded ordered draws', () => {
  const parsed = parseRendererPhaseWindow('256:384');
  assert.deepEqual(parsed, { low: 256, high: 384 });
  const draws = rendererPhaseMilestones(parsed);
  assert.equal(draws[0], 256);
  assert.equal(draws.at(-1), 384);
  assert.equal(draws.length, 11);
  assert.ok(draws.every((draw, i) => i === 0 || draw > draws[i - 1]));
  assert.ok(draws.every((draw) => draw >= 256 && draw <= 384));
});

test('one-draw span does not repeat checkpoints or exceed diagnostic budget', () => {
  const draws = rendererPhaseMilestones(parseRendererPhaseWindow('256:257'));
  assert.deepEqual(draws, [256, 257]);
  assert.equal(rendererPhaseMilestones(parseRendererPhaseWindow('1:1280')).length, 11);
  assert.equal(MAX_RENDERER_PHASE_DRAW, 1280);
});

test('invalid or oversized intervals fail before starting a hardware browser', () => {
  for (const value of [
    '',
    '0:10',
    '10:10',
    '10:9',
    '1:1281',
    '-1:20',
    '1.5:5',
    '0x1:5',
    '1:Infinity',
    'NaN:5',
    '1:2:3',
    '2: 3',
    '9007199254740991:9007199254740993',
    '2:999999999999999999999',
  ]) {
    assert.throws(() => parseRendererPhaseWindow(value), /Phase window/, value);
  }
  assert.throws(() => rendererPhaseMilestones({ low: -1, high: 5 }), /Phase window/);
});

test('only comparable same-policy checkpoint intervals yield follow-up windows', () => {
  const comparisons = [
    {
      first: '1-OFF',
      second: '2-OFF',
      samePolicy: true,
      phaseEvidence: {
        status: 'checkpoint-mismatch',
        firstDifferentPhase: {
          afterDraw: 384,
          precedingMatchingCheckpoint: { afterDraw: 256 },
        },
      },
    },
    {
      first: '3-ON',
      second: '4-ON',
      samePolicy: true,
      phaseEvidence: {
        status: 'checkpoint-mismatch',
        firstDifferentPhase: {
          afterDraw: 1,
          precedingMatchingCheckpoint: null,
        },
      },
    },
    { first: '1-OFF', second: '3-ON', samePolicy: false },
  ];
  assert.deepEqual(summarizeRendererPhaseWindow(comparisons), [
    {
      pair: ['1-OFF', '2-OFF'],
      status: 'checkpoint-mismatch',
      observedInterval: { afterMatchingDraw: 256, byDifferentDraw: 384 },
      nextDiagnosticWindow: '256:384',
    },
    {
      pair: ['3-ON', '4-ON'],
      status: 'checkpoint-mismatch',
      observedInterval: null,
      nextDiagnosticWindow: null,
    },
  ]);
});

test('final frame beyond bounded draw budget is not suggested as a follow-up command', () => {
  const [row] = summarizeRendererPhaseWindow([
    {
      first: '1-OFF',
      second: '2-OFF',
      samePolicy: true,
      phaseEvidence: {
        status: 'checkpoint-mismatch',
        firstDifferentPhase: {
          afterDraw: 1408,
          precedingMatchingCheckpoint: { afterDraw: 1280 },
        },
      },
    },
  ]);
  assert.deepEqual(row.observedInterval, { afterMatchingDraw: 1280, byDifferentDraw: 1408 });
  assert.equal(row.nextDiagnosticWindow, null);
});

test('matching and invalid checkpoints do not fabricate a divergence interval', () => {
  for (const status of ['bounded-checkpoints-identical', 'invalid-checkpoints']) {
    const result = summarizeRendererPhaseWindow([
      { first: 'A', second: 'B', samePolicy: true, phaseEvidence: { status } },
    ]);
    assert.equal(result[0].observedInterval, null);
    assert.equal(result[0].nextDiagnosticWindow, null);
  }
});

test('targeted raster isolation never satisfies ordinary product acceptance', () => {
  assert.equal(isRendererPhaseAcceptanceEligible(), true);
  assert.equal(isRendererPhaseAcceptanceEligible({ phaseWindowDiagnostic: true }), false);
  assert.equal(isRendererPhaseAcceptanceEligible({ diagnosticNoDither: true }), false);
  assert.equal(isRendererPhaseAcceptanceEligible({ diagnosticNoMsaa: true }), false);
  assert.equal(isRendererPhaseAcceptanceEligible({ diagnosticPreservedMsaa: true }), false);
});

test('hardware milestone capture requires every draw, stable framebuffer dimensions and a final frame', () => {
  const milestones = DEFAULT_RENDERER_PHASE_DRAWS;
  const framebuffer = { status: 'valid', width: 531, height: 275 };
  const checkpoints = [...milestones, 1408].map((afterDraw) => ({
    afterDraw,
    status: 'valid',
    hash: 'a'.repeat(64),
    width: 531,
    height: 275,
  }));
  const coverage = {
    mode: 'draw-milestones',
    captured: checkpoints.length,
    finalFrameCaptured: true,
  };
  const input = { milestones, framebuffer, checkpoints, coverage, drawCalls: 1408 };
  const valid = checkRendererPhaseCapture(input);
  assert.equal(valid.valid, true);

  const corrupted = [
    { checkpoints: checkpoints.slice(1) },
    { checkpoints: checkpoints.slice(0, -1) },
    { checkpoints: checkpoints.map((c, i) => (i === 3 ? { ...c, afterDraw: 385 } : c)) },
    { checkpoints: checkpoints.map((c, i) => (i === 3 ? { ...c, hash: null } : c)) },
    { checkpoints: checkpoints.map((c, i) => (i === 3 ? { ...c, hash: 'f'.repeat(63) } : c)) },
    { checkpoints: checkpoints.map((c, i) => (i === 3 ? { ...c, width: 532 } : c)) },
    { coverage: { ...coverage, captured: 4 } },
    { coverage: { ...coverage, mode: 'owner-transitions' } },
    { coverage: { ...coverage, finalFrameCaptured: false } },
    { framebuffer: { ...framebuffer, status: 'gl-error' } },
    { drawCalls: 1280 },
  ];
  for (const change of corrupted) {
    const result = checkRendererPhaseCapture({ ...input, ...change });
    assert.equal(result.valid, false, result.reason);
    assert.ok(result.reason);
  }
});

test('targeted two-draw window still demands the exact ordered final capture', () => {
  const milestones = rendererPhaseMilestones(parseRendererPhaseWindow('256:257'));
  const framebuffer = { status: 'valid', width: 531, height: 275 };
  const checkpoints = [256, 257, 1291].map((afterDraw) => ({
    afterDraw,
    status: 'valid',
    hash: 'b'.repeat(64),
    width: 531,
    height: 275,
  }));
  assert.deepEqual(milestones, [256, 257]);
  assert.equal(
    checkRendererPhaseCapture({
      milestones,
      checkpoints,
      framebuffer,
      coverage: { mode: 'draw-milestones', captured: 3, finalFrameCaptured: true },
      drawCalls: 1291,
    }).valid,
    true,
  );
});

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

test('draw-level GL raster state accepts comparable primitives but rejects gaps and identities', () => {
  const correct = rasterState();
  assert.equal(validRendererRasterState(correct), true);
  assert.equal(validRendererRasterState(null), false);
  assert.equal(validRendererRasterState({ ...correct, blendSrcAlpha: undefined }), false);
  assert.equal(validRendererRasterState({ ...correct, viewport: [1, 2, 3] }), false);
  assert.equal(validRendererRasterState({ ...correct, blendColor: [1, NaN, 0, 0] }), false);
  assert.equal(validRendererRasterState({ ...correct, blend: 1 }), false);
  assert.equal(validRendererRasterState({ ...correct, colorMask: [1, 1, 1, 1] }), false);
});

test('same-policy raster comparison identifies sampled state divergence independently of pixels', () => {
  const base = rasterState();
  const left = {
    phaseCheckpoints: [
      { afterDraw: 256, rasterState: structuredClone(base) },
      { afterDraw: 384, rasterState: structuredClone(base) },
    ],
  };
  const right = structuredClone(left);
  assert.equal(compareRendererRasterStateEvidence(left, right).status, 'sampled-states-identical');
  right.phaseCheckpoints[1].rasterState.blendSrcAlpha = 770;
  const changed = compareRendererRasterStateEvidence(left, right);
  assert.equal(changed.status, 'sampled-state-mismatch');
  assert.deepEqual(changed.firstDifferentState.fields, ['blendSrcAlpha']);
  assert.equal(changed.firstDifferentState.afterDraw, 384);
  assert.deepEqual(changed.firstDifferentState.left, { blendSrcAlpha: 1 });
  assert.deepEqual(changed.firstDifferentState.right, { blendSrcAlpha: 770 });

  const absent = structuredClone(right);
  delete absent.phaseCheckpoints[0].rasterState;
  assert.equal(compareRendererRasterStateEvidence(left, absent).status, 'invalid-raster-state');
  const sequence = structuredClone(right);
  sequence.phaseCheckpoints[0].afterDraw = 257;
  assert.equal(compareRendererRasterStateEvidence(left, sequence).status, 'sequence-mismatch');
  assert.equal(compareRendererRasterStateEvidence({}, {}).status, 'not-captured');
});

test('hardware phase gate requires GL raster census when requested, and rejects missing checkpoints', () => {
  const milestones = [256, 384];
  const state = rasterState();
  const frame = { status: 'valid', width: 531, height: 275 };
  const checkpoints = [256, 384, 1408].map((afterDraw) => ({
    afterDraw,
    status: 'valid',
    hash: 'c'.repeat(64),
    width: 531,
    height: 275,
    rasterState: structuredClone(state),
  }));
  const input = {
    checkpoints,
    milestones,
    drawCalls: 1408,
    framebuffer: frame,
    coverage: { mode: 'draw-milestones', captured: 3, finalFrameCaptured: true },
    requireRasterState: true,
  };
  assert.equal(checkRendererPhaseCapture(input).valid, true);
  const damaged = structuredClone(checkpoints);
  damaged[1].rasterState.blendColor = [];
  assert.equal(checkRendererPhaseCapture({ ...input, checkpoints: damaged }).valid, false);
  assert.equal(
    checkRendererPhaseCapture({
      ...input,
      checkpoints: checkpoints.map(({ rasterState: ignored, ...checkpoint }) => checkpoint),
    }).valid,
    false,
  );
});
