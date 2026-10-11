// R7 ABBA statistics are descriptive, never GPU timing or approval by themselves.
// Fixed A-B-B-A ordering mitigates monotonic warm-up but cannot remove driver drift.
export const R7_CANDIDATE_FLAGS = Object.freeze({
  combined: Object.freeze(['rendererV4FastSmoothIndex=1', 'rendererV4SharedFlatCaps=1']),
  index: Object.freeze(['rendererV4FastSmoothIndex=1']),
  caps: Object.freeze(['rendererV4SharedFlatCaps=1']),
});

export function selectR7Candidate(args = []) {
  const indexOnly = args.includes('--isolate-index');
  const capsOnly = args.includes('--isolate-caps');
  if (indexOnly && capsOnly) {
    throw new Error('select at most one V4 isolation candidate');
  }
  const mode = indexOnly ? 'index' : capsOnly ? 'caps' : 'combined';
  return {
    mode,
    candidateName: {
      index: 'FastSmoothIndex-only',
      caps: 'SharedFlatCaps-only',
      combined: 'combined',
    }[mode],
    flags: [...R7_CANDIDATE_FLAGS[mode]],
    artifactSuffix: mode === 'combined' ? '' : '-' + mode + '-only',
  };
}

export const R7_ORDER = Object.freeze(['A', 'B', 'B', 'A']);


export function classifyR7CandidateActivation(mode, state) {
  if (!Object.hasOwn(R7_CANDIDATE_FLAGS, mode)) {
    throw new Error('unknown R7 candidate mode');
  }
  const indexVertices = Number(state?.fastIndexedVertices);
  const sourceVertices = Number(state?.fastOriginalVertices);
  const clonesAvoided = Number(state?.sharedFlatClonesAvoided);
  const indexActive =
    Number.isFinite(indexVertices) &&
    Number.isFinite(sourceVertices) &&
    indexVertices > 0 &&
    sourceVertices > indexVertices;
  const capsActive = Number.isFinite(clonesAvoided) && clonesAvoided > 0;
  const expectedIndex = mode === 'index' || mode === 'combined';
  const expectedCaps = mode === 'caps' || mode === 'combined';
  return {
    indexActive,
    capsActive,
    expectedIndex,
    expectedCaps,
    candidateExercised: (!expectedIndex || indexActive) && (!expectedCaps || capsActive),
  };
}

export function summarizeR7Abba(trials) {
  if (
    !Array.isArray(trials) ||
    trials.length !== R7_ORDER.length ||
    trials.some((trial, i) => trial?.policy !== R7_ORDER[i])
  ) {
    throw new Error('R7 requires exactly four fresh-context A-B-B-A trials');
  }
  const byPolicy = { A: [], B: [] };
  for (const trial of trials) {
    const values = trial.samples?.map((item) => item?.driverFinishWallMs);
    if (
      !Array.isArray(values) ||
      values.length < 2 ||
      !values.every((value) => Number.isFinite(value) && value > 0)
    ) {
      throw new Error('R7 requires at least two finite positive samples per trial');
    }
    byPolicy[trial.policy].push(...values);
  }
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const center = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[center] : (sorted[center - 1] + sorted[center]) / 2;
  };
  const baselineMedianMs = median(byPolicy.A);
  const candidateMedianMs = median(byPolicy.B);
  return {
    order: [...R7_ORDER],
    baselineMedianMs,
    candidateMedianMs,
    medianWallRatio: baselineMedianMs / candidateMedianMs,
    samplesPerPolicy: byPolicy.A.length,
    metric: 'browser input-to-next-frame plus gl.finish wall time, not pure GPU timer',
    hardwareAcceptable: false,
    gpuVramBytes: null,
  };
}

export const R7_PIXEL_PAIRS = Object.freeze([
  { pair: '1-2', kind: 'cross-policy' },
  { pair: '1-3', kind: 'cross-policy' },
  { pair: '1-4', kind: 'same-policy-A' },
  { pair: '2-3', kind: 'same-policy-B' },
  { pair: '2-4', kind: 'cross-policy' },
  { pair: '3-4', kind: 'cross-policy' },
]);

