// R7 ABBA statistics are descriptive, never GPU timing or approval by themselves.
// Fixed A-B-B-A ordering mitigates monotonic warm-up but cannot remove driver drift.
export const R7_ORDER = Object.freeze(['A', 'B', 'B', 'A']);

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
