// Checkpoints are bounded diagnostic observations, not a complete native
// GL draw trace. Do not infer a causal owner from a missing interval.
export function compareRendererPhaseEvidence(left, right) {
  const a = left?.phaseCheckpoints;
  const b = right?.phaseCheckpoints;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) {
    return { status: 'not-captured', sequenceIdentical: null, firstDifferentPhase: null };
  }
  const coverageComplete =
    left.phaseCoverage?.complete === true && right.phaseCoverage?.complete === true;
  const firstFrameComplete =
    left.phaseCoverage?.finalFrameCaptured === true &&
    right.phaseCoverage?.finalFrameCaptured === true;
  const sequenceIdentical =
    a.length === b.length &&
    a.every(
      (item, i) =>
        item.afterDraw === b[i].afterDraw && item.kind === b[i].kind && item.status === b[i].status,
    );
  const base = {
    sequenceIdentical,
    coverageComplete,
    finalFrameCaptured: firstFrameComplete,
    skippedTransitions: [
      left.phaseCoverage?.transitionsSkipped ?? null,
      right.phaseCoverage?.transitionsSkipped ?? null,
    ],
  };
  if (!sequenceIdentical) {
    return { ...base, status: 'sequence-mismatch', firstDifferentPhase: null };
  }
  // A missing/invalid hash is not evidence of raster parity, even if both
  // contexts omitted it at the same checkpoint.
  if (
    [...a, ...b].some(
      (item) => item.status !== 'valid' || typeof item.hash !== 'string' || !item.hash,
    )
  ) {
    return { ...base, status: 'invalid-checkpoints', firstDifferentPhase: null };
  }
  const index = a.findIndex((item, i) => item.hash !== b[i].hash);
  if (index >= 0) {
    // The prior matching checkpoint bounds the observed divergence; the
    // reported owner/draw is not proof of the first causative draw.
    return {
      ...base,
      status: 'checkpoint-mismatch',
      firstDifferentPhase: {
        index,
        afterDraw: a[index].afterDraw,
        kind: a[index].kind,
        finalFrame: index === a.length - 1 && firstFrameComplete,
        precedingMatchingCheckpoint:
          index === 0
            ? null
            : {
                index: index - 1,
                afterDraw: a[index - 1].afterDraw,
                kind: a[index - 1].kind,
              },
      },
    };
  }
  return {
    ...base,
    status:
      coverageComplete && firstFrameComplete
        ? 'observed-checkpoints-identical'
        : 'bounded-checkpoints-identical',
    firstDifferentPhase: null,
  };
}