// Never blame candidate geometry for a cross-policy mismatch unless A/A
// and B/B fresh-context repeats are themselves exact-pixel repeatable.
export function summarizeR7PixelParity(comparisons) {
  if (
    !Array.isArray(comparisons) ||
    comparisons.length !== R7_PIXEL_PAIRS.length ||
    comparisons.some(
      (item, index) =>
        item?.pair !== R7_PIXEL_PAIRS[index].pair ||
        item.kind !== R7_PIXEL_PAIRS[index].kind ||
        typeof item.pixelIdentical !== 'boolean' ||
        !Number.isSafeInteger(item.differentPixels) ||
        item.differentPixels < 0 ||
        item.pixelIdentical !== (item.differentPixels === 0),
    )
  ) {
    throw new Error('R7 requires all six ordered ABBA pixel comparisons with exact counts');
  }
  const baselineRepeatable = comparisons[2].pixelIdentical;
  const candidateRepeatable = comparisons[3].pixelIdentical;
  const crossPolicyIdentical = [0, 1, 4, 5].every((index) => comparisons[index].pixelIdentical);
  return {
    baselineRepeatable,
    candidateRepeatable,
    crossPolicyIdentical,
    optimizationAttributionPossible: baselineRepeatable && candidateRepeatable,
    strictPixelParity: comparisons.every((item) => item.pixelIdentical),
    mismatchCount: comparisons.filter((item) => !item.pixelIdentical).length,
  };
}

export function classifyR7PixelSignatures(images) {
  if (
    !Array.isArray(images) ||
    images.length !== 4 ||
    images.some(
      (image) =>
        !Number.isSafeInteger(image?.width) ||
        !Number.isSafeInteger(image?.height) ||
        image.width <= 0 ||
        image.height <= 0 ||
        !image.rgba ||
        image.rgba.length !== image.width * image.height * 4 ||
        image.width !== images[0]?.width ||
        image.height !== images[0]?.height,
    )
  ) {
    throw new Error('R7 pixel classification requires four same-size RGBA frames in ABBA order');
  }
  const [a1, b1, b2, a2] = images.map((image) => image.rgba);
  let stablePolicyPixels = 0;
  let samePolicyDriftPixels = 0;
  let anyChangedPixels = 0;
  let stablePolicyMaxChannelDelta = 0;
  let stablePolicyMinX = images[0].width;
  let stablePolicyMinY = images[0].height;
  let stablePolicyMaxX = -1;
  let stablePolicyMaxY = -1;
  for (let pixel = 0; pixel < images[0].width * images[0].height; pixel++) {
    const offset = pixel * 4;
    let sameA = true;
    let sameB = true;
    let sameAB = true;
    let anyDifferent = false;
    let maxDelta = 0;
    for (let channel = 0; channel < 4; channel++) {
      const at = offset + channel;
      if (a1[at] !== a2[at]) sameA = false;
      if (b1[at] !== b2[at]) sameB = false;
      if (a1[at] !== b1[at]) sameAB = false;
      if (a1[at] !== b1[at] || a1[at] !== a2[at] || a1[at] !== b2[at]) {
        anyDifferent = true;
      }
      maxDelta = Math.max(maxDelta, Math.abs(a1[at] - b1[at]));
    }
    if (anyDifferent) anyChangedPixels++;
    if (!sameA || !sameB) samePolicyDriftPixels++;
    if (sameA && sameB && !sameAB) {
      stablePolicyPixels++;
      const x = pixel % images[0].width;
      const y = Math.floor(pixel / images[0].width);
      stablePolicyMinX = Math.min(stablePolicyMinX, x);
      stablePolicyMaxX = Math.max(stablePolicyMaxX, x);
      stablePolicyMinY = Math.min(stablePolicyMinY, y);
      stablePolicyMaxY = Math.max(stablePolicyMaxY, y);
      stablePolicyMaxChannelDelta = Math.max(stablePolicyMaxChannelDelta, maxDelta);
    }
  }
  return {
    totalPixels: images[0].width * images[0].height,
    anyChangedPixels,
    samePolicyDriftPixels,
    stablePolicyPixels,
    stablePolicyMaxChannelDelta,
    stablePolicyBoundingBox: stablePolicyPixels
      ? {
          minX: stablePolicyMinX,
          minY: stablePolicyMinY,
          maxX: stablePolicyMaxX,
          maxY: stablePolicyMaxY,
        }
      : null,
    strictPixelParity: anyChangedPixels === 0,
    interpretation: 'stable ABBA signature is associative evidence, not causal proof',
  };
}
