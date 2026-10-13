import { validRendererRasterState } from './renderer-v3-raster-state.mjs';

// Bounded diagnostic milestones for localizing first observed WebGL drift.
// An interval is observational: do not infer a causative draw from its owner.
export const MAX_RENDERER_PHASE_DRAW = 1280;
export const DEFAULT_RENDERER_PHASE_DRAWS = [
  1, 128, 256, 384, 512, 640, 768, 896, 1024, 1152, 1280,
];

export function parseRendererPhaseWindow(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[1-9]\d*:[1-9]\d*$/.test(value))
    throw new Error('Phase window must be LOW:HIGH positive integer draw indices');
  const [low, high] = value.split(':').map(Number);
  if (
    !Number.isSafeInteger(low) ||
    !Number.isSafeInteger(high) ||
    high <= low ||
    high > MAX_RENDERER_PHASE_DRAW
  )
    throw new Error('Phase window must satisfy 1 <= LOW < HIGH <= 1280');
  return { low, high };
}

export function rendererPhaseMilestones(window) {
  if (window == null) return [...DEFAULT_RENDERER_PHASE_DRAWS];
  const { low, high } = window;
  // Verify even programmatic callers: a malformed window cannot arm a
  // misleading or unbounded GL readback schedule.
  const normalized = parseRendererPhaseWindow(`${low}:${high}`);
  const draws = Array.from(
    { length: 11 },
    (_, i) => normalized.low + Math.round(((normalized.high - normalized.low) * i) / 10),
  );
  return [...new Set(draws)];
}

export function summarizeRendererPhaseWindow(comparisons) {
  return comparisons
    .filter((comparison) => comparison.samePolicy)
    .map((comparison) => {
      const evidence = comparison.phaseEvidence;
      const first = evidence?.firstDifferentPhase;
      const preceding = first?.precedingMatchingCheckpoint;
      return {
        pair: [comparison.first, comparison.second],
        status: evidence?.status || 'not-captured',
        observedInterval:
          evidence?.status === 'checkpoint-mismatch' && preceding
            ? { afterMatchingDraw: preceding.afterDraw, byDifferentDraw: first.afterDraw }
            : null,
        // A later acquisition can resample the bounded interval; this
        // does NOT prove the first causal draw or authorize product parity.
        nextDiagnosticWindow:
          evidence?.status === 'checkpoint-mismatch' &&
          preceding &&
          preceding.afterDraw >= 1 &&
          first.afterDraw <= MAX_RENDERER_PHASE_DRAW &&
          first.afterDraw - preceding.afterDraw > 1
            ? `${preceding.afterDraw}:${first.afterDraw}`
            : null,
      };
    });
}

export function isRendererPhaseAcceptanceEligible({
  diagnosticNoDither = false,
  diagnosticNoMsaa = false,
  diagnosticPreservedMsaa = false,
  phaseWindowDiagnostic = false,
} = {}) {
  return (
    !diagnosticNoDither && !diagnosticNoMsaa && !diagnosticPreservedMsaa && !phaseWindowDiagnostic
  );
}

/**
 * Confirm that a hardware raster trace contains every requested readback,
 * including the final framebuffer. A matching hash is only useful when
 * the correct draw, GL buffer size and collection stage were observed.
 * Shared by the direct V3 probe and V4's artifact classifier.
 */
export function checkRendererPhaseCapture({
  checkpoints,
  coverage,
  milestones,
  drawCalls,
  framebuffer,
  requireRasterState = false,
}) {
  const reject = (reason) => ({ valid: false, reason });
  if (
    !Array.isArray(milestones) ||
    milestones.length === 0 ||
    milestones.length > 11 ||
    milestones.some(
      (draw, i) => !Number.isSafeInteger(draw) || draw <= 0 || (i > 0 && draw <= milestones[i - 1]),
    )
  )
    return reject('invalid milestones');
  if (!Number.isSafeInteger(drawCalls) || drawCalls <= milestones.at(-1))
    return reject('draw count does not include a final frame after milestones');
  if (
    !framebuffer ||
    framebuffer.status !== 'valid' ||
    !Number.isInteger(framebuffer.width) ||
    framebuffer.width <= 0 ||
    !Number.isInteger(framebuffer.height) ||
    framebuffer.height <= 0
  )
    return reject('invalid final framebuffer');
  const expected = [...milestones, drawCalls];
  if (
    !Array.isArray(checkpoints) ||
    checkpoints.length !== expected.length ||
    coverage?.mode !== 'draw-milestones' ||
    coverage?.captured !== expected.length ||
    coverage?.finalFrameCaptured !== true
  )
    return reject('incomplete draw-milestone coverage');
  for (let i = 0; i < expected.length; i++) {
    const checkpoint = checkpoints[i];
    if (
      checkpoint?.afterDraw !== expected[i] ||
      checkpoint.status !== 'valid' ||
      typeof checkpoint.hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(checkpoint.hash)
    )
      return reject(`missing or invalid checkpoint at index ${i}`);
    if (checkpoint.width !== framebuffer.width || checkpoint.height !== framebuffer.height)
      return reject(`framebuffer dimensions changed at checkpoint ${i}`);
    if (requireRasterState && !validRendererRasterState(checkpoint.rasterState))
      return reject(`missing or invalid GL raster state at checkpoint ${i}`);
  }
  return { valid: true, reason: null };
}
