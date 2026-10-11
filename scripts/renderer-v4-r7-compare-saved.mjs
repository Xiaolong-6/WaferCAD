// Offline analysis of the four screenshots from an R7 run, including runs
// that exited on the first strict mismatch. No browser, server or GPU needed.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { compareScreenshotPngPixels } from './test-helpers/png-pixel-diff.mjs';
import {
  R7_ORDER,
  R7_PIXEL_PAIRS,
  summarizeR7Abba,
  summarizeR7PixelParity,
} from './test-helpers/renderer-r7-abba.mjs';

const ciSmoke = process.argv.includes('--ci-smoke');
const folder = new URL(
  ciSmoke
    ? '../test-results/renderer-v4-r7-ci-smoke/'
    : '../test-results/renderer-v4-r7-hardware-abba/',
  import.meta.url,
);
const labels = R7_ORDER.map((policy, index) => index + 1 + '-' + policy);
const report = JSON.parse(await readFile(new URL('report.json', folder), 'utf8'));
assert.equal(report.trials.length, 4, 'requires four completed independent contexts');
assert.deepEqual(
  report.trials.map((trial) => trial.label),
  labels,
  'requires correct A-B-B-A arm names',
);
const pngs = await Promise.all(labels.map((label) => readFile(new URL(label + '.png', folder))));
const comparisons = R7_PIXEL_PAIRS.map(({ pair, kind }) => {
  const [a, b] = pair.split('-').map((n) => Number(n) - 1);
  return { pair, kind, ...compareScreenshotPngPixels(pngs[a], pngs[b]) };
});
const parity = summarizeR7PixelParity(comparisons);
const descriptiveStats = summarizeR7Abba(report.trials);
const result = {
  source: 'saved-R7-ABBA-PNGs-no-new-GPU-measurement',
  mode: report.mode,
  backend: report.trials.map((trial) => trial.backend),
  summary: parity,
  comparisons,
  descriptiveStats,
  pixelGatePassed: parity.strictPixelParity,
  conclusions: {
    baselineHardwareRepeatable: parity.baselineRepeatable,
    candidateHardwareRepeatable: parity.candidateRepeatable,
    canAttributeCrossPolicyPixelChangesToOptimization: parity.optimizationAttributionPossible,
    pureGpuExecutionTimeMeasured: false,
    gpuVramMeasured: false,
  },
};
await writeFile(
  new URL('offline-parity-report.json', folder),
  JSON.stringify(result, null, 2) + '\n',
);
console.log('RENDERER_V4_R7_OFFLINE_PARITY', JSON.stringify(result));
if (!parity.strictPixelParity) process.exitCode = 1;
